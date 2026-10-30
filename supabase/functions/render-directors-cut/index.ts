import { resolveRequestUser } from "../_shared/internalAuth.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { appendWebhookToken } from "../_shared/webhook-auth.ts";
import { createClient } from "npm:@supabase/supabase-js@2.75.0";
import { AwsClient } from "npm:aws4fetch@1.0.18";
import { normalizeStartPayload, payloadDiagnostics } from "../_shared/remotion-payload.ts";
import { getLambdaFunctionName, AWS_REGION, DEFAULT_BUCKET_NAME, REMOTION_BUNDLE_BUCKET_NAME } from "../_shared/aws-lambda.ts";
import { detectQaServiceAuth } from "../_shared/qaServiceAuth.ts";
import { isQaMockRequest, qaMockResponse, qaMockJson } from "../_shared/qaMock.ts";
import { pickRenderTier, checkRenderAdmission } from "../_shared/render-concurrency.ts";
import { tl, withLang } from "../_shared/i18n.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE, PATCH',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-qa-mock, x-qa-real-spend, x-qa-user-id',
};

/**
 * Coerce any value to a finite number, falling back to `fallback` if NaN/Infinity/null.
 * Prevents the classic Lambda crash:
 *   "The 'from' prop of a sequence must be finite, but got NaN."
 */
function safeNum(value: unknown, fallback = 0): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Validate a scenes array. Returns { ok: false, reason } if any scene has
 * non-finite or negative timing that would brick the Remotion render.
 */
function validateScenes(scenes: unknown): { ok: true } | { ok: false; reason: string } {
  if (scenes == null) return { ok: true };
  if (!Array.isArray(scenes)) return { ok: false, reason: 'scenes must be an array' };
  for (let i = 0; i < scenes.length; i++) {
    const s: any = scenes[i];
    if (!s || typeof s !== 'object') {
      return { ok: false, reason: `scenes[${i}] is not an object` };
    }
    const start = s.start_time ?? s.startTime;
    const end = s.end_time ?? s.endTime;
    if (start != null && !Number.isFinite(Number(start))) {
      return { ok: false, reason: `scenes[${i}].start_time is not finite (${JSON.stringify(start)})` };
    }
    if (end != null && !Number.isFinite(Number(end))) {
      return { ok: false, reason: `scenes[${i}].end_time is not finite (${JSON.stringify(end)})` };
    }
  }
  return { ok: true };
}

// AWS Lambda configuration — shared constants prevent bundle/output bucket drift.
const LAMBDA_FUNCTION_NAME = getLambdaFunctionName();
const LAMBDA_START_TIMEOUT_MS = 25_000;

function normalizeRemotionServeUrl(rawServeUrl: string): string {
  try {
    const url = new URL(rawServeUrl);
    const bucketMatch = url.hostname.match(/^(remotionlambda-eucentral1-[^.]+)\.s3[.-]/i);
    const secretBucketName = bucketMatch?.[1];

    if (secretBucketName && secretBucketName !== REMOTION_BUNDLE_BUCKET_NAME) {
      const normalized = new URL(rawServeUrl);
      normalized.hostname = `${REMOTION_BUNDLE_BUCKET_NAME}.s3.${AWS_REGION}.amazonaws.com`;
      console.warn('[RenderDirectorsCut] Outdated REMOTION_SERVE_URL bucket detected — normalizing', {
        secretBucketName,
        canonicalBundleBucket: REMOTION_BUNDLE_BUCKET_NAME,
      });
      return normalized.toString();
    }
  } catch (error) {
    console.warn('[RenderDirectorsCut] Could not parse REMOTION_SERVE_URL, using raw value', error);
  }

  return rawServeUrl;
}

function isAbortLikeError(error: unknown): boolean {
  const anyErr = error as any;
  const message = String(anyErr?.message || error || '');
  return anyErr?.name === 'AbortError' || message.includes('aborted') || message.includes('signal timed out');
}

function mergeRenderConfig(existing: any, patch: Record<string, unknown>) {
  return {
    ...(existing && typeof existing === 'object' ? existing : {}),
    ...patch,
  };
}

async function refundRenderCreditsOnce(
  supabaseClient: any,
  renderJob: any,
  reason: string,
) {
  const creditsUsed = Number(renderJob?.credits_used || 0);
  if (!renderJob?.id || !renderJob?.user_id || !creditsUsed) return false;

  const { data: latest } = await supabaseClient
    .from('director_cut_renders')
    .select('render_config')
    .eq('id', renderJob.id)
    .maybeSingle();

  const latestConfig = (latest?.render_config as any) || renderJob.render_config || {};
  if (latestConfig?.credit_refund_done === true) return false;

  await supabaseClient.rpc('increment_balance', {
    p_user_id: renderJob.user_id,
    p_amount: creditsUsed,
  });

  await supabaseClient
    .from('director_cut_renders')
    .update({
      render_config: mergeRenderConfig(latestConfig, {
        credit_refund_done: true,
        credit_refunded_at: new Date().toISOString(),
        credit_refund_reason: reason,
        credits_used: creditsUsed,
      }),
      updated_at: new Date().toISOString(),
    })
    .eq('id', renderJob.id);

  console.log(`[RenderDirectorsCut] Refunded ${creditsUsed} credits for render ${renderJob.id}: ${reason}`);
  return true;
}

// Invoke Remotion Lambda directly via AWS API
async function invokeRemotionLambda(payload: any): Promise<{ renderId: string; bucketName: string }> {
  const aws = new AwsClient({
    accessKeyId: Deno.env.get('AWS_ACCESS_KEY_ID')!,
    secretAccessKey: Deno.env.get('AWS_SECRET_ACCESS_KEY')!,
    region: AWS_REGION,
  });

  const lambdaUrl = `https://lambda.${AWS_REGION}.amazonaws.com/2015-03-31/functions/${LAMBDA_FUNCTION_NAME}/invocations`;

  console.log(`🚀 Invoking Remotion Lambda via aws4fetch: ${LAMBDA_FUNCTION_NAME}`);
  
  const response = await aws.fetch(lambdaUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Amz-Invocation-Type': 'RequestResponse',
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(LAMBDA_START_TIMEOUT_MS),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Lambda invocation failed:', response.status, errorText);
    throw new Error(`Lambda invocation failed: ${response.status} - ${errorText}`);
  }

  const result = await response.json();
  
  // Check for Lambda function errors
  if (result.errorMessage || result.errorType) {
    console.error('Lambda function error:', result);
    throw new Error(result.errorMessage || 'Lambda function returned an error');
  }

  console.log('✅ Lambda response:', JSON.stringify(result));

  return {
    renderId: result.renderId,
    bucketName: result.bucketName,
  };
}

// Premium feature credit costs
const PREMIUM_CREDITS = {
  styleTransfer: 5,
  colorGrading: 3,
  upscaling: 10,
  interpolation: 8,
  restoration: 15,
  objectRemoval: 10,
  autoCut: 3,
  soundDesign: 5,
  beatSync: 2,
  smartCrop: 5,
  chromaKey: 3,
  transitions: 2,
  speedRamping: 2,
};

// Credit pricing based on duration, quality, and premium features
function calculateCredits(
  durationSeconds: number, 
  quality: string,
  premiumFeatures: {
    styleTransfer?: boolean;
    colorGrading?: boolean;
    upscaling?: boolean;
    interpolation?: boolean;
    restoration?: boolean;
    objectRemoval?: boolean;
    autoCut?: boolean;
    soundDesign?: boolean;
    beatSync?: boolean;
    smartCrop?: boolean;
    chromaKey?: boolean;
    transitions?: boolean;
    speedRamping?: boolean;
  } = {}
): number {
  let baseCredits: number;
  
  if (durationSeconds < 30) {
    baseCredits = 10;
  } else if (durationSeconds < 60) {
    baseCredits = 20;
  } else if (durationSeconds < 180) {
    baseCredits = 50;
  } else if (durationSeconds < 300) {
    baseCredits = 100;
  } else {
    baseCredits = 200;
  }
  
  // Quality multiplier
  const qualityMultiplier = quality === '4k' ? 2 : 1;
  let totalCredits = baseCredits * qualityMultiplier;
  
  // Add premium feature costs
  if (premiumFeatures.styleTransfer) totalCredits += PREMIUM_CREDITS.styleTransfer;
  if (premiumFeatures.colorGrading) totalCredits += PREMIUM_CREDITS.colorGrading;
  // Upscaling is no longer a render feature — real AI upscaling runs through
  // the `video-enhance` engine and is priced there. No charge here.
  if (premiumFeatures.interpolation) totalCredits += PREMIUM_CREDITS.interpolation;
  if (premiumFeatures.restoration) totalCredits += PREMIUM_CREDITS.restoration;
  if (premiumFeatures.objectRemoval) totalCredits += PREMIUM_CREDITS.objectRemoval;
  if (premiumFeatures.autoCut) totalCredits += PREMIUM_CREDITS.autoCut;
  if (premiumFeatures.soundDesign) totalCredits += PREMIUM_CREDITS.soundDesign;
  if (premiumFeatures.beatSync) totalCredits += PREMIUM_CREDITS.beatSync;
  if (premiumFeatures.smartCrop) totalCredits += PREMIUM_CREDITS.smartCrop;
  if (premiumFeatures.chromaKey) totalCredits += PREMIUM_CREDITS.chromaKey;
  if (premiumFeatures.transitions) totalCredits += PREMIUM_CREDITS.transitions;
  if (premiumFeatures.speedRamping) totalCredits += PREMIUM_CREDITS.speedRamping;
  
  return totalCredits;
}

serve((req: Request) => withLang(req, () => (async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  if (isQaMockRequest(req)) return qaMockJson(corsHeaders, { name: "render-directors-cut" });


  let activeRenderJob: any = null;
  let activeCreditsNeeded = 0;
  let creditsDeducted = false;
  let supabaseClient: any = null;

  try {
    supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    // Verify user (with QA service-auth shortcut)
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const qaSvc = detectQaServiceAuth(req);
    let user: { id: string } | null = null;
    if (qaSvc.isQaService && qaSvc.userId) {
      user = { id: qaSvc.userId };
      console.log(`[render-directors-cut] QA service-auth user=${user.id}`);
    } else if ((await resolveRequestUser(req, { auth: { getUser: async () => ({ data: { user: null } }) } }))?.id) {
      // Assembly worker: service key + x-agent-user-id (see _shared/internalAuth.ts). No user token path change.
      user = await resolveRequestUser(req, { auth: { getUser: async () => ({ data: { user: null } }) } });
    } else {
      const token = authHeader.replace('Bearer ', '');
      const { data: { user: jwtUser }, error: authError } = await supabaseClient.auth.getUser(token);
      if (authError || !jwtUser) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      user = jwtUser;
    }

    const { 
      project_id,
      source_video_url,
      effects,
      audio_settings,
      export_settings,
      voiceover_url,
      background_music_url,
      duration_seconds,
      // Premium features
      style_transfer,
      color_grading,
      speed_keyframes,
      chroma_key,
      transitions,
      scenes,
      sound_design,
      upscaling,
      interpolation,
      restoration,
      object_removal,
      auto_cut,
      beat_sync,
      smart_crop,
      // Text overlays and subtitles
      text_overlays,
      subtitle_track,
      // Ken Burns
      ken_burns_keyframes,
      // Scene color grading
      scene_color_grading,
      // Scene-specific effects (per-scene filters, brightness, etc.)
      scene_effects,
      // Subtitle Safe Zone (hard crop)
      subtitle_safe_zone,
      // QA stability hint: forces single-Lambda render to avoid AWS concurrency
      // collisions when triggered from the Deep Sweep alongside other Lambda jobs.
      qa_stability_mode,
      max_lambda_workers,
      // Timeline audio tracks (SFX, extra VO/music clips beyond the legacy singletons)
      audio_tracks,
    } = await req.json();

    if (!source_video_url) {
      return new Response(JSON.stringify({ error: 'Missing source_video_url' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Hard guard: reject malformed scene timing before invoking Lambda.
    // This prevents the recurring crash "The 'from' prop of a sequence must be finite, but got NaN".
    const scenesCheck = validateScenes(scenes);
    if (!scenesCheck.ok) {
      console.error(`[RenderDirectorsCut] Rejected: ${scenesCheck.reason}`);
      return new Response(
        JSON.stringify({ error: 'Invalid scenes payload', detail: scenesCheck.reason }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    if (duration_seconds != null && !Number.isFinite(Number(duration_seconds))) {
      return new Response(
        JSON.stringify({ error: 'Invalid duration_seconds', detail: `got ${JSON.stringify(duration_seconds)}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Normalize subtitle clips and text overlays to camelCase before passing to
    // the Remotion composition (DirectorsCutVideo.tsx reads .startTime/.endTime).
    // Snake_case (start_time/end_time) callers would otherwise cause NaN sequence
    // bounds → Lambda crash "The 'from' prop of a sequence must be finite".
    if (subtitle_track?.clips?.length) {
      subtitle_track.clips = subtitle_track.clips.map((c: any, i: number) => ({
        ...c,
        id: c.id ?? `clip-${i}`,
        text: c.text ?? '',
        startTime: Number(c.startTime ?? c.start_time ?? 0),
        endTime: Number(c.endTime ?? c.end_time ?? 0),
      }));
    }
    if (Array.isArray(text_overlays) && text_overlays.length) {
      for (let i = 0; i < text_overlays.length; i++) {
        const o: any = text_overlays[i];
        text_overlays[i] = {
          ...o,
          id: o.id ?? `overlay-${i}`,
          startTime: Number(o.startTime ?? o.start_time ?? 0),
          endTime: o.endTime ?? o.end_time != null ? Number(o.endTime ?? o.end_time) : undefined,
        };
      }
    }

    console.log(`[RenderDirectorsCut] Starting render for user ${user.id}, project ${project_id}`);
    console.log(`[RenderDirectorsCut] Received effects:`, JSON.stringify(effects));
    console.log(`[RenderDirectorsCut] Filter value:`, effects?.filter);
    console.log(`[RenderDirectorsCut] Scene effects:`, JSON.stringify(scene_effects));
    console.log(`[RenderDirectorsCut] Subtitle track:`, JSON.stringify(subtitle_track));
    console.log(`[RenderDirectorsCut] Subtitle track clips count:`, subtitle_track?.clips?.length ?? 0);
    console.log(`[RenderDirectorsCut] Subtitle track visible:`, subtitle_track?.visible);
    if (subtitle_track?.clips?.length > 0) {
      console.log(`[RenderDirectorsCut] First subtitle clip:`, JSON.stringify(subtitle_track.clips[0]));
    }
    console.log(`[RenderDirectorsCut] Text overlays:`, JSON.stringify(text_overlays));

    const duration = Math.max(safeNum(duration_seconds, 30), 0.1);
    const quality = export_settings?.quality || 'hd';
    const format = export_settings?.format || 'mp4';

    // Determine which premium features are enabled
    const premiumFeatures = {
      styleTransfer: style_transfer?.enabled || false,
      colorGrading: color_grading?.enabled || false,
      upscaling: upscaling?.enabled || false,
      interpolation: interpolation?.enabled || false,
      restoration: restoration?.enabled || false,
      objectRemoval: object_removal?.enabled || false,
      autoCut: auto_cut?.enabled || false,
      soundDesign: sound_design?.enabled || false,
      beatSync: beat_sync?.enabled || false,
      smartCrop: smart_crop?.enabled || false,
      chromaKey: chroma_key?.enabled || false,
      transitions: transitions && transitions.length > 0,
      speedRamping: speed_keyframes && speed_keyframes.length > 0,
    };

    // Calculate credits with premium features
    const creditsNeeded = 0; // v428: rendering is free
    void calculateCredits;
    activeCreditsNeeded = creditsNeeded;

    // Lambda slot admission — safety net so Founders keep priority under load.
    try {
      const estFrames = Math.max(30, Math.round(duration * 30));
      const tier = pickRenderTier(estFrames);
      const { data: isFounder } = await supabaseClient.rpc('is_active_founder', { _user_id: user.id });
      const admission = await checkRenderAdmission({
        supabaseAdmin: supabaseClient,
        isFounder: !!isFounder,
        tierMaxWorkers: tier.maxWorkers,
      });
      if (!admission.admitted) {
        console.warn(`[RenderDirectorsCut] admission denied: ${admission.reason} used=${admission.usedWorkers}/${admission.slotBudget} founder=${!!isFounder}`);
        return new Response(JSON.stringify({
          error: 'RENDER_SLOT_BUSY',
          reason: admission.reason,
          used_workers: admission.usedWorkers,
          slot_budget: admission.slotBudget,
          retry_after_seconds: admission.retryAfterSeconds,
          founders_only: admission.reason === 'founder_reserve',
        }), {
          status: 429,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
            'Retry-After': String(admission.retryAfterSeconds),
          },
        });
      }
    } catch (admissionErr) {
      console.error('[RenderDirectorsCut] admission check threw, admitting:', admissionErr);
    }


    // v428: no wallet check — rendering is included in every plan.


    // Create render job record in director_cut_renders table
    const { data: renderJob, error: renderError } = await supabaseClient
      .from('director_cut_renders')
      .insert({
        user_id: user.id,
        project_id,
        source_video_url,
        status: 'queued',
        effects_config: effects || {},
        audio_config: audio_settings || {},
        premium_features: premiumFeatures,
        render_config: {
          voiceoverUrl: voiceover_url,
          backgroundMusicUrl: background_music_url,
          durationSeconds: duration,
          styleTransfer: style_transfer,
          colorGrading: color_grading,
          speedKeyframes: speed_keyframes,
          chromaKey: chroma_key,
          transitions,
          scenes,
          soundDesign: sound_design,
          upscaling,
          interpolation,
          restoration,
          objectRemoval: object_removal,
          autoCut: auto_cut,
          beatSync: beat_sync,
          smartCrop: smart_crop,
          exportSettings: export_settings,
          textOverlays: text_overlays,
          subtitleTrack: subtitle_track,
          kenBurnsKeyframes: ken_burns_keyframes,
          sceneColorGrading: scene_color_grading,
        },
        credits_used: creditsNeeded,
      })
      .select()
      .single();

    if (renderError) {
      console.error('[RenderDirectorsCut] Error creating render job:', renderError);
      throw new Error('Failed to create render job');
    }
    activeRenderJob = renderJob;
    const renderOutName = `directors-cut-${renderJob.id}.${format === 'webm' ? 'webm' : 'mp4'}`;

    // v428: Director's Cut rendering (incl. premium effects) is free.
    creditsDeducted = false;


    // Calculate dimensions based on aspect ratio and quality
    let width: number, height: number;
    const aspectRatio = export_settings?.aspect_ratio || '16:9';

    // 8K is only viable for short clips — beyond that a single lambda chunk
    // runs into the 600s timeout. Fall back to 4K instead of failing.
    const requestedQuality = quality;
    const effectiveQuality = (quality === '8k' && duration > 30) ? '4k' : quality;
    if (effectiveQuality !== requestedQuality) {
      console.warn(`[RenderDirectorsCut] 8K requested for ${duration}s clip — downgrading to 4K`);
    }

    if (effectiveQuality === '8k') {
      if (aspectRatio === '9:16') {
        width = 4320; height = 7680;
      } else if (aspectRatio === '1:1') {
        width = 4320; height = 4320;
      } else {
        width = 7680; height = 4320;
      }
    } else if (effectiveQuality === '4k') {
      if (aspectRatio === '9:16') {
        width = 2160; height = 3840;
      } else if (aspectRatio === '1:1') {
        width = 2160; height = 2160;
      } else {
        width = 3840; height = 2160;
      }
    } else {
      if (aspectRatio === '9:16') {
        width = 1080; height = 1920;
      } else if (aspectRatio === '1:1') {
        width = 1080; height = 1080;
      } else {
        width = 1920; height = 1080;
      }
    }

    // Update render job to processing
    await supabaseClient
      .from('director_cut_renders')
      .update({
        status: 'processing',
        started_at: new Date().toISOString(),
        render_config: mergeRenderConfig(renderJob.render_config, {
          ...(renderJob.render_config || {}),
          credits_used: creditsNeeded,
          tracking_mode: 'lambda-start',
          out_name: renderOutName,
          lambda_function_name: LAMBDA_FUNCTION_NAME,
          lambda_invoked_at: new Date().toISOString(),
          failure_stage: null,
        }),
      })
      .eq('id', renderJob.id);

    // Get Remotion configuration
    const rawRemotionServeUrl = Deno.env.get('REMOTION_SERVE_URL');
    if (!rawRemotionServeUrl) {
      console.error('[RenderDirectorsCut] REMOTION_SERVE_URL not configured');
      throw new Error('REMOTION_SERVE_URL not configured');
    }
    const REMOTION_SERVE_URL = normalizeRemotionServeUrl(rawRemotionServeUrl);

    // ✅ BUNDLE VERSION CHECK — fetch bundle-version.json to verify freshness
    const EXPECTED_BUNDLE_VERSION = 'v2026-04-13e-unified-subtitle-renderer';
    let bundleVersionOk = false;
    try {
      const versionUrl = REMOTION_SERVE_URL.replace(/\/index\.html$/, '/bundle-version.json');
      const versionRes = await fetch(versionUrl, { signal: AbortSignal.timeout(5000) });
      if (versionRes.ok) {
        const versionData = await versionRes.json();
        console.log(`[RenderDirectorsCut] 🔖 Bundle version: ${versionData.version}, built: ${versionData.built_at}`);
        if (versionData.version === EXPECTED_BUNDLE_VERSION) {
          bundleVersionOk = true;
        } else {
          console.warn(`[RenderDirectorsCut] ⚠️ BUNDLE VERSION MISMATCH! Expected: ${EXPECTED_BUNDLE_VERSION}, Got: ${versionData.version}`);
        }
      } else {
        console.warn(`[RenderDirectorsCut] ⚠️ Could not fetch bundle-version.json: ${versionRes.status}`);
      }
    } catch (e) {
      console.warn(`[RenderDirectorsCut] ⚠️ Bundle version check failed:`, e);
    }
    console.log(`[RenderDirectorsCut] 🔖 Bundle version verified: ${bundleVersionOk} (expected: ${EXPECTED_BUNDLE_VERSION})`);

    const webhookUrl = appendWebhookToken(`${Deno.env.get('SUPABASE_URL')}/functions/v1/remotion-webhook`);
    const fps = 30;
    const durationInFrames = Math.max(Math.ceil(duration * fps), 1);

    console.log(`[RenderDirectorsCut] 🔗 REMOTION_SERVE_URL: ${REMOTION_SERVE_URL}`);
    console.log(`[RenderDirectorsCut] 🎬 Subtitle meta — clips: ${subtitle_track?.clips?.length ?? 0}, visible: ${subtitle_track?.visible}, firstText: "${subtitle_track?.clips?.[0]?.text?.substring(0, 40) ?? 'NONE'}"` );
    console.log(`[RenderDirectorsCut] Duration: ${duration}s, Frames: ${durationInFrames}, Resolution: ${width}x${height}`);

    // Transform scenes from snake_case to camelCase for Remotion
    const transformedScenes = scenes?.map((scene: any) => ({
      id: scene.id,
      startTime: safeNum(scene.start_time ?? scene.startTime, 0),
      endTime: safeNum(scene.end_time ?? scene.endTime, 0),
      originalStartTime: safeNum(
        scene.original_start_time ?? scene.originalStartTime ?? scene.start_time ?? scene.startTime,
        0
      ),
      originalEndTime: safeNum(
        scene.original_end_time ?? scene.originalEndTime ?? scene.end_time ?? scene.endTime,
        0
      ),
      mediaSourceStart: scene.media_source_start != null || scene.mediaSourceStart != null
        ? safeNum(scene.media_source_start ?? scene.mediaSourceStart, 0)
        : undefined,
      mediaSourceEnd: scene.media_source_end != null || scene.mediaSourceEnd != null
        ? safeNum(scene.media_source_end ?? scene.mediaSourceEnd, scene.additional_media?.duration ?? scene.additionalMedia?.duration ?? scene.end_time ?? scene.endTime ?? 0)
        : undefined,
      playbackRate: safeNum(scene.playbackRate ?? scene.playback_rate, 1),
      description: scene.description,
      mood: scene.mood,
      effects: scene.effects,
      additionalMedia: scene.additional_media ?? scene.additionalMedia,
      sourceMode: scene.source_mode ?? scene.sourceMode,
      isFromOriginalVideo: scene.is_from_original_video ?? scene.isFromOriginalVideo ?? true,
    }));

    // Transform transitions — preserve sceneId and offsetSeconds for parity with preview
    const transformedTransitions = transitions?.map((t: any, index: number) => ({
      sceneIndex: Number.isFinite(Number(t.sceneIndex)) ? Number(t.sceneIndex) : index,
      sceneId: t.sceneId ?? null,
      type: t.transitionType ?? t.type ?? 'crossfade',
      duration: safeNum(t.duration, 0.5),
      offsetSeconds: safeNum(t.offsetSeconds, 0),
    }));

    // Build inputProps for DirectorsCutVideo composition
    const inputProps = {
      // Source video
      sourceVideoUrl: source_video_url,
      // Basic effects
      brightness: effects?.brightness || 100,
      contrast: effects?.contrast || 100,
      saturation: effects?.saturation || 100,
      sharpness: effects?.sharpness || 0,
      temperature: effects?.temperature || 0,
      vignette: effects?.vignette || 0,
      filter: effects?.filter,
      // Style Transfer
      styleTransfer: style_transfer?.enabled ? {
        enabled: true,
        style: style_transfer.style,
        intensity: style_transfer.intensity || 0.8,
      } : undefined,
      // Color Grading
      colorGrading: color_grading?.enabled ? {
        enabled: true,
        grade: color_grading.grade,
        intensity: color_grading.intensity || 0.8,
      } : undefined,
      // Scene-specific color grading
      sceneColorGrading: scene_color_grading,
      // Scene-specific effects (per-scene filters, brightness, etc.)
      sceneEffects: scene_effects,
      // Speed Ramping
      speedKeyframes: speed_keyframes,
      // Ken Burns (renamed from kenBurnsKeyframes)
      kenBurns: ken_burns_keyframes,
      // Chroma Key
      chromaKey: chroma_key?.enabled ? {
        enabled: true,
        color: chroma_key.color,
        tolerance: chroma_key.tolerance || 50,
        edgeSoftness: chroma_key.edge_softness || 0,
        spillSuppression: chroma_key.spill_suppression || 0,
        backgroundUrl: chroma_key.background_url,
      } : undefined,
      // Transitions (transformed)
      transitions: transformedTransitions,
      // Scenes (transformed to camelCase)
      scenes: transformedScenes,
      // Text overlays
      textOverlays: text_overlays,
      // Subtitles
      subtitleTrack: subtitle_track,
      // Audio settings
      masterVolume: audio_settings?.master_volume || 100,
      noiseReduction: audio_settings?.noise_reduction || false,
      voiceEnhancement: audio_settings?.voice_enhancement || false,
      voiceoverUrl: voiceover_url,
      voiceoverVolume: audio_settings?.voiceover_volume || 100,
      backgroundMusicUrl: background_music_url,
      backgroundMusicVolume: audio_settings?.background_music_volume || 30,
      // Full timeline audio (SFX + extra clips) — Remotion renders each clip
      // as its own <Audio> so nothing is silently dropped (audit C1).
      audioTracks: Array.isArray(audio_tracks) ? audio_tracks : undefined,
      // Sound Design
      soundDesign: sound_design?.enabled ? {
        enabled: true,
        ambientUrl: sound_design.ambient_url,
        ambientVolume: sound_design.ambient_volume || 20,
        sfxTracks: sound_design.sfx_tracks || [],
      } : undefined,
      // Subtitle Safe Zone (hard crop for burned-in subtitles)
      subtitleSafeZone: subtitle_safe_zone?.enabled ? {
        enabled: true,
        zoom: subtitle_safe_zone.zoom,
        offsetY: subtitle_safe_zone.offsetY,
        bottomBandPercent: subtitle_safe_zone.bottomBandPercent,
      } : undefined,
      // Duration and dimensions
      durationInSeconds: duration,
      targetWidth: width,
      targetHeight: height,
    };

    console.log(`[RenderDirectorsCut] inputProps:`, JSON.stringify(inputProps, null, 2));

    // Add durationInFrames to inputProps for composition
    const finalInputProps = {
      ...inputProps,
      durationInFrames,
      fps,
    };

    // Retry configuration for AWS Concurrency limits
    const MAX_RETRIES = 3;
    const INITIAL_DELAY_MS = 5000; // 5 seconds
    
    let response: { renderId: string; bucketName: string } | null = null;
    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        console.log(`[RenderDirectorsCut] Attempt ${attempt + 1}/${MAX_RETRIES} - Invoking Remotion Lambda`);
        
        // Build and normalize Remotion Lambda payload with all required v4.0.424 fields
        console.log('[RenderDirectorsCut] 🔄 Normalizing payload for Remotion 4.0.424');
        const serializedInputProps = {
          type: 'payload' as const,
          payload: JSON.stringify(finalInputProps),
        };

        // Concurrency policy: QA stability mode pins to 1 Lambda worker.
        // Otherwise use tiered maxWorkers 3/5/8/12 → framesPerLambda (min 120)
        // so exports share the 60-slot Lambda pool with concurrent renders.
        let effectiveFpl: number | undefined;
        if (qa_stability_mode || max_lambda_workers === 1) {
          effectiveFpl = Math.max(durationInFrames, 1);
          console.log(`[RenderDirectorsCut] 🛡️ QA stability — single-Lambda (framesPerLambda=${effectiveFpl})`);
        } else {
          const tier = pickRenderTier(durationInFrames);
          effectiveFpl = tier.framesPerLambda;
          console.log(`[RenderDirectorsCut] 🎬 tier=${tier.label}, maxWorkers=${tier.maxWorkers}, framesPerLambda=${effectiveFpl}`);
        }

        // Encoder speed scales with resolution: at 4K/8K the 'slow' preset is
        // the dominant cost per frame. Quality intermediates (lossless PNG,
        // BT.709, crf 16) stay untouched — Raw-Media-Invariant holds.
        const x264Preset = height >= 4320 || width >= 7680
          ? 'faster'
          : (height >= 2160 || width >= 3840 ? 'medium' : 'slow');
        const videoBitrate = height >= 4320 || width >= 7680
          ? '100M'
          : (height >= 2160 || width >= 3840 ? '40M' : '10M');
        console.log(`[RenderDirectorsCut] 🎚️ ${width}x${height} → x264Preset=${x264Preset}, videoBitrate=${videoBitrate}`);

        const lambdaPayload = normalizeStartPayload({
          type: 'start',
          serveUrl: REMOTION_SERVE_URL,
          composition: 'DirectorsCutVideo',
          inputProps: serializedInputProps,
          codec: format === 'webm' ? 'vp8' : 'h264',
          // Raw-Media-Invariant: lossless PNG frame intermediates (no JPEG
          // chroma-subsampling loss) + BT.709 tagging to match the source.
          imageFormat: 'png',
          colorSpace: 'bt709',
          crf: 16,
          x264Preset,
          videoBitrate,
          maxRetries: 1,
          ...(effectiveFpl ? { framesPerLambda: effectiveFpl } : {}),
          privacy: 'public',
          bucketName: DEFAULT_BUCKET_NAME,
          durationInFrames,
          fps,
          width,
          height,
          webhook: {
            url: webhookUrl,
            secret: null,
            customData: {
              render_job_id: renderJob.id,
              source: 'directors-cut',
              user_id: user.id,
            },
          },
          overwrite: true,
          outName: renderOutName,
        });

        console.log('🔧 Normalized payload diagnostics:', JSON.stringify(payloadDiagnostics(lambdaPayload)));

        // Invoke Lambda directly via aws4fetch
        response = await invokeRemotionLambda(lambdaPayload);
        
        // Success - break out of retry loop
        console.log(`[RenderDirectorsCut] Lambda invocation successful on attempt ${attempt + 1}`);
        break;
        
      } catch (error) {
        lastError = error as Error;
        const errorMessage = lastError.message || '';
        
        // Check if it's a rate limit / concurrency error
        const isRateLimitError = 
          errorMessage.includes('Rate Exceeded') || 
          errorMessage.includes('Concurrency limit') ||
          errorMessage.includes('TooManyRequestsException') ||
          errorMessage.includes('ThrottlingException');
        
        if (isRateLimitError && attempt < MAX_RETRIES - 1) {
          const delayMs = INITIAL_DELAY_MS * Math.pow(2, attempt);
          console.log(`[RenderDirectorsCut] Rate limit hit, retrying in ${delayMs}ms (attempt ${attempt + 1}/${MAX_RETRIES})`);
          await new Promise(resolve => setTimeout(resolve, delayMs));
          continue;
        }
        
        // If not a rate limit error or we've exhausted retries, throw
        throw lastError;
      }
    }
    
    // If we exited the loop without a response, throw the last error
    if (!response) {
      // Refund credits before failing
      await refundRenderCreditsOnce(supabaseClient, renderJob, 'rate_limit_exhausted');
      console.log(`[RenderDirectorsCut] Credits refunded due to rate limit exhaustion`);
      
      // Update render status to failed
      await supabaseClient
        .from('director_cut_renders')
        .update({ 
          status: 'failed',
          error_message: tl({ de: 'AWS Render-Kapazität vorübergehend erschöpft. Bitte versuche es in 1-2 Minuten erneut.', en: 'AWS render capacity temporarily exhausted. Please try again in 1-2 minutes.', es: 'Capacidad de renderizado de AWS temporalmente agotada. Por favor, inténtalo de nuevo en 1-2 minutos.' }),
          completed_at: new Date().toISOString(),
          render_config: mergeRenderConfig(renderJob.render_config, {
            ...(renderJob.render_config || {}),
            credits_used: creditsNeeded,
            credit_refund_done: true,
            credit_refund_reason: 'rate_limit_exhausted',
            failure_stage: 'lambda_start',
            error_category: 'rate_limit',
          }),
        })
        .eq('id', renderJob.id);
      
      return new Response(JSON.stringify({ 
        error: 'RATE_LIMIT_EXCEEDED',
        message: tl({ de: 'Momentan werden viele Videos gerendert. Bitte versuche es in 1-2 Minuten erneut.', en: 'Many videos are currently being rendered. Please try again in 1-2 minutes.', es: 'Actualmente se están renderizando muchos videos. Por favor, inténtalo de nuevo en 1-2 minutos.' }),
        retry_after_seconds: 60,
      }), {
        status: 429,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const renderId = response.renderId;
    const bucketName = response.bucketName;

    console.log(`[RenderDirectorsCut] Remotion Lambda started. renderId: ${renderId}, bucketName: ${bucketName}`);

    // Update render job with Remotion IDs
    await supabaseClient
      .from('director_cut_renders')
      .update({ 
        remotion_render_id: renderId,
        bucket_name: bucketName,
        status: 'rendering',
        render_config: mergeRenderConfig(renderJob.render_config, {
          ...(renderJob.render_config || {}),
          credits_used: creditsNeeded,
          tracking_mode: 'remotion_render_id',
          out_name: renderOutName,
          bucket_name: bucketName,
          lambda_function_name: LAMBDA_FUNCTION_NAME,
          lambda_invoked_at: new Date().toISOString(),
          remotion_render_id: renderId,
          failure_stage: null,
        }),
      })
      .eq('id', renderJob.id);

    console.log(`[RenderDirectorsCut] Render job updated: ${renderJob.id}`);

    return new Response(JSON.stringify({
      ok: true,
      render_id: renderJob.id,
      remotion_render_id: renderId,
      credits_used: creditsNeeded,
      estimated_time_seconds: duration * 2,
      message: tl({ de: 'Rendering gestartet. Du wirst benachrichtigt, wenn das Video fertig ist.', en: 'Rendering started. You will be notified when the video is ready.', es: 'Renderizado iniciado. Se te notificará cuando el video esté listo.' }),
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[RenderDirectorsCut] Error:', error);
    const rawMessage = (error as Error)?.message || 'Unknown render error';
    const startTimedOut = isAbortLikeError(error);
    const message = startTimedOut
      ? tl({ de: 'Render konnte nicht gestartet werden: AWS Lambda hat innerhalb der Start-Frist keine Render-ID zurückgegeben. Credits wurden automatisch zurückerstattet.', en: 'Render could not be started: AWS Lambda did not return a render ID within the start deadline. Credits have been automatically refunded.', es: 'No se pudo iniciar el renderizado: AWS Lambda no devolvió un ID de renderizado dentro del plazo de inicio. Los créditos han sido reembolsados automáticamente.' })
      : rawMessage;

    if (activeRenderJob?.id) {
      try {
        if (creditsDeducted) {
          await refundRenderCreditsOnce(supabaseClient, activeRenderJob, startTimedOut ? 'lambda_start_timeout' : 'lambda_start_failed');
        }
        const { data: latest } = await supabaseClient
          .from('director_cut_renders')
          .select('render_config')
          .eq('id', activeRenderJob.id)
          .maybeSingle();
        const latestConfig = (latest?.render_config as any) || activeRenderJob.render_config || {};
        await supabaseClient
          .from('director_cut_renders')
          .update({
            status: 'failed',
            error_message: message,
            completed_at: new Date().toISOString(),
            render_config: mergeRenderConfig(latestConfig, {
              credits_used: activeCreditsNeeded,
              failure_stage: 'lambda_start',
              error_category: startTimedOut ? 'start_timeout' : 'start_failed',
              raw_error_message: rawMessage,
              lambda_function_name: LAMBDA_FUNCTION_NAME,
            }),
          })
          .eq('id', activeRenderJob.id);
      } catch (updateError) {
        console.error('[RenderDirectorsCut] Failed to mark render as failed/refunded:', updateError);
      }
    }

    return new Response(JSON.stringify({
      error: message,
      code: startTimedOut ? 'LAMBDA_START_TIMEOUT' : 'RENDER_START_FAILED',
      stage: 'lambda_start',
    }), {
      status: startTimedOut ? 504 : 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
})(req)));

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import Replicate from "npm:replicate@0.25.2";
import { requireMediaOrigin, privateMediaReference, signOwnedMediaPreview } from "../_shared/privateMedia.ts";
import { buildReplicateGptImageInput, REPLICATE_GPT_IMAGE_MODEL } from "../_shared/replicateGptImage.ts";
import { isQaMockRequest, qaMockResponse } from "../_shared/qaMock.ts"; // [qa-mock-injected]
import {
  capabilityFor,
  closestAspectRatioFor,
  resolveSize,
} from "../_shared/pictureModelCapabilities.ts";
import { readImageDimensions } from "../_shared/imageDimensions.ts";
import {
  PICTURE_FALLBACK_TIER,
  PICTURE_SPECIALIST_PREMIUM_REQUIRED,
  isPictureStudioPremiumEntitled,
  isSpecialistTier,
} from "../_shared/picture-studio-premium.ts";
import { SOURCE_FORMAT } from "../_shared/pictureFormatResolution.ts";
import { persistStudioImage } from "../_shared/studio-image-persist.ts";
import {
  buildPictureRequest,
  blockingNotice,
  supportsTransparency,
} from "../_shared/picturePromptBuilder.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS, PUT, DELETE, PATCH",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-qa-mock",
};

// Customer pricing per image (≥30% margin over Replicate cost)
// Seedream 4: ~$0.030 → €0.04
// Imagen 4 Ultra: ~$0.060 → €0.08
// Nano Banana 2: ~$0.067-0.151 → €0.20 (worst-case calculated)
const IMAGE_PRICING: Record<string, Record<string, number>> = {
  fast: { EUR: 0.04, USD: 0.04 },
  pro: { EUR: 0.08, USD: 0.08 },
  ultra: { EUR: 0.20, USD: 0.20 },
  gptimage: { EUR: 0.08, USD: 0.08 },
  flux: { EUR: 0.10, USD: 0.10 },
  ideogram: { EUR: 0.06, USD: 0.06 },
  recraft: { EUR: 0.06, USD: 0.06 },
  qwen: { EUR: 0.03, USD: 0.03 },
};

const REPLICATE_MODELS: Record<string, `${string}/${string}` | `${string}/${string}:${string}`> = {
  fast: 'bytedance/seedream-4',
  gptimage: REPLICATE_GPT_IMAGE_MODEL,
  pro: 'google/imagen-4-ultra',
  ultra: 'google/nano-banana',
  flux: 'black-forest-labs/flux-1.1-pro-ultra',
  ideogram: 'ideogram-ai/ideogram-v3-turbo',
  recraft: 'recraft-ai/recraft-v3',
  qwen: 'qwen/qwen-image',
};

interface GenerateRequest {
  prompt: string;
  tier: 'fast' | 'pro' | 'ultra' | 'gptimage' | 'flux' | 'ideogram' | 'recraft' | 'qwen';

  /** Legacy field; `requestedFormat` wins when both are present. */
  aspectRatio?: string;
  /** What the customer asked for — including the sentinel "source". */
  requestedFormat?: string;
  /** Browser-reported size of reference #1. Advisory only; never trusted. */
  sourceDimensions?: { width: number; height: number };
  referenceImageUrl?: string;     // Subject reference (image-to-image, legacy single)
  referenceImageUrls?: string[];  // Subject references (multi-reference models)
  styleReferenceUrl?: string;     // Style reference (legacy single)
  styleReferenceUrls?: string[];  // Style references (multi-reference models)
  /** Exact pixel size — only honored by models with `sizing.kind === 'exact'`. */
  width?: number;
  height?: number;
  /** Provider-native output option (for example 2K or optimize_for_quality). */
  resolution?: string;
  mode?: 'create' | 'transform' | 'restyle' | 'mix';
  strength?: number;
  style?: string;
  /** Only honoured by models that really return an alpha channel. */
  transparentBackground?: boolean;
  brandKit?: {
    name?: string;
    primaryColor?: string;
    secondaryColor?: string;
    accentColor?: string;
    mood?: string;
    keywords?: string[];
    styleDirection?: string;
    targetAudience?: string;
    brandTone?: string;
    logoUrl?: string;
  } | null;
}

/**
 * Style presets, brand-kit wording and the reference clauses live in
 * `_shared/picturePromptBuilder.ts` — the exact module the Picture Studio UI
 * uses for its "what we send" disclosure.
 */

/**
 * Ratios, pixel presets and reference-image limits are NOT maintained here
 * anymore — `_shared/pictureModelCapabilities.ts` is the single source of
 * truth shared with the Picture Studio UI.
 */
function mapAspectRatio(tier: string, requested: string): string {
  return closestAspectRatioFor(tier, requested);
}


serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Bond QA Agent: short-circuit on x-qa-mock header (no provider call, no credits)
  if (isQaMockRequest(req)) {
    return qaMockResponse({ corsHeaders, kind: "image" });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? ""
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const body = await req.json() as GenerateRequest;
    const { prompt, tier, aspectRatio = '1:1', referenceImageUrl, styleReferenceUrl, style = 'realistic', brandKit, mode = 'create' } = body;

    if (!prompt?.trim()) {
      return new Response(
        JSON.stringify({ error: "Prompt is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (!IMAGE_PRICING[tier]) {
      return new Response(
        JSON.stringify({ error: "Invalid tier. Use fast, pro, or ultra." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Subscription gate BEFORE pricing, wallet mutation, provider call and job creation.
    if (isSpecialistTier(tier)) {
      const entitled = await isPictureStudioPremiumEntitled(
        supabaseAdmin,
        user.id,
        (key) => Deno.env.get(key) ?? undefined,
      );
      if (!entitled) {
        return new Response(
          JSON.stringify({
            error: "Specialist models require an active subscription.",
            code: PICTURE_SPECIALIST_PREMIUM_REQUIRED,
            fallbackTier: PICTURE_FALLBACK_TIER,
          }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Wallet currency + balance
    const { data: wallet, error: walletError } = await supabaseAdmin
      .from('ai_video_wallets')
      .select('balance_euros, currency')
      .eq('user_id', user.id)
      .single();

    if (walletError || !wallet) {
      return new Response(
        JSON.stringify({
          error: "No AI Credits wallet found. Please purchase credits first.",
          code: "NO_WALLET",
          needsPurchase: true
        }),
        { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const currency = wallet.currency || 'EUR';
    const cost = IMAGE_PRICING[tier][currency] || IMAGE_PRICING[tier].EUR;
    const currencySymbol = currency === 'USD' ? '$' : '€';

    if (wallet.balance_euros < cost) {
      return new Response(
        JSON.stringify({
          error: `Insufficient credits. Need ${currencySymbol}${cost.toFixed(2)}, have ${currencySymbol}${wallet.balance_euros.toFixed(2)}`,
          code: "INSUFFICIENT_CREDITS",
          needsPurchase: true,
          required: cost,
          available: wallet.balance_euros,
          currency
        }),
        { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // --- Capability-driven reference handling -------------------------------
    const cap = capabilityFor(tier);
    if (!cap?.modes.includes(mode)) {
      return new Response(
        JSON.stringify({ error: `${cap?.model ?? tier} unterstützt den Modus ${mode} nicht.`, code: 'MODE_NOT_SUPPORTED' }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const requestedSubjects = [
      ...(body.referenceImageUrls ?? []),
      ...(referenceImageUrl ? [referenceImageUrl] : []),
    ].filter(Boolean);
    const requestedStyles = [
      ...(body.styleReferenceUrls ?? []),
      ...(styleReferenceUrl ? [styleReferenceUrl] : []),
    ].filter(Boolean);

    const maxSubjects = cap?.references.subject ?? 0;
    const maxStyles = cap?.references.style ?? 0;

    if ((requestedSubjects.length || requestedStyles.length) && (!cap || cap.references.field === null)) {
      return new Response(
        JSON.stringify({
          error: `${cap?.model ?? tier} akzeptiert keine Referenzbilder.`,
          code: 'REFERENCE_NOT_SUPPORTED',
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (
      requestedSubjects.length > maxSubjects ||
      requestedStyles.length > maxStyles ||
      requestedSubjects.length + requestedStyles.length > cap.references.total
    ) {
      return new Response(
        JSON.stringify({
          error: `${cap.model} erlaubt maximal ${maxSubjects} Motiv-, ${maxStyles} Stil- und ${cap.references.total} Referenzen insgesamt.`,
          code: 'REFERENCE_LIMIT_EXCEEDED',
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const subjectRefs = requestedSubjects.slice(0, maxSubjects);
    const styleRefs = requestedStyles.slice(0, maxStyles);

    // --- Format: the server decides the source size, not the browser -------
    const requestedFormat = body.requestedFormat ?? aspectRatio;
    let serverSource: { width: number; height: number } | null = null;
    if (requestedFormat === SOURCE_FORMAT && subjectRefs.length) {
      serverSource = await readImageDimensions(subjectRefs[0]);
      const claimed = body.sourceDimensions;
      if (serverSource && claimed?.width && claimed?.height) {
        const drift = Math.abs(
          claimed.width / claimed.height - serverSource.width / serverSource.height,
        );
        if (drift > 0.01) {
          console.warn(
            `[generate-image-replicate] client source ratio ${claimed.width}x${claimed.height} != asset ${serverSource.width}x${serverSource.height} — using asset`,
          );
        }
      }
    }

    // --- Deterministic prompt assembly (shared with the UI) ----------------
    const built = buildPictureRequest({
      tier,
      mode,
      prompt: prompt.trim(),
      style,
      requestedFormat,
      source: serverSource,
      subjectRefs,
      styleRefs,
      strength: body.strength,
      transparentBackground: body.transparentBackground,
      brandKit,
    });

    const blocker = blockingNotice(built);
    if (blocker) {
      return new Response(
        JSON.stringify({ error: blocker.message.de, message: blocker.message, code: blocker.code }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const enhancedPrompt = built.prompt;

    const effectiveAspect = built.resolvedFormat.aspectRatio;
    const safeAspect = mapAspectRatio(tier, effectiveAspect);
    if (built.resolvedFormat.adjustment) {
      console.log(
        `[generate-image-replicate] format ${built.resolvedFormat.adjustment.from} → ${built.resolvedFormat.adjustment.to} for ${tier}`,
      );
    }
    const resolvedSize = resolveSize(tier, effectiveAspect, {
      width: body.width ?? built.resolvedFormat.width,
      height: body.height ?? built.resolvedFormat.height,
      resolution: body.resolution,
    });

    // Provider-side field order: subject references first, style last.
    const imageInputs: string[] = [...subjectRefs, ...styleRefs];

    // Replicate
    const REPLICATE_API_KEY = Deno.env.get('REPLICATE_API_KEY');
    if (!REPLICATE_API_KEY) {
      return new Response(
        JSON.stringify({ error: "REPLICATE_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const mediaOrigin = requireMediaOrigin(Deno.env.get("PUBLIC_API_URL"));
    const replicate = new Replicate({ auth: REPLICATE_API_KEY });
    const modelRef = REPLICATE_MODELS[tier];

    // Per-model input shape
    const replicateInput: Record<string, any> = tier === 'gptimage'
      ? buildReplicateGptImageInput(enhancedPrompt, safeAspect, imageInputs, built.transparentBackground)
      : { prompt: enhancedPrompt };

    if (tier === 'fast') {
      // Seedream 4 — supports exact pixel sizes via size:"custom"
      replicateInput.aspect_ratio = safeAspect;
      if (resolvedSize.width && resolvedSize.height) {
        replicateInput.size = 'custom';
        replicateInput.width = resolvedSize.width;
        replicateInput.height = resolvedSize.height;
      } else {
        replicateInput.size = resolvedSize.resolution ?? '2K';
      }
      if (imageInputs.length) replicateInput.image_input = imageInputs;
    } else if (tier === 'pro') {
      // Imagen 4 Ultra (no image_input support — style ref only via prompt)
      replicateInput.aspect_ratio = safeAspect;
      replicateInput.image_size = resolvedSize.resolution ?? '1K';
      replicateInput.output_format = 'jpg';
      replicateInput.safety_filter_level = 'block_only_high';
    } else if (tier === 'flux') {
      // FLUX 1.1 Pro Ultra — exactly one image_prompt
      replicateInput.aspect_ratio = safeAspect;
      replicateInput.output_format = 'jpg';
      replicateInput.safety_tolerance = 5;
      if (imageInputs.length) replicateInput.image_prompt = imageInputs[0];
      // Polarity note: image_prompt_strength = how much the REFERENCE dominates,
      // so the builder inverts the UI's "how much may change" slider.
      if (imageInputs.length && built.strengthField === 'image_prompt_strength' && typeof built.strengthValue === 'number') {
        replicateInput.image_prompt_strength = built.strengthValue;
      }
    } else if (tier === 'ideogram') {
      // Ideogram v3 Turbo — style references only
      if (resolvedSize.resolution && resolvedSize.resolution !== 'Auto') replicateInput.resolution = resolvedSize.resolution;
      else replicateInput.aspect_ratio = safeAspect;
      if (styleRefs.length) replicateInput.style_reference_images = styleRefs;
    } else if (tier === 'recraft') {
      // Recraft v3 — fixed pixel presets
      replicateInput.size = resolvedSize.preset ?? '1024x1024';
    } else if (tier === 'qwen') {
      // Qwen Image
      replicateInput.aspect_ratio = safeAspect;
      replicateInput.image_size = resolvedSize.resolution ?? 'optimize_for_quality';
      replicateInput.output_format = 'jpg';
      if (imageInputs.length) replicateInput.image = imageInputs[0];
      // Polarity note: qwen `strength` = img2img denoising, i.e. how much CHANGES.
      if (imageInputs.length && built.strengthField === 'strength' && typeof built.strengthValue === 'number') {
        replicateInput.strength = built.strengthValue;
      }
    } else if (tier === 'ultra') {
      // Nano Banana (ultra) — multi-image edit
      replicateInput.aspect_ratio = safeAspect;
      replicateInput.output_format = 'jpg';
      if (imageInputs.length) replicateInput.image_input = imageInputs;
    }


    console.log(`[generate-image-replicate] Tier=${tier} Cost=${currencySymbol}${cost.toFixed(2)} Model=${modelRef} aspect=${safeAspect} images=${imageInputs.length}`);

    let output: any;
    try {
      output = await replicate.run(modelRef as any, { input: replicateInput });
    } catch (replicateError: any) {
      console.error('[generate-image-replicate] Replicate error:', replicateError);
      const detail = String(
        replicateError?.response?.data?.detail ??
        replicateError?.detail ??
        replicateError?.message ??
        'Unknown error'
      );
      const msg = detail;
      const isSafety = /E005|flagged as sensitive|safety|nsfw/i.test(msg);
      return new Response(
        JSON.stringify({
          error: isSafety
            ? 'Das Referenzbild oder der Prompt wurde vom Sicherheitsfilter des Modells blockiert. Häufige Auslöser: viele Personen, religiöse, politische oder gewaltvolle Motive. Tipp: anderes Referenzbild wählen, Motiv im Prompt beschreiben statt vorzulegen, oder Tier „Pro" ohne Referenz testen.'
            : `Bildgenerierung fehlgeschlagen: ${msg}`,
          provider_message: msg,
          code: isSafety ? 'SAFETY_FILTERED' : 'REPLICATE_ERROR',
        }),
        { status: isSafety ? 422 : 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Extract image URL (Replicate output can be string | string[] | ReadableStream)
    let imageUrl: string | null = null;
    if (typeof output === 'string') {
      imageUrl = output;
    } else if (Array.isArray(output) && output.length > 0) {
      imageUrl = typeof output[0] === 'string' ? output[0] : null;
    } else if (output && typeof output === 'object' && 'url' in output) {
      imageUrl = typeof (output as any).url === 'function' ? (output as any).url().toString() : (output as any).url;
    }

    if (!imageUrl) {
      console.error('[generate-image-replicate] No image URL in output:', output);
      return new Response(
        JSON.stringify({ error: "No image returned from model", code: "NO_OUTPUT" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch the image and store in background-projects bucket (RLS path: {user_id}/...)
    const imageRes = await fetch(imageUrl);
    if (!imageRes.ok) {
      return new Response(
        JSON.stringify({ error: "Failed to fetch generated image" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const imageBuffer = await imageRes.arrayBuffer();
    const fileExt = built.transparentBackground && supportsTransparency(tier) ? 'png' : 'jpg';
    const storagePath = `${user.id}/picture-studio/${tier}-${Date.now()}.${fileExt}`;

    const { error: uploadError } = await supabaseAdmin.storage
      .from('background-projects')
      .upload(storagePath, imageBuffer, {
        contentType: fileExt === 'png' ? 'image/png' : 'image/jpeg',
        upsert: false,
      });

    if (uploadError) {
      console.error('[generate-image-replicate] Storage upload error:', uploadError);
      return new Response(
        JSON.stringify({ error: `Storage error: ${uploadError.message}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const assetReference = privateMediaReference(mediaOrigin, 'background-projects', storagePath, user.id);

    // Provider already ran and was paid for: retry the library row instead of
    // discarding a paid result.
    const persisted = await persistStudioImage(
      supabaseAdmin,
      {
        user_id: user.id,
        image_url: assetReference,
        workflow_type: 'generated',
        prompt: prompt.trim(),
        style,
        aspect_ratio: built.resolvedFormat.aspectRatio,
        source: 'generated',
        metadata_json: {
          storagePath,
          storageBucket: 'background-projects',
          requestedFormat: built.requestedFormat,
          resolvedFormat: built.resolvedFormat,
        },
      },
      '[generate-image-replicate]',
    );

    // Deduct credits AFTER successful generation
    const { data: newBalance, error: deductError } = await supabaseAdmin.rpc(
      'deduct_ai_video_credits',
      { p_user_id: user.id, p_amount: cost, p_generation_id: persisted.id }
    );

    if (deductError) {
      console.error('[generate-image-replicate] Deduction requires review');
      return new Response(JSON.stringify({error:'The image is stored, but its charge requires review. Do not regenerate it.',code:'ASSET_CHARGE_REVIEW_REQUIRED',assetId:persisted.id}),
        {status:503,headers:{...corsHeaders,'Content-Type':'application/json'}});
    }

    let previewUrl: string;
    try {
      previewUrl = await signOwnedMediaPreview(supabaseAdmin, mediaOrigin, 'background-projects', storagePath, user.id);
    } catch {
      return new Response(JSON.stringify({error:'The image is stored. Refresh its preview rather than generating again.',code:'ASSET_PREVIEW_UNAVAILABLE',assetId:persisted.id}),
        {status:503,headers:{...corsHeaders,'Content-Type':'application/json'}});
    }

    if (!persisted.ok) {
      console.error('[generate-image-replicate] studio_images insert exhausted:', persisted.error);
      return new Response(
        JSON.stringify({
          error:
            'Your image is ready and safely stored, but it could not be added to your library yet. We are retrying — the result is not lost.',
          code: 'ASSET_PERSIST_FAILED',
          providerUrl: previewUrl,
          cost,
          currency,
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        image: {
          id: persisted.id,
          url: previewUrl,
          previewUrl,
          workflowType: 'generated',
          storageReference: assetReference,
          previewExpiresIn: 900,
        },
        cost,
        currency,
        newBalance: newBalance ?? wallet.balance_euros - cost,
        tier,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("[generate-image-replicate] Error:", error);
    return new Response(
      JSON.stringify({ error: error?.message || 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

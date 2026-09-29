/**
 * POST /agent-video-qa — full temporal QA of a finished AI video.
 *
 * Reuses existing infrastructure instead of a new video pipeline:
 *  1. Scene segmentation via the existing `analyze-video-scenes` function.
 *  2. Whole-clip review of the ACTUAL MP4 via the gateway payloads verified in
 *     `qa-gemini-mp4-url-probe` / `_shared/plate-face-detect.ts`
 *     (`input_video` primary, base64 data-URL fallback ≤18 MB).
 *
 * Called by the AdTool Agent (`_shared/muse/toolRuntime.ts`) with the user's
 * JWT; only videos owned by the caller are reviewed.
 */

import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const QA_MODEL = 'google/gemini-2.5-flash';

const QA_PROMPT = (intent: string, duration: number, scenes: string) => `You are a strict creative director doing QUALITY CONTROL on an AI-generated video (${duration.toFixed(1)}s) intended for paid social advertising.
Watch the WHOLE clip, frame to frame, and judge temporal quality — not just a single still.

Intended result: ${intent}
Detected scenes: ${scenes || 'unknown'}

Check specifically:
- character_consistency: same person (face, hair, clothing, body) across frames
- product_consistency: product shape, colour, logo, label stay identical
- anatomy: malformed / morphing hands, fingers, faces, teeth, eyes during motion
- object_permanence: objects appearing, disappearing or changing
- motion_artifacts: warping, jitter, flicker, melting, unnatural physics, camera glitches
- text_consistency: on-screen text legible, correctly spelled, stable across frames
- scene_continuity: lighting, setting, framing coherent between shots
- audio_sync: lip-sync / audio timing issues if there is speech or audio (else "not_applicable")
- prompt_adherence: does it show the intended result

Return STRICT JSON only, no markdown:
{"verdict":"acceptable"|"needs_work"|"unusable",
 "overall_score":0-10,
 "scores":{"character_consistency":0-10|null,"product_consistency":0-10|null,"anatomy":0-10|null,"object_permanence":0-10,"motion_artifacts":0-10,"text_consistency":0-10|null,"scene_continuity":0-10,"audio_sync":0-10|null,"prompt_adherence":0-10},
 "issues":[{"category":string,"severity":"minor"|"major"|"critical","start_s":number,"end_s":number,"description":string}],
 "audio":{"present":boolean,"speech":boolean,"sync_ok":boolean|null},
 "strengths":[string],
 "regeneration":{"recommended":boolean,"prompt_fixes":[string],"negative_prompt_additions":[string],"suggested_prompt":string|null}}
Use null for a score when the category does not apply. Be concrete with timestamps.`;

async function toBase64DataUrl(url: string, maxBytes = 18 * 1024 * 1024): Promise<string | null> {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const ab = await r.arrayBuffer();
    if (ab.byteLength > maxBytes) return null;
    const bytes = new Uint8Array(ab);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return `data:${r.headers.get('content-type') ?? 'video/mp4'};base64,${btoa(bin)}`;
  } catch {
    return null;
  }
}

// deno-lint-ignore no-explicit-any
async function askModel(key: string, content: any[]): Promise<{ ok: boolean; status: number; text: string }> {
  const res = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: QA_MODEL, messages: [{ role: 'user', content }], temperature: 0.1 }),
  });
  const raw = await res.text();
  if (!res.ok) return { ok: false, status: res.status, text: raw.slice(0, 300) };
  try {
    return { ok: true, status: 200, text: JSON.parse(raw).choices?.[0]?.message?.content ?? '' };
  } catch {
    return { ok: false, status: 502, text: 'invalid gateway response' };
  }
}

function parseJson(text: string) {
  try {
    const m = text.match(/\{[\s\S]*\}/);
    return m ? JSON.parse(m[0]) : null;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' });

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const lovableKey = Deno.env.get('LOVABLE_API_KEY');
  if (!lovableKey) return json(503, { error: 'Video QA is not configured.', code: 'NOT_CONFIGURED' });

  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  // Background agent resume: service key + explicit user id (never reachable with a user token).
  const internalUser = req.headers.get('x-agent-user-id') ?? '';
  let auth: { user: { id: string } } | null = null;
  if (jwt && jwt === serviceKey && /^[0-9a-f-]{36}$/i.test(internalUser)) {
    auth = { user: { id: internalUser } };
  } else {
    const { data } = await createClient(supabaseUrl, anonKey).auth.getUser(jwt);
    auth = data?.user ? { user: { id: data.user.id } } : null;
  }
  if (!auth?.user) return json(401, { error: 'Unauthorized' });

  // deno-lint-ignore no-explicit-any
  let body: any;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'Invalid JSON body' });
  }
  const generationId = typeof body?.generation_id === 'string' ? body.generation_id : '';
  const intent = typeof body?.intent === 'string' ? body.intent.slice(0, 2000) : '';
  if (!/^[0-9a-f-]{36}$/i.test(generationId) || !intent) {
    return json(400, { error: 'generation_id (uuid) and intent are required' });
  }

  const admin = createClient(supabaseUrl, serviceKey);
  const { data: gen } = await admin
    .from('ai_video_generations')
    .select('id, status, video_url, duration_seconds')
    .eq('id', generationId)
    .eq('user_id', auth.user.id)
    .maybeSingle();
  if (!gen) return json(404, { error: 'No generation with that id belongs to this account.', code: 'NOT_FOUND' });
  if (gen.status !== 'completed' || !gen.video_url) {
    return json(409, { error: 'The video is not finished yet.', code: 'NOT_READY', status: gen.status });
  }
  const duration = Number(gen.duration_seconds ?? 5);

  // 1) Scene segmentation through the existing analyzer (best effort).
  // deno-lint-ignore no-explicit-any
  let scenes: any[] = [];
  try {
    const r = await fetch(`${supabaseUrl}/functions/v1/analyze-video-scenes`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${jwt}`, apikey: anonKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ video_url: gen.video_url, duration }),
    });
    const d = await r.json().catch(() => ({}));
    if (Array.isArray(d?.scenes)) {
      scenes = d.scenes.map((s: Record<string, unknown>) => ({
        start_s: s.start_time,
        end_s: s.end_time,
        description: s.description,
        mood: s.mood,
      }));
    }
  } catch (e) {
    console.warn('[agent-video-qa] scene analysis unavailable', (e as Error).message);
  }

  const sceneText = scenes.map((s) => `${s.start_s}-${s.end_s}s: ${s.description}`).join('; ');
  const prompt = QA_PROMPT(intent, duration, sceneText);

  // 2) Whole-video review: input_video primary, base64 fallback.
  let result = await askModel(lovableKey, [
    { type: 'text', text: prompt },
    { type: 'input_video', input_video: { url: gen.video_url } },
  ]);
  let method = 'input_video';
  let qa = result.ok ? parseJson(result.text) : null;
  if (!qa) {
    const dataUrl = await toBase64DataUrl(gen.video_url);
    if (dataUrl) {
      result = await askModel(lovableKey, [
        { type: 'text', text: prompt },
        { type: 'image_url', image_url: { url: dataUrl } },
      ]);
      method = 'base64_video';
      qa = result.ok ? parseJson(result.text) : null;
    }
  }

  if (!qa) {
    const status = [402, 429].includes(result.status) ? result.status : 502;
    return json(status, {
      error: 'The full video review could not be completed. Ask the user to review the video.',
      code: 'QA_UNAVAILABLE',
      scenes,
    });
  }

  return json(200, {
    analysis_available: true,
    analysis_scope: 'full_video',
    method,
    generation_id: gen.id,
    video_url: gen.video_url,
    duration_seconds: duration,
    scenes,
    qa,
  });
});

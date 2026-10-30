/**
 * Real providers for the two final export checks (step 9 frame/text visibility,
 * step 10 full-ad AI QA). Reuses existing infrastructure only:
 *  - stills: Remotion Lambda `type:"still"` renderer (`defaultRenderStill`, same as lip-sync probes; never Replicate)
 *  - reading / review: explicitly configured multimodal chat-completions provider.
 * Bounded: max 12 stills + 1 text-reading call per frame check, 1 call per spot QA, no retries.
 * No user charge; gateway token usage is captured and stored with the result.
 */
import type { FrameObservation, FrameProbe } from './frameCheck.ts';
import type { SpotProviders } from './spotRuntime.ts';

export const MAX_STILLS = 12;
const FPS = 30;

export type RenderStill = (videoUrl: string, totalSec: number, frame: number, timeoutMs: number, dims?: { width: number; height: number } | null) => Promise<Uint8Array>;
export interface CheckDeps {
  apiKey: string;
  baseUrl: string;
  model: string;
  renderStill: RenderStill;
  fetchImpl?: typeof fetch;
  /** Downloads the export for inline submission (defaults to global fetch). */
  mediaFetch?: (url: string) => Promise<Response>;
  totalSec?: number;
  dims?: { width: number; height: number };
}
export interface CallUsage { call: 'frame_text_read' | 'spot_ai_qa'; model: string; stills?: number; prompt_tokens: number | null; completion_tokens: number | null; total_tokens: number | null; cost_usd: number | null; run_id: string | null }

const b64 = (bytes: Uint8Array) => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s); };

/** Hard cap for inline video (the gateway rejects plain .mp4 links in image_url with 400 "invalid argument"). */
export const MAX_INLINE_VIDEO_BYTES = 18 * 1024 * 1024;

/** Secret-free description of a request: part kinds, mime, sizes, URL host only. */
// deno-lint-ignore no-explicit-any
export function describeRequest(call: string, body: any) {
  // deno-lint-ignore no-explicit-any
  const parts = (body.messages?.[0]?.content ?? []).map((p: any) => {
    if (p.type === 'text') return { type: 'text', kind: 'text', chars: String(p.text ?? '').length };
    const url = String(p.image_url?.url ?? '');
    if (url.startsWith('data:')) return { type: p.type, kind: 'data_url', mime: url.slice(5, url.indexOf(';')), b64_chars: url.length - url.indexOf(',') - 1 };
    let host = ''; try { host = new URL(url).host; } catch { /* */ }
    return { type: p.type, kind: 'http_url', url_host: host, ext: url.split('?')[0].split('.').pop() };
  });
  return { call, model: body.model, endpoint: '/v1/chat/completions', keys: Object.keys(body).sort(), parts };
}

// deno-lint-ignore no-explicit-any
async function ask(deps: CheckDeps, content: any[], call: CallUsage['call'], stills?: number): Promise<{ text: string; usage: CallUsage }> {
  const f = deps.fetchImpl ?? fetch;
  const body = { model: deps.model, messages: [{ role: 'user', content }], temperature: 0.1 };
  const shape = describeRequest(call, body);
  console.log(JSON.stringify({ evt: 'check_gateway_request', ...shape }));
  const res = await f(`${deps.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${deps.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const raw = await res.text();
  if (!res.ok) {
    console.warn(JSON.stringify({ evt: 'check_gateway_error', call, status: res.status, shape }));
    throw new Error(`CHECK_GATEWAY_${res.status}: provider request failed`);
  }
  const j = JSON.parse(raw);
  const u = j.usage ?? {};
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  return {
    text: String(j.choices?.[0]?.message?.content ?? ''),
    usage: { call, model: deps.model, ...(stills !== undefined ? { stills } : {}), prompt_tokens: num(u.prompt_tokens), completion_tokens: num(u.completion_tokens), total_tokens: num(u.total_tokens), cost_usd: num(u.cost ?? u.cost_usd), run_id: res.headers.get('x-request-id') },
  };
}

export function createCheckProviders(deps: CheckDeps): SpotProviders & { usage: () => CallUsage[] } {
  if (!deps.apiKey || !deps.model || !deps.baseUrl) throw new Error('CHECK_PROVIDER_NOT_CONFIGURED');
  let endpoint: URL;
  try { endpoint = new URL(deps.baseUrl); } catch { throw new Error('CHECK_PROVIDER_ENDPOINT_INVALID'); }
  if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.search || endpoint.hash)
    throw new Error('CHECK_PROVIDER_ENDPOINT_INVALID');
  const usage: CallUsage[] = [];
  const totalSec = deps.totalSec ?? 30;
  const dims = deps.dims ?? { width: 1080, height: 1920 };
  return {
    /** Returns and clears the usage collected since the last read (one check = one read). */
    usage: () => usage.splice(0, usage.length),
    async observeFrames(videoUrl: string, probes: FrameProbe[]): Promise<FrameObservation[]> {
      const textProbes = probes.filter((p) => p.kind !== 'logo').slice(0, MAX_STILLS);
      const out: FrameObservation[] = probes.filter((p) => p.kind === 'logo').map((p) => ({ element_id: p.element_id, error: 'logo comparison not configured' }));
      const stills: { probe: FrameProbe; url: string }[] = [];
      for (const p of textProbes) {
        try {
          const frame = Math.max(0, Math.min(Math.round(totalSec * FPS) - 1, Math.round(p.t * FPS)));
          const bytes = await deps.renderStill(videoUrl, totalSec, frame, 90_000, dims);
          stills.push({ probe: p, url: `data:${bytes[0] === 0x89 ? 'image/png' : 'image/jpeg'};base64,${b64(bytes)}` });
        } catch (e) {
          out.push({ element_id: p.element_id, error: `still_failed: ${(e as Error).message}`.slice(0, 200) });
        }
      }
      if (!stills.length) return out;
      // deno-lint-ignore no-explicit-any
      const content: any[] = [{ type: 'text', text: `Transcribe ALL visible on-screen text in each frame exactly as rendered (subtitles included). Do not guess or correct. Return JSON only: {"frames":[{"id":string,"text":string}]} with ids ${stills.map((s) => s.probe.element_id).join(', ')}.` }];
      for (const s of stills) content.push({ type: 'text', text: `Frame id ${s.probe.element_id} at ${s.probe.t}s:` }, { type: 'image_url', image_url: { url: s.url } });
      const r = await ask(deps, content, 'frame_text_read', stills.length);
      usage.push(r.usage);
      let frames: { id: string; text: string }[] = [];
      try { frames = JSON.parse(r.text.match(/\{[\s\S]*\}/)?.[0] ?? '{}').frames ?? []; } catch { /* unreadable => not_checkable */ }
      for (const s of stills) {
        const f = frames.find((x) => String(x.id) === s.probe.element_id);
        out.push(f ? { element_id: s.probe.element_id, ocr_text: String(f.text ?? '') } : { element_id: s.probe.element_id, error: 'no reading returned' });
      }
      return out;
    },
    async analyzeSpot(videoUrl: string, prompt: string): Promise<string> {
      const res = await (deps.mediaFetch ?? fetch)(videoUrl);
      if (!res.ok) throw new Error(`CHECK_MEDIA_${res.status}: export download failed`);
      const declared = Number(res.headers.get('content-length') ?? 0);
      if (declared > MAX_INLINE_VIDEO_BYTES) { await res.body?.cancel(); throw new Error(`CHECK_INPUT_TOO_LARGE: ${declared} bytes > ${MAX_INLINE_VIDEO_BYTES}`); }
      const bytes = new Uint8Array(await res.arrayBuffer());
      if (bytes.length > MAX_INLINE_VIDEO_BYTES) throw new Error(`CHECK_INPUT_TOO_LARGE: ${bytes.length} bytes > ${MAX_INLINE_VIDEO_BYTES}`);
      const r = await ask(deps, [{ type: 'text', text: prompt }, { type: 'image_url', image_url: { url: `data:video/mp4;base64,${b64(bytes)}` } }], 'spot_ai_qa');
      usage.push(r.usage);
      return r.text;
    },
  };
}

/** Real providers from server env; null when not configured (checks then refuse instead of faking a result). */
export async function checkProvidersFromEnv() {
  const apiKey = Deno.env.get('QA_API_KEY');
  const baseUrl = Deno.env.get('QA_API_BASE_URL');
  const model = Deno.env.get('QA_MODEL');
  if (!apiKey || !baseUrl || !model || !Deno.env.get('REMOTION_SERVE_URL')) return undefined;
  const { defaultRenderStill } = await import('../../plate-face-track.ts');
  return createCheckProviders({ apiKey, baseUrl, model, renderStill: defaultRenderStill() as RenderStill });
}

/**
 * Read-only voice catalogue tool for the agent. Calls the existing
 * `list-voices` Edge Function (same catalogue as the voice picker) and returns
 * a compact list. Never generates audio, never calls TTS, never creates
 * approvals and never touches the wallet. The ONLY endpoint it may call is
 * `list-voices` — enforced below.
 */
import type { MuseFunctionTool } from '../museClient.ts';

export const LIST_VOICES_ENDPOINT = 'list-voices';

export const VOICE_CATALOG_TOOL: MuseFunctionTool = {
  type: 'function',
  name: 'list_voiceover_voices',
  description: 'Read-only: list voiceover voices from the platform voice catalogue (same as the voice picker). Defaults to native speakers for de/es, sorted by popularity. Never generates audio or samples, never charges. Returns name, voice_id, gender, accent, age, use case, short description, stored preview URL and tier. Never pick a voice for the user — show options and let them choose.',
  parameters: {
    type: 'object',
    properties: {
      language: { type: 'string', description: 'ISO-639-1, e.g. de' },
      gender: { type: 'string', enum: ['male', 'female', 'neutral'] },
      accent: { type: 'string' },
      age: { type: 'string' },
      use_case: { type: 'string' },
      search: { type: 'string' },
      limit: { type: 'integer', minimum: 1, maximum: 20 },
    },
    required: ['language'],
    additionalProperties: false,
  },
};

export interface VoiceCatalogCtx { supabaseUrl: string; anonKey: string; userJwt: string; fetchImpl?: typeof fetch }

const str = (v: unknown, max = 60) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);

// deno-lint-ignore no-explicit-any
export async function listVoiceoverVoices(ctx: VoiceCatalogCtx, a: Record<string, any>) {
  const language = (str(a.language, 8) ?? 'de').toLowerCase();
  const limit = Math.min(20, Math.max(1, Number.isInteger(a.limit) ? a.limit : 8));
  const gender = ['male', 'female', 'neutral'].includes(a.gender) ? a.gender : null;
  const body = {
    language,
    gender,
    accent: str(a.accent),
    age: str(a.age),
    use_case: str(a.use_case),
    search: str(a.search, 80) ?? '',
    nativeOnly: language === 'de' || language === 'es' ? true : undefined,
    sort: 'popularity',
    page: 0,
    pageSize: Math.max(10, limit),
  };
  const url = `${ctx.supabaseUrl.replace(/\/+$/, '')}/functions/v1/${LIST_VOICES_ENDPOINT}`;
  if (!url.endsWith(`/functions/v1/${LIST_VOICES_ENDPOINT}`)) throw new Error('voice catalogue endpoint mismatch');
  const call = () => (ctx.fetchImpl ?? fetch)(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${ctx.userJwt}`, apikey: ctx.anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  // One retry on a transient catalogue error (read-only, so repeating is safe).
  let res = await call();
  if (res.status >= 500) res = await call();
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { error: `Voice catalogue unavailable (${res.status}).`, voices: [] };
  // deno-lint-ignore no-explicit-any
  const voices = (Array.isArray(data?.voices) ? data.voices : [])
    // deno-lint-ignore no-explicit-any
    .filter((v: any) => v?.language === language && (body.nativeOnly ? v?.is_native !== false : true))
    .slice(0, limit)
    // deno-lint-ignore no-explicit-any
    .map((v: any) => ({
      name: v.name, voice_id: v.id, gender: v.gender ?? null, accent: v.accent ?? null, age: v.age ?? null,
      use_case: v.use_case ?? null,
      description: typeof v.description === 'string' ? v.description.slice(0, 160) : null,
      preview_url: v.preview_url ?? null, tier: v.tier ?? null,
    }));
  return { language, native_only: !!body.nativeOnly, total: data?.total ?? voices.length, voices, note: 'Catalogue read only. No audio generated, nothing charged. The user chooses the voice.' };
}

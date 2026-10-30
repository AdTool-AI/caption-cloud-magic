/**
 * set_campaign_voiceover_voice — planning-safe persistence of the user's voice
 * choice on ONE campaign video (campaign_videos.post_production). Verifies the
 * id against the existing `list-voices` catalogue (no arbitrary ids), never
 * calls TTS, never creates approvals, never charges, never touches the script.
 * Every change appends to campaign_planning_audit.
 */
import type { MuseFunctionTool } from '../museClient.ts';
import { LIST_VOICES_ENDPOINT, type VoiceCatalogCtx } from './voiceCatalog.ts';

// deno-lint-ignore no-explicit-any
type Row = Record<string, any>;
export interface VoiceSelectCtx extends VoiceCatalogCtx { admin: Row; userId: string }

export const SET_VOICE_TOOL: MuseFunctionTool = {
  type: 'function',
  name: 'set_campaign_voiceover_voice',
  description: 'Planning only. Save the voiceover voice the USER explicitly chose (from list_voiceover_voices) on one campaign video. Server verifies the id in the catalogue and the language (native for de). Never generates audio, never charges, never changes the script. Requires user_approved true.',
  parameters: {
    type: 'object',
    properties: { campaign_id: { type: 'string' }, video_id: { type: 'string' }, voice_id: { type: 'string' }, voice_name: { type: 'string' }, language: { type: 'string' }, user_approved: { type: 'boolean' } },
    required: ['campaign_id', 'video_id', 'voice_id', 'voice_name', 'language', 'user_approved'],
    additionalProperties: false,
  },
};

const fail = (code: string, error: string) => ({ error, code });

/** Look the voice up in the catalogue (search by name, then page through). */
export async function findCatalogVoice(ctx: VoiceCatalogCtx, voiceId: string, language: string, name: string): Promise<Row | null> {
  const url = `${ctx.supabaseUrl.replace(/\/+$/, '')}/functions/v1/${LIST_VOICES_ENDPOINT}`;
  const native = language === 'de' || language === 'es';
  const query = async (search: string, page: number) => {
    const body = { language, search, nativeOnly: native ? true : undefined, sort: 'popularity', page, pageSize: 100 };
    const call = () => (ctx.fetchImpl ?? fetch)(url, { method: 'POST', headers: { Authorization: `Bearer ${ctx.userJwt}`, apikey: ctx.anonKey, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    let res = await call();
    if (res.status >= 500) res = await call();
    if (!res.ok) throw new Error(`catalogue ${res.status}`);
    return await res.json();
  };
  for (const [search, pages] of [[name, 1], ['', 5]] as const) {
    for (let p = 0; p < pages; p++) {
      const d = await query(search, p);
      const hit = (Array.isArray(d?.voices) ? d.voices : []).find((v: Row) => v?.id === voiceId);
      if (hit) return hit;
      if (!d?.hasMore) break;
    }
  }
  return null;
}

export async function setCampaignVoiceoverVoice(ctx: VoiceSelectCtx, a: Row) {
  if (a?.user_approved !== true) return fail('NOT_APPROVED', 'The user must explicitly confirm the voice (user_approved: true).');
  for (const k of ['campaign_id', 'video_id', 'voice_id', 'voice_name', 'language']) {
    if (typeof a?.[k] !== 'string' || !a[k].trim()) return fail('INVALID', `${k} is required.`);
  }
  const language = a.language.trim().toLowerCase();
  const { data: camp } = await ctx.admin.from('agent_campaigns').select('id').eq('id', a.campaign_id).eq('user_id', ctx.userId).maybeSingle();
  if (!camp) return fail('NOT_FOUND', 'Campaign not found.');
  const { data: video } = await ctx.admin.from('campaign_videos').select('id, post_production')
    .eq('id', a.video_id).eq('campaign_id', camp.id).eq('user_id', ctx.userId).maybeSingle();
  if (!video) return fail('NOT_FOUND', 'Video not found in this campaign.');

  let voice: Row | null;
  try { voice = await findCatalogVoice(ctx, a.voice_id.trim(), language, a.voice_name.trim()); }
  catch (e) { return fail('CATALOGUE_UNAVAILABLE', `Voice catalogue unavailable (${(e as Error).message}). Nothing saved.`); }
  if (!voice) return fail('VOICE_NOT_IN_CATALOGUE', 'This voice id is not in the voice catalogue for this language. Nothing saved.');
  if (voice.language !== language) return fail('LANGUAGE_UNSUPPORTED', `Voice is ${voice.language}, not ${language}.`);
  if (language === 'de' && voice.is_native === false) return fail('NOT_NATIVE', 'German needs a native German voice.');
  if (String(voice.name ?? '').trim().toLowerCase() !== a.voice_name.trim().toLowerCase()) return fail('NAME_MISMATCH', `Catalogue name for this id is "${voice.name}".`);

  const pp: Row = video.post_production && typeof video.post_production === 'object' ? video.post_production : {};
  const keys = ['voiceover_voice_id', 'voiceover_voice_name', 'voiceover_language', 'voiceover_voice_selected_at', 'voiceover_voice_user_confirmed'];
  const before = Object.fromEntries(keys.map((k) => [k, pp[k] ?? null]));
  const after = { voiceover_voice_id: voice.id, voiceover_voice_name: voice.name, voiceover_language: language, voiceover_voice_selected_at: new Date().toISOString(), voiceover_voice_user_confirmed: true };
  const { error: aErr } = await ctx.admin.from('campaign_planning_audit').insert({ user_id: ctx.userId, campaign_id: camp.id, video_id: video.id, kind: 'voiceover_voice_selection', before, after, reason: 'user voice choice', user_confirmed: true });
  if (aErr) return fail('AUDIT_FAILED', `Audit write failed: ${aErr.message ?? aErr}. Nothing saved.`);
  const { error } = await ctx.admin.from('campaign_videos').update({ post_production: { ...pp, ...after } }).eq('id', video.id).eq('user_id', ctx.userId);
  if (error) return fail('UPDATE_FAILED', String(error.message ?? error));
  return { campaign_id: camp.id, video_id: video.id, saved: after, previous: before, note: 'Voice saved for this video only. No audio generated, script unchanged, nothing approved or charged.' };
}

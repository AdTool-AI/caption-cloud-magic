import { assertEquals } from 'jsr:@std/assert';
import { setCampaignVoiceoverVoice } from './voiceSelection.ts';
import { resolveVoice } from './assembly.ts';
import { PLANNING_TOOLS } from '../turnPolicy.ts';

function db(videoPP: Record<string, unknown> = {}) {
  const writes: string[] = []; let pp = videoPP; const audits: unknown[] = [];
  const q = (t: string) => { const f: Record<string, unknown> = {}; const b: any = {
    select: () => b, eq: (k: string, v: unknown) => { f[k] = v; return b; },
    maybeSingle: async () => t === 'agent_campaigns' ? { data: f.user_id === 'u1' && f.id === 'c1' ? { id: 'c1' } : null }
      : { data: f.id === 'v1' && f.campaign_id === 'c1' && f.user_id === 'u1' ? { id: 'v1', post_production: pp } : null },
    insert: async (r: unknown) => { writes.push(t); audits.push(r); return { error: null }; },
    update: (r: any) => { writes.push(t); pp = r.post_production; return { eq: () => ({ eq: async () => ({ error: null }) }) }; },
  }; return b; };
  return { admin: { from: q }, writes, audits, get pp() { return pp; } };
}
const fetchOk = (voices: unknown[]) => (async () => new Response(JSON.stringify({ voices, hasMore: false }))) as unknown as typeof fetch;
const HANNAH = { id: 'XrExE9yKIg1WjnnlVkGX', name: 'Hannah', language: 'de', is_native: true };
const base = { campaign_id: 'c1', video_id: 'v1', voice_id: HANNAH.id, voice_name: 'Hannah', language: 'de', user_approved: true };
const ctx = (d: any, voices: unknown[] = [HANNAH], userId = 'u1') => ({ admin: d.admin, userId, userJwt: 'j', supabaseUrl: 'https://x', anonKey: 'a', fetchImpl: fetchOk(voices) });

Deno.test('saves verified native voice with audit, only voice fields', async () => {
  const d = db({ music_intent: 'keep' });
  const r: any = await setCampaignVoiceoverVoice(ctx(d), base);
  assertEquals(r.saved.voiceover_voice_id, HANNAH.id);
  assertEquals(d.writes, ['campaign_planning_audit', 'campaign_videos']);
  assertEquals((d.pp as any).music_intent, 'keep');
  assertEquals((d.pp as any).voiceover_voice_user_confirmed, true);
});
Deno.test('rejects unknown id, non-native, unapproved, foreign user', async () => {
  for (const [c, a, v, u] of [
    ['VOICE_NOT_IN_CATALOGUE', base, [], 'u1'],
    ['NOT_NATIVE', base, [{ ...HANNAH, is_native: false }], 'u1'],
    ['NOT_APPROVED', { ...base, user_approved: false }, [HANNAH], 'u1'],
    ['NOT_FOUND', base, [HANNAH], 'u2'],
  ] as const) {
    const d = db(); const r: any = await setCampaignVoiceoverVoice(ctx(d, v as unknown[], u), a);
    assertEquals(r.code, c); assertEquals(d.writes, []);
  }
});
Deno.test('assembly voice resolution: explicit > confirmed saved > none', () => {
  assertEquals(resolveVoice({ voiceover: { voice_id: 'x' } }, { voiceover_voice_id: 'y', voiceover_voice_user_confirmed: true }).voiceover.voice_id, 'x');
  assertEquals(resolveVoice({ voiceover: {} }, { voiceover_voice_id: 'y', voiceover_voice_user_confirmed: true }).voiceover.voice_id, 'y');
  assertEquals(resolveVoice({ voiceover: {} }, { voiceover_voice_id: 'y' }).voiceover.voice_id, undefined);
  assertEquals(PLANNING_TOOLS.has('set_campaign_voiceover_voice'), true);
});

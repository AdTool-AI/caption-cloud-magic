import { assert, assertEquals } from 'jsr:@std/assert@1';
import { LIST_VOICES_ENDPOINT, listVoiceoverVoices, VOICE_CATALOG_TOOL } from './voiceCatalog.ts';
import { guardToolCall, PLANNING_TOOLS, READ_ONLY_TOOLS } from '../turnPolicy.ts';

function mockFetch(calls: string[], bodies: unknown[]) {
  return (async (url: string, init?: RequestInit) => {
    calls.push(String(url));
    bodies.push(JSON.parse(String(init?.body ?? '{}')));
    return new Response(JSON.stringify({ total: 3, voices: [
      { id: 'v1', name: 'Anna', language: 'de', is_native: true, gender: 'female', tier: 'premium', description: 'x'.repeat(400), preview_url: 'https://p/1.mp3' },
      { id: 'v2', name: 'Eng', language: 'en', is_native: true },
      { id: 'v3', name: 'Max', language: 'de', is_native: true, gender: 'male', tier: 'community' },
    ] }), { status: 200 });
  }) as unknown as typeof fetch;
}
const ctx = (f: typeof fetch) => ({ supabaseUrl: 'https://x.supabase.co', anonKey: 'anon', userJwt: 'jwt', fetchImpl: f });

Deno.test('calls only list-voices, never generate-voiceover/TTS', async () => {
  const calls: string[] = [], bodies: unknown[] = [];
  await listVoiceoverVoices(ctx(mockFetch(calls, bodies)), { language: 'de', limit: 3 });
  assertEquals(calls, [`https://x.supabase.co/functions/v1/${LIST_VOICES_ENDPOINT}`]);
  assert(!calls.some((c) => /generate-voiceover|text-to-speech|tts/i.test(c)));
});

Deno.test('de defaults to native, popularity, compact output', async () => {
  const calls: string[] = [], bodies: Record<string, unknown>[] = [];
  const r = await listVoiceoverVoices(ctx(mockFetch(calls, bodies)), { language: 'de', limit: 3 });
  assertEquals(bodies[0].nativeOnly, true);
  assertEquals(bodies[0].sort, 'popularity');
  assertEquals(r.voices.map((v) => v.voice_id), ['v1', 'v3']);
  assertEquals((r.voices[0].description ?? '').length, 160);
  assertEquals(Object.keys(r.voices[0]).sort(), ['accent', 'age', 'description', 'gender', 'name', 'preview_url', 'tier', 'use_case', 'voice_id']);
});

Deno.test('allowed in read-only and planning; tool has no paid params', () => {
  assert(READ_ONLY_TOOLS.has('list_voiceover_voices'));
  assert(PLANNING_TOOLS.has('list_voiceover_voices'));
  assertEquals(guardToolCall('read_only', 'list_voiceover_voices'), null);
  assert(guardToolCall('read_only', 'prepare_spot_action'));
  assert(!('text' in (VOICE_CATALOG_TOOL.parameters as { properties: object }).properties));
});

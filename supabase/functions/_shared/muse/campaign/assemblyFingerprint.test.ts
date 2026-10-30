import { assertEquals, assertNotEquals } from 'jsr:@std/assert@1';
import { canonicalJson, fingerprint } from './assembly.ts';

// A package saved and re-read from the database (jsonb reorders keys) must
// still match its stored check value, so a freshly prepared package can start.
Deno.test('fingerprint is stable when the database reorders keys', async () => {
  const saved = { edit_revision: 4, branding_mode: 'text_only', steps: [{ step: 'voiceover', params: { text: 'Hallo', voice_id: 'X', language: 'de', start: 0 } }], no_shot_generation: true };
  const reread = JSON.parse(JSON.stringify({ steps: [{ params: { start: 0, language: 'de', voice_id: 'X', text: 'Hallo' }, step: 'voiceover' }], no_shot_generation: true, branding_mode: 'text_only', edit_revision: 4 }));
  assertEquals(await fingerprint(saved), await fingerprint(reread));
});

Deno.test('fingerprint still changes when content or cost changes', async () => {
  const a = { branding_mode: 'text_only', wallet_usd_max: 0.3 };
  assertNotEquals(await fingerprint(a), await fingerprint({ ...a, wallet_usd_max: 0.55 }));
});

Deno.test("step cost check ignores key order but catches real changes", () => {
  const a = { usd: 0.1, credits: 2, kind: "voiceover" };
  const reordered = { kind: "voiceover", credits: 2, usd: 0.1 };
  if (canonicalJson(a) !== canonicalJson(reordered)) throw new Error("order must not matter");
  if (canonicalJson(a) === canonicalJson({ ...a, usd: 0.2 })) throw new Error("price change must be caught");
});

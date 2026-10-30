import { assert, assertEquals, assertNotEquals } from 'jsr:@std/assert@1';
import { approvalFingerprint, buildScope, jsonEqual, normalizeParams, stepCostMatches, type AssemblyStep } from './assembly.ts';
import type { SpotEdit } from './spot.ts';

// deno-lint-ignore no-explicit-any
type Row = Record<string, any>;

/** Simulates jsonb persistence: keys come back sorted (length, then bytewise), not in insertion order. */
function jsonbRoundTrip(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(jsonbRoundTrip);
  if (v && typeof v === 'object') {
    const keys = Object.keys(v as Row).sort((a, b) => a.length - b.length || (a < b ? -1 : 1));
    return Object.fromEntries(keys.map((k) => [k, jsonbRoundTrip((v as Row)[k])]));
  }
  return v;
}

const edit = {
  aspect: '9:16', branding_mode: 'text_only',
  clips: [{ shot_id: 's1', attempt_id: 'a1', trim_in: 0, trim_out: 5, url: 'u' }],
  overlays: [], endcard: { headline: 'Café Buur' },
} as unknown as SpotEdit;
const params = normalizeParams({
  branding_mode: 'text_only',
  voiceover: { text: 'Dein Kaffee, dein Moment.', voice_id: 'XrExE9yKIg1WjnnlVkGX', language: 'de', start: 0 },
  music: { prompt: 'warm acoustic', tier: 'minimax-15' },
  sfx: { prompt: 'cup clink', start: 1, duration: 2 },
});
const { scope, max_cost } = buildScope(edit, 4, params);
const stored = jsonbRoundTrip({ scope, max_cost }) as Row;
const stepParams = (s: string) => (stored.scope.steps as Row[]).find((x) => x.step === s)?.params ?? {};

const STEPS: AssemblyStep[] = ['voiceover', 'music', 'sfx', 'subtitles', 'export', 'frame_check', 'spot_ai_qa'];

for (const step of STEPS) {
  Deno.test(`${step}: cost doc re-read from jsonb (reordered keys) still matches`, () => {
    assert(stepCostMatches(step, stepParams(step), stored.max_cost), `${step} must pass`);
  });
  Deno.test(`${step}: a genuinely changed approved value fails`, () => {
    const tampered = structuredClone(stored.max_cost);
    tampered.per_step[step].provider = 'Other provider';
    assert(!stepCostMatches(step, stepParams(step), tampered));
  });
}

Deno.test('voiceover: exact persisted order from 5ef28318 passes (regression)', () => {
  const persisted = { per_step: { voiceover: { chars: 25, internal: 'unknown (character-based, not metered in code)', provider: 'ElevenLabs TTS', user_price: 'no wallet charge today' } } };
  assert(stepCostMatches('voiceover', { text: 'Dein Kaffee, dein Moment.' }, persisted));
  assert(!stepCostMatches('voiceover', { text: 'Dein Kaffee, dein Moment!!' }, persisted), 'changed chars must fail');
});

Deno.test('music: changed engine/price fails', () => {
  assert(!stepCostMatches('music', { ...stepParams('music'), tier: 'stable-audio-25' }, stored.max_cost));
});

Deno.test('approval fingerprint covers scope + max_cost and ignores key order', async () => {
  const fp = await approvalFingerprint(scope, max_cost);
  assertEquals(fp, await approvalFingerprint(stored.scope, stored.max_cost));
  assertNotEquals(fp, await approvalFingerprint(scope, { ...max_cost, wallet_usd_max: 0.55 }));
  assertNotEquals(fp, await approvalFingerprint(scope, { ...max_cost, legacy_credits_max: 6 }));
  assertNotEquals(fp, await approvalFingerprint({ ...scope, cut_seconds: 31 }, max_cost));
});

Deno.test('jsonEqual is semantic', () => {
  assert(jsonEqual({ a: 1, b: [{ x: 1, y: 2 }] }, { b: [{ y: 2, x: 1 }], a: 1 }));
  assert(!jsonEqual({ a: 1 }, { a: 2 }));
  assert(!jsonEqual([1, 2], [2, 1]));
});

import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  isModelUnlocked,
  isTestAllowlisted,
  VIDEO_ENHANCE_SPECS,
} from '../_shared/video-enhance-models.ts';

const TEST_USER = '8948d3d9-2c5e-4405-9e9c-1624448e7189';
const OTHER_USER = '43d88fa6-9341-4094-8cf8-7fc175ffa696';
/**
 * Documented allowlist member (internal QA account REDACTED_ACCOUNT_EMAIL).
 * The allowlist exists ONLY for controlled test-only behaviour such as the
 * fail-once persistence test. Regular model access depends on the global
 * backend switches, never on this list.
 */
const DOCUMENTED_ALLOWLIST = [TEST_USER];
/** Normal production user used for the non-allowlisted smoke runs. */
const SMOKE_USER = 'ee1f91c5-b61d-4188-8e95-da419e376c59';

/** Mirrors production: both backend switches off, only the allowlist is set. */
function envWith(allowlist: string) {
  return (key: string): string | undefined => {
    if (key === 'VIDEO_ENHANCE_TEST_USER_IDS') return allowlist;
    return undefined;
  };
}

Deno.test('allowlist: exact id unlocks, other users stay blocked', () => {
  const env = envWith(TEST_USER);
  assertEquals(isTestAllowlisted(env, TEST_USER), true);
  assertEquals(isTestAllowlisted(env, OTHER_USER), false);
  assertEquals(isTestAllowlisted(env, undefined), false);
});

Deno.test('allowlist: parsing tolerates whitespace, commas and empty entries', () => {
  assertEquals(isTestAllowlisted(envWith(` ${TEST_USER} `), TEST_USER), true);
  assertEquals(isTestAllowlisted(envWith(`,,${TEST_USER},,`), TEST_USER), true);
  assertEquals(isTestAllowlisted(envWith(`${OTHER_USER}, ${TEST_USER}`), TEST_USER), true);
  assertEquals(isTestAllowlisted(envWith(''), TEST_USER), false);
  assertEquals(isTestAllowlisted(envWith('   '), TEST_USER), false);
  // No partial or prefix matches.
  assertEquals(isTestAllowlisted(envWith(TEST_USER.slice(0, 20)), TEST_USER), false);
});

Deno.test('allowlist unlocks Topaz AND ByteDance while both backend flags stay off', () => {
  const env = envWith(TEST_USER);
  for (const id of ['topaz-video-upscale', 'bytedance-vcube']) {
    const spec = VIDEO_ENHANCE_SPECS[id];
    assertEquals(env(spec.backendFlag), undefined, `${id}: backend flag must stay off`);
    assertEquals(isModelUnlocked(spec, env, TEST_USER), true, `${id}: test account must be unlocked`);
    assertEquals(isModelUnlocked(spec, env, OTHER_USER), false, `${id}: other users must stay blocked`);
    assertEquals(isModelUnlocked(spec, env, undefined), false, `${id}: anonymous must stay blocked`);
  }
});

Deno.test('backend flag only unlocks globally on the exact string "true"', () => {
  const spec = VIDEO_ENHANCE_SPECS['topaz-video-upscale'];
  const flagEnv = (value: string) => (key: string) =>
    key === spec.backendFlag ? value : undefined;
  assertEquals(isModelUnlocked(spec, flagEnv('true'), OTHER_USER), true);
  assertEquals(isModelUnlocked(spec, flagEnv('TRUE'), OTHER_USER), false);
  assertEquals(isModelUnlocked(spec, flagEnv('1'), OTHER_USER), false);
  assertEquals(isModelUnlocked(spec, flagEnv('yes'), OTHER_USER), false);
});

Deno.test('live environment: the deployed allowlist contains exactly the test account', () => {
  const raw = Deno.env.get('VIDEO_ENHANCE_TEST_USER_IDS');
  if (raw === undefined) return; // not available in the local runner
  const ids = raw.split(',').map((v) => v.trim()).filter(Boolean);
  assertEquals(ids, DOCUMENTED_ALLOWLIST);
  assertEquals(ids.includes(SMOKE_USER), false, 'smoke user must never be allowlisted');
});

Deno.test('empty or whitespace-only allowlist privileges nobody', () => {
  for (const raw of ['', ' ', ' , ', ',,']) {
    const env = (key: string) => (key === 'VIDEO_ENHANCE_TEST_USER_IDS' ? raw : undefined);
    assertEquals(isTestAllowlisted(env, TEST_USER), false, `raw="${raw}"`);
    assertEquals(isTestAllowlisted(env, OTHER_USER), false, `raw="${raw}"`);
  }
  const missing = (_key: string) => undefined;
  assertEquals(isTestAllowlisted(missing, TEST_USER), false);
});

Deno.test('live environment: global switches unlock both models for a NON-allowlisted user', () => {
  const raw = Deno.env.get('VIDEO_ENHANCE_TEST_USER_IDS');
  if (raw === undefined) return; // not available in the local runner
  const env = (key: string) => Deno.env.get(key);
  assertEquals(isTestAllowlisted(env, SMOKE_USER), false);
  for (const [id, spec] of Object.entries(VIDEO_ENHANCE_SPECS)) {
    assertEquals(env(spec.backendFlag), 'true', `${id}: global switch must be on`);
    assertEquals(isModelUnlocked(spec, env, SMOKE_USER), true, `${id}: must run without the allowlist`);
  }
});

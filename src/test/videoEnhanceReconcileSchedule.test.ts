import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';

import {
  decideCycle,
  isInternalCaller,
  MIN_CYCLE_INTERVAL_MS,
  timingSafeEqual,
} from '../../supabase/functions/_shared/video-enhance-reconcile-guard.ts';

/**
 * The reconcile schedule and its endpoint guard.
 *
 * The schedule is a piece of project setup that used to live only in the
 * database. Its canonical definition now lives in the repo
 * (docs/video-enhance-reconcile-schedule.md — not a migration, because it
 * embeds the project URL and key, which must not replay on remixes). This
 * suite pins it: the statement must be idempotent, target the reconciler, and
 * carry no privileged key. Should a migration ever touch the job, it is held
 * to the same shape. The guard is exercised as code, not as text.
 */

const JOB = 'video-enhance-reconcile-5min';
const FUNCTION_URL = /https:\/\/[a-z0-9]+\.supabase\.co\/functions\/v1\/video-enhance-reconcile/;

function jwtRoles(sql: string): string[] {
  const tokens = sql.match(/eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g) ?? [];
  return tokens.map((token) => {
    const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return String(JSON.parse(Buffer.from(payload, 'base64').toString('utf8')).role ?? '');
  });
}

function assertScheduleStatement(sql: string, label: string) {
  expect(sql, `${label}: names the job`).toContain(`'${JOB}'`);
  expect(sql, `${label}: five-minute cadence`).toContain(`'*/5 * * * *'`);
  expect(sql, `${label}: guarded unschedule before schedule`).toMatch(
    new RegExp(`perform cron\\.unschedule\\('${JOB}'\\);[\\s\\S]*?exception[\\s\\S]*?cron\\.schedule\\(`, 'i'),
  );
  expect(sql, `${label}: calls the reconciler over pg_net`).toMatch(/net\.http_post\(/);
  expect(sql, `${label}: targets the reconcile function`).toMatch(FUNCTION_URL);
  expect(sql, `${label}: sends the cron trigger body`).toContain(`body:='{"trigger":"cron"}'::jsonb`);
  expect(sql, `${label}: never reads a privileged setting`).not.toMatch(/service_role_key|current_setting\(/);
  const roles = jwtRoles(sql);
  expect(roles.length, `${label}: carries a key`).toBeGreaterThan(0);
  for (const role of roles) expect(role, `${label}: only the publishable key`).toBe('anon');
}

describe('reconcile schedule — repository definition', () => {
  const doc = readFileSync('docs/video-enhance-reconcile-schedule.md', 'utf8');
  const docSql = doc.match(/```sql\n([\s\S]*?)```/)?.[1] ?? '';

  it('is documented as an idempotent statement with the publishable key only', () => {
    assertScheduleStatement(docSql, 'docs');
  });

  it('repository migrations that touch the job carry the same idempotent shape', () => {
    const dir = 'supabase/migrations';
    const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.sql')) : [];
    const touching = files.filter((f) => readFileSync(`${dir}/${f}`, 'utf8').includes(JOB));
    for (const file of touching) {
      assertScheduleStatement(readFileSync(`${dir}/${file}`, 'utf8'), file);
    }
    // At most one migration may own the job; the docs statement is canonical.
    expect(touching.length).toBeLessThanOrEqual(1);
  });
});

describe('reconcile endpoint — caller guard', () => {
  const ANON = 'anon-key-value';
  const SERVICE = 'service-role-key-value';
  const env = (overrides: Record<string, string | undefined> = {}) => (key: string) =>
    ({ SUPABASE_ANON_KEY: ANON, SUPABASE_SERVICE_ROLE_KEY: SERVICE, ...overrides })[key];

  it('accepts the publishable key as Bearer or apikey (what pg_cron sends)', () => {
    expect(isInternalCaller(new Headers({ Authorization: `Bearer ${ANON}` }), env())).toBe(true);
    expect(isInternalCaller(new Headers({ apikey: ANON }), env())).toBe(true);
    expect(isInternalCaller(new Headers({ Authorization: `Bearer ${SERVICE}` }), env())).toBe(true);
  });

  it('rejects a user JWT, a wrong key and an empty header', () => {
    const userJwt = 'REDACTED_TOKEN_CONFIGURE_ON_TARGET';
    expect(isInternalCaller(new Headers({ Authorization: `Bearer ${userJwt}` }), env())).toBe(false);
    expect(isInternalCaller(new Headers({ Authorization: `Bearer ${userJwt}`, apikey: userJwt }), env())).toBe(false);
    // A browser client always sends the public apikey alongside its user JWT.
    expect(isInternalCaller(new Headers({ Authorization: `Bearer ${userJwt}`, apikey: ANON }), env())).toBe(false);
    const subJwt = `eyJhbGciOiJIUzI1NiJ9.${btoa(JSON.stringify({ sub: 'u-1', role: 'authenticated' }))}.sig`;
    expect(isInternalCaller(new Headers({ Authorization: `Bearer ${subJwt}`, apikey: ANON }), env())).toBe(false);
    expect(isInternalCaller(new Headers({ Authorization: 'Bearer ' }), env())).toBe(false);
    expect(isInternalCaller(new Headers(), env())).toBe(false);
    // no keys configured at all -> nothing is accepted
    expect(
      isInternalCaller(new Headers({ Authorization: `Bearer ${ANON}` }), env({ SUPABASE_ANON_KEY: undefined, SUPABASE_SERVICE_ROLE_KEY: undefined })),
    ).toBe(false);
  });

  it('honours CRON_SECRET when configured and ignores a wrong one', () => {
    const withSecret = env({ CRON_SECRET: 's3cret' });
    expect(isInternalCaller(new Headers({ 'x-cron-secret': 's3cret' }), withSecret)).toBe(true);
    expect(isInternalCaller(new Headers({ 'x-cron-secret': 'nope' }), withSecret)).toBe(false);
    // header present but no secret configured -> not a bypass
    expect(isInternalCaller(new Headers({ 'x-cron-secret': 'anything' }), env())).toBe(false);
  });

  it('compares in constant shape', () => {
    expect(timingSafeEqual('abc', 'abc')).toBe(true);
    expect(timingSafeEqual('abc', 'abd')).toBe(false);
    expect(timingSafeEqual('abc', 'ab')).toBe(false);
  });
});

describe('reconcile endpoint — burst guard', () => {
  it('runs once, throttles inside the window, refuses to overlap', () => {
    const state = { inFlight: false, lastStartedAt: 0 };
    const t0 = 1_000_000;
    expect(decideCycle(state, t0)).toEqual({ run: true });
    state.lastStartedAt = t0;
    expect(decideCycle(state, t0 + 5_000)).toEqual({
      run: false,
      skipped: 'throttled',
      retryInMs: MIN_CYCLE_INTERVAL_MS - 5_000,
    });
    expect(decideCycle(state, t0 + MIN_CYCLE_INTERVAL_MS)).toEqual({ run: true });
    state.inFlight = true;
    expect(decideCycle(state, t0 + 10 * MIN_CYCLE_INTERVAL_MS)).toEqual({ run: false, skipped: 'in_flight' });
  });

  it('the reconciler wires the guard and always releases the in-flight flag', () => {
    const src = readFileSync('supabase/functions/video-enhance-reconcile/index.ts', 'utf8');
    expect(src).toMatch(/isInternalCaller\(req\.headers/);
    expect(src).toMatch(/decideCycle\(cycle, Date\.now\(\)\)/);
    expect(src).toMatch(/finally \{\s*cycle\.inFlight = false;\s*\}/);
    // never reads the body, never returns rows
    expect(src).not.toMatch(/req\.(json|text|formData|arrayBuffer)\(/);
    expect(src).not.toMatch(/json\(\{[^}]*\brun(s)?:/);
    // every scan is gated by its own timestamp and advances it
    expect(src).toMatch(/next_reconcile_at/);
    expect(src).toMatch(/next_late_check_at/);
    expect(src).toMatch(/source: ['"]unavailable['"]/);
  });
});

describe('customer surfaces — before, during, after a run', () => {
  const surfaces = {
    studio: readFileSync('src/components/ai-video/EnhanceVideoPanel.tsx', 'utf8'),
    directorsCut: readFileSync('src/components/directors-cut/features/AIVideoUpscaling.tsx', 'utf8'),
  };

  it.each(Object.entries(surfaces))('%s shows plan, live engine and target verdict', (_name, src) => {
    // before: per-tier frames, blocked tiers, delivery plan with both engines
    expect(src).toMatch(/describeResolutionChoices\(/);
    expect(src).toMatch(/data-blocked=/);
    expect(src).toMatch(/resolveExecutionEngine\(/);
    expect(src).toMatch(/enhance-delivery-plan/);
    // during: real executing engine + elapsed clock from the run row
    expect(src).toMatch(/<EnhanceRunProgress\b/);
    // after: explicit target verdict, codec and container as separate facts
    expect(src).toMatch(/enhance-target-match/);
    expect(src).toMatch(/targetMatchLabel\(/);
    expect(src).toMatch(/deliveredFacts\(/);
  });

  it('the progress strip ticks from the server timestamp and names the executing engine', () => {
    const src = readFileSync('src/components/ai-video/EnhanceRunProgress.tsx', 'utf8');
    expect(src).toMatch(/setInterval\(/);
    expect(src).toMatch(/elapsedSecondsSince\(/);
    expect(src).toMatch(/runEngines\(/);
    expect(src).toMatch(/formatClock\(/);
  });
});

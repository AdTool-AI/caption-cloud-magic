/**
 * Retry approvals: binding checks (pure) and retry_shot end-to-end against an
 * in-memory database with a MOCKED provider transport. No network, no money.
 */
import { assert, assertEquals } from 'jsr:@std/assert@1';
import { buildRetryRequest, checkRetryBinding, planFingerprint, toProviderBody, type RetryBinding } from './retryBinding.ts';
import { retryShot } from './production.ts';
import { CATALOG_VERSION } from '../../videoPricingCatalog.ts';
import type { ToolContext } from '../toolRuntime.ts';

const USER = 'u-1';
const CAMP = 'c-1';
const SHOT = 's-2';
const FUTURE = () => new Date(Date.now() + 10 * 60_000).toISOString();
const PAST = () => new Date(Date.now() - 60_000).toISOString();

const baseShot = () => ({
  id: SHOT, campaign_id: CAMP, user_id: USER, video_id: 'v-1', shot_index: 2, status: 'needs_retry',
  selected_model: 'kling-3', english_prompt: 'old prompt', duration_s: 8, resolution: '1080p', aspect_ratio: '9:16',
  attempt_count: 1, retry_prompt: 'new prompt: exactly one egg', retry_model: 'seedance-pro',
  retry_plan: {
    version: 1, prepared_at: '2026-10-03T15:33:02.807Z',
    proposed: { model: 'seedance-pro', mode: 't2v', duration_s: 8, resolution: '720p', input_asset_id: null },
    negative_constraints: 'no hands, no text',
    cost: { retry_cost: 2.48, currency: 'USD', pricing_version: CATALOG_VERSION },
  },
});

async function boundApproval(shot = baseShot(), patch: Record<string, unknown> = {}, bindingPatch: Partial<RetryBinding> = {}) {
  const request = buildRetryRequest(shot, 'generate-seedance-video')!;
  const binding: RetryBinding = {
    campaign_id: CAMP, shot_id: SHOT, attempt_no: 2, plan_prepared_at: shot.retry_plan.prepared_at,
    plan_fingerprint: await planFingerprint(shot, request), request, currency: 'USD',
    max_cost: 2.48, estimated_cost: 2.48, pricing_version: CATALOG_VERSION, ...bindingPatch,
  };
  return {
    id: 'ap-1', campaign_id: CAMP, user_id: USER, kind: 'retry', status: 'approved', consumed_at: null,
    max_total: 2.48, start_expires_at: FUTURE(), execution_expires_at: FUTURE(), retry_binding: binding,
    scope: [{ shot_id: SHOT }], ...patch,
  };
}

// ---------------------------------------------------------------------------
// Minimal in-memory Supabase mock (select/eq/in/order/limit/maybeSingle/update/insert/upsert + rpc)
// ---------------------------------------------------------------------------
// deno-lint-ignore no-explicit-any
type Row = Record<string, any>;
function mockDb(tables: Record<string, Row[]>) {
  const calls: string[] = [];
  // deno-lint-ignore no-explicit-any
  const builder = (table: string): any => {
    const filters: Array<(r: Row) => boolean> = [];
    let op: 'select' | 'update' | 'insert' | 'upsert' = 'select';
    let payload: Row | null = null;
    let single = false;
    const rows = () => (tables[table] ??= []);
    const run = () => {
      if (op === 'insert' || op === 'upsert') { rows().push({ ...payload }); return { data: [payload], error: null }; }
      const hit = rows().filter((r) => filters.every((f) => f(r)));
      if (op === 'update') { hit.forEach((r) => Object.assign(r, payload)); return { data: hit, error: null }; }
      return { data: single ? hit[0] ?? null : hit, error: null };
    };
    const b = {
      select: () => b, order: () => b, limit: () => b, not: () => b, gt: () => b,
      eq: (k: string, v: unknown) => { filters.push((r) => r[k] === v); return b; },
      in: (k: string, v: unknown[]) => { filters.push((r) => v.includes(r[k])); return b; },
      is: (k: string, v: unknown) => { filters.push((r) => (r[k] ?? null) === v); return b; },
      update: (p: Row) => { op = 'update'; payload = p; calls.push(`update:${table}`); return b; },
      insert: (p: Row) => { op = 'insert'; payload = p; calls.push(`insert:${table}`); return b; },
      upsert: (p: Row) => { op = 'upsert'; payload = p; calls.push(`upsert:${table}`); return b; },
      maybeSingle: () => { single = true; return Promise.resolve(run()); },
      single: () => { single = true; return Promise.resolve(run()); },
      then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(run()).then(res, rej),
    };
    return b;
  };
  const admin = {
    from: (t: string) => builder(t),
    rpc: async (name: string, a: Row) => {
      calls.push(`rpc:${name}`);
      if (name === 'consume_retry_approval') {
        // Same compare-and-set semantics as the SQL function (single conditional UPDATE).
        await Promise.resolve();
        const r = tables.campaign_budget_approvals.find((x) => x.id === a._approval_id);
        const ok = !!r && r.user_id === a._user_id && r.kind === 'retry' && r.status === 'approved' && !r.consumed_at
          && new Date(r.start_expires_at).getTime() > Date.now() && r.retry_binding?.shot_id === a._shot_id
          && Number(r.retry_binding?.attempt_no) === a._attempt_no && r.retry_binding?.plan_fingerprint === a._plan_fingerprint;
        if (ok) Object.assign(r, { status: 'started', consumed_at: new Date().toISOString(), consumed_attempt_no: a._attempt_no });
        return { data: ok, error: null };
      }
      if (name === 'reserve_campaign_spend' || name === 'campaign_ledger_entry') {
        tables.campaign_spend_ledger.push({ key: a._key, approval_id: a._approval_id, amount: a._amount, entry_type: a._entry_type ?? 'reserve' });
        return { data: true, error: null };
      }
      return { data: null, error: null };
    },
  };
  return { admin, tables, calls };
}

function ctxWith(admin: unknown, providerCalls: Array<{ url: string; body: Row }>): ToolContext {
  return {
    userId: USER, conversationId: 'conv-1', admin, userJwt: 'jwt', supabaseUrl: 'https://mock.local', anonKey: 'anon',
    museConfig: { apiKey: '', baseUrl: '', model: '', maxToolIterations: 0, maxRegenerations: 0, maxTurnSpend: 0 },
    regenerationsUsed: 0, maxRegenerations: 0, maxTurnSpend: 0, spentThisTurn: 0,
    fetchImpl: (async (url: string, init: RequestInit) => {
      providerCalls.push({ url: String(url), body: JSON.parse(String(init.body)) });
      return new Response(JSON.stringify({ generationId: `gen-${providerCalls.length}` }), { status: 200 });
    }) as unknown as typeof fetch,
  };
}

async function setup(approvals: Row[], shot = baseShot()) {
  const db = mockDb({
    campaign_shots: [shot], campaign_budget_approvals: approvals, campaign_spend_ledger: [],
    campaign_shot_attempts: [], agent_tasks: [], campaign_assets: [],
    ai_video_wallets: [{ user_id: USER, currency: 'USD' }],
  });
  const provider: Array<{ url: string; body: Row }> = [];
  return { db, provider, ctx: ctxWith(db.admin, provider) };
}

// ---------------------------------------------------------------------------
// Pure binding checks
// ---------------------------------------------------------------------------

async function check(approvalPatch: Record<string, unknown>, bindingPatch: Partial<RetryBinding> = {}, input: Record<string, unknown> = {}) {
  const shot = baseShot();
  const request = buildRetryRequest(shot, 'generate-seedance-video')!;
  const approval = await boundApproval(shot, approvalPatch, bindingPatch);
  return checkRetryBinding({
    approval, campaignId: CAMP, shotId: SHOT, attemptNo: 2, request, fingerprint: await planFingerprint(shot, request),
    currency: 'USD', cost: 2.48, pricingVersion: CATALOG_VERSION, ...input,
  });
}

Deno.test('binding: exact match passes', async () => {
  assertEquals(await check({}), { ok: true });
});
Deno.test('binding: old approval without binding is rejected (never silently reused)', async () => {
  assertEquals((await check({ kind: 'production', retry_binding: null })).ok, false);
  const r = await check({ kind: 'production', retry_binding: null });
  assert(!r.ok && r.code === 'UNBOUND_APPROVAL');
});
Deno.test('binding: wrong shot / attempt / campaign are rejected', async () => {
  const s = await check({}, {}, { shotId: 's-other' });
  assert(!s.ok && s.code === 'WRONG_SHOT');
  const at = await check({}, {}, { attemptNo: 3 });
  assert(!at.ok && at.code === 'WRONG_ATTEMPT');
  const c = await check({}, {}, { campaignId: 'c-other' });
  assert(!c.ok && c.code === 'WRONG_CAMPAIGN');
});
Deno.test('binding: model, provider, resolution, mode, references and plan version changes are rejected', async () => {
  const shot = baseShot();
  const req = buildRetryRequest(shot, 'generate-seedance-video')!;
  const fp = await planFingerprint(shot, req);
  const approval = await boundApproval(shot);
  const base = { approval, campaignId: CAMP, shotId: SHOT, attemptNo: 2, fingerprint: fp, currency: 'USD', cost: 2.48, pricingVersion: CATALOG_VERSION };
  for (const [field, value] of [['model', 'wan-2.7-pro'], ['provider', 'generate-wan-video'], ['resolution', '1080p'], ['mode', 'i2v'], ['reference_urls', ['https://x/ref.png']], ['duration_s', 5], ['prompt', 'changed'], ['negative_prompt', null], ['aspect_ratio', '16:9']] as const) {
    const r = checkRetryBinding({ ...base, request: { ...req, [field]: value } });
    assert(!r.ok && r.code === 'REQUEST_CHANGED' && r.field === field, `expected REQUEST_CHANGED for ${field}`);
  }
  const replanned = { ...shot, retry_plan: { ...shot.retry_plan, prepared_at: '2026-10-07T00:00:00Z' } };
  const r = checkRetryBinding({ ...base, request: req, fingerprint: await planFingerprint(replanned, req) });
  assert(!r.ok && r.code === 'PLAN_CHANGED');
});
Deno.test('binding: currency, price version, cost above limit, expired, consumed, pending are rejected', async () => {
  const cur = await check({}, {}, { currency: 'EUR' });
  assert(!cur.ok && cur.code === 'CURRENCY_CHANGED');
  const pv = await check({}, {}, { pricingVersion: 'other' });
  assert(!pv.ok && pv.code === 'PRICE_CHANGED');
  const over = await check({}, {}, { cost: 2.49 });
  assert(!over.ok && over.code === 'COST_OVER_LIMIT');
  assertEquals(await check({}, {}, { cost: 2.0 }), { ok: true }); // actual cost may be below the limit
  const raised = await check({ max_total: 5 });
  assert(!raised.ok && raised.code === 'COST_OVER_LIMIT'); // limit on the row must equal the bound limit
  const exp = await check({ start_expires_at: PAST() });
  assert(!exp.ok && exp.code === 'APPROVAL_EXPIRED');
  const used = await check({ consumed_at: PAST() });
  assert(!used.ok && used.code === 'APPROVAL_CONSUMED');
  const pending = await check({ status: 'pending' });
  assert(!pending.ok && pending.code === 'APPROVAL_NOT_APPROVED');
});

// ---------------------------------------------------------------------------
// retry_shot with mocked provider
// ---------------------------------------------------------------------------

Deno.test('retry_shot: provider receives exactly the bound values', async () => {
  const { ctx, provider, db } = await setup([await boundApproval()]);
  const r = await retryShot(ctx, { shot_id: SHOT });
  assertEquals(r.output.started, true, JSON.stringify(r.output));
  assertEquals(provider.length, 1);
  assert(provider[0].url.endsWith('/functions/v1/generate-seedance-video'));
  const bound = db.tables.campaign_budget_approvals[0].retry_binding.request;
  assertEquals(provider[0].body, toProviderBody(bound));
  assertEquals(provider[0].body, { model: 'seedance-pro', prompt: 'new prompt: exactly one egg', duration: 8, aspectRatio: '9:16', resolution: '720p', negativePrompt: 'no hands, no text' });
  assertEquals(db.tables.campaign_budget_approvals[0].status, 'started');
  assertEquals(db.tables.campaign_spend_ledger.filter((l) => l.entry_type === 'reserve').map((l) => l.amount), [2.48]);
});

Deno.test('retry_shot: two parallel starts consume the approval once and call the provider once', async () => {
  const { ctx, provider, db } = await setup([await boundApproval()]);
  const [a, b] = await Promise.all([retryShot(ctx, { shot_id: SHOT }), retryShot(ctx, { shot_id: SHOT })]);
  const started = [a, b].filter((r) => r.output.started).length;
  assertEquals(started, 1);
  assertEquals([a, b].map((r) => r.output.code).filter(Boolean), ['APPROVAL_CONSUMED']);
  assertEquals(provider.length, 1);
  assertEquals(db.tables.campaign_spend_ledger.filter((l) => l.entry_type === 'reserve').length, 1);
});

Deno.test('retry_shot: old campaign approval without binding never starts a retry', async () => {
  const old = { id: 'old', campaign_id: CAMP, user_id: USER, kind: 'production', status: 'started', max_total: 6.8, scope: [{ shot_id: SHOT }], start_expires_at: PAST(), execution_expires_at: FUTURE() };
  const { ctx, provider } = await setup([old]);
  const r = await retryShot(ctx, { shot_id: SHOT });
  assertEquals(r.output.code, 'UNBOUND_APPROVAL');
  const explicit = await retryShot(ctx, { shot_id: SHOT, approval_id: '00000000-0000-0000-0000-000000000000' });
  assertEquals(explicit.output.code, 'UNBOUND_APPROVAL');
  assertEquals(provider.length, 0);
});

Deno.test('retry_shot: re-prepared plan invalidates the old approval', async () => {
  const approval = await boundApproval();
  const shot = baseShot();
  shot.retry_plan.prepared_at = '2026-10-08T00:00:00Z'; // plan re-prepared after approval
  const { ctx, provider } = await setup([approval], shot);
  const r = await retryShot(ctx, { shot_id: SHOT });
  assertEquals(r.output.code, 'PLAN_CHANGED');
  assertEquals(provider.length, 0);
});

Deno.test('retry_shot: changed model in the stored plan is rejected', async () => {
  const approval = await boundApproval();
  const shot = baseShot();
  shot.retry_plan.proposed.model = 'seedance-standard';
  const { ctx, provider } = await setup([approval], shot);
  const r = await retryShot(ctx, { shot_id: SHOT });
  assertEquals(r.output.code, 'REQUEST_CHANGED');
  assertEquals(provider.length, 0);
});

Deno.test('retry_shot: background worker can never execute a retry', async () => {
  const { ctx, provider } = await setup([await boundApproval()]);
  const r = await retryShot(ctx, { shot_id: SHOT }, { fromWorker: true });
  assertEquals(r.output.code, 'TOOL_NOT_ALLOWED');
  assertEquals(provider.length, 0);
});

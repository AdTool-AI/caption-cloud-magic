import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { overrideCampaignShotRouting, updateCampaignVideoMetadata, type PricingDeps } from './planningOverrides.ts';
import { planningEstimate } from './routing.ts';
import { resolveCostPerSecond } from '../../videoPricingCatalog.ts';
import { PLANNING_TOOLS } from '../turnPolicy.ts';

// deno-lint-ignore no-explicit-any
type Row = Record<string, any>;

function fakeDb(tables: Record<string, Row[]>) {
  const q = (t: string) => {
    const filters: ((r: Row) => boolean)[] = [];
    let op: 'select' | 'update' | 'insert' = 'select';
    let patch: Row = {};
    let lim = Infinity;
    const rows = () => (tables[t] ??= []).filter((r) => filters.every((f) => f(r)));
    const exec = () => {
      if (op === 'insert') { tables[t] ??= []; const r = { id: `a-${tables[t].length + 1}`, ...patch }; tables[t].push(r); return { data: [r], error: null }; }
      if (op === 'update') { const hit = rows(); hit.forEach((r) => Object.assign(r, structuredClone(patch))); return { data: hit, error: null }; }
      return { data: rows().slice(0, lim), error: null };
    };
    const b: Row = {
      select: () => b, order: () => b, limit: (n: number) => { lim = n; return b; },
      eq: (k: string, v: unknown) => { filters.push((r) => r[k] === v); return b; },
      in: (k: string, v: unknown[]) => { filters.push((r) => v.includes(r[k])); return b; },
      is: (k: string, v: unknown) => { filters.push((r) => (r[k] ?? null) === v); return b; },
      update: (p: Row) => { op = 'update'; patch = p; return b; },
      insert: (p: Row) => { op = 'insert'; patch = p; return b; },
      maybeSingle: async () => { const r = exec(); return { data: r.data?.[0] ?? null, error: r.error }; },
      then: (res: (v: unknown) => void) => res(exec()),
    };
    return b;
  };
  return { from: q };
}

const U = 'u1', C = 'c1';
function setup() {
  const videos = [1, 2, 3, 4, 5, 6].map((i) => ({ id: `v${i}`, campaign_id: C, user_id: U, video_index: i, hook_text: `h${i}`, main_message: `m${i}`, hero_subject: `s${i}`, script: { lines: [i] } }));
  const shots = [1, 2, 3, 4, 5, 6].map((i) => ({
    id: `s${i}`, campaign_id: C, user_id: U, video_id: 'v1', shot_index: i, start_s: (i - 1) * 5, end_s: i * 5,
    status: 'quoted', selected_model: 'wan-2-7-pro', resolution: '1080p', duration_s: 5, generation_duration_s: 5,
    generation_mode: 't2v', aspect_ratio: '9:16', estimated_cost: 1.3, routing_rationale: { chosen: 'wan-2-7-pro', candidates: [] },
    description: 'd', purpose: 'p', shot_type: 'close', subject_emphasis: 'product',
  }));
  const tables: Record<string, Row[]> = {
    agent_campaigns: [{ id: C, user_id: U }], campaign_videos: videos, campaign_shots: shots,
    campaign_shot_attempts: [], campaign_budget_approvals: [], campaign_planning_audit: [],
    campaign_spend_ledger: [], ai_video_transactions: [], ai_video_generations: [], ai_video_wallets: [{ user_id: U, balance: 92.32 }],
  };
  const ctx = { userId: U, conversationId: 'x', admin: fakeDb(tables) } as never;
  return { tables, ctx };
}
const deps: PricingDeps = { currency: async () => 'USD', discount: async () => 1 };
const args = (extra: Row = {}) => ({ campaign_id: C, video_id: 'v1', shot_id: 's1', model: 'kling-3', override_reason: 'user choice', user_approved: true, ...extra });
const snapshot = (t: Record<string, Row[]>) => JSON.stringify([t.campaign_budget_approvals, t.campaign_spend_ledger, t.ai_video_transactions, t.ai_video_generations, t.ai_video_wallets]);

Deno.test('metadata patch changes only Video 1 copy; videos 2–6, scripts, shots unchanged', async () => {
  const { tables, ctx } = setup();
  const others = JSON.stringify(tables.campaign_videos.slice(1));
  const shots = JSON.stringify(tables.campaign_shots);
  const r = await updateCampaignVideoMetadata(ctx, { campaign_id: C, video_id: 'v1', fields: { hook_text: 'neu', hero_subject: 'Pancake' } });
  assert(!(r.output as Row).error);
  assertEquals(tables.campaign_videos[0].hook_text, 'neu');
  assertEquals(tables.campaign_videos[0].script, { lines: [1] });
  assertEquals(JSON.stringify(tables.campaign_videos.slice(1)), others);
  assertEquals(JSON.stringify(tables.campaign_shots), shots);
  assertEquals(tables.campaign_planning_audit.length, 1);
  assertEquals(tables.campaign_planning_audit[0].before.hook_text, 'h1');
});

Deno.test('metadata patch rejects unknown fields, commercial_angle and foreign campaigns', async () => {
  const { ctx } = setup();
  assertEquals(((await updateCampaignVideoMetadata(ctx, { campaign_id: C, video_id: 'v1', fields: { script: 'x' } })).output as Row).code, 'FIELD_NOT_ALLOWED');
  assertEquals(((await updateCampaignVideoMetadata(ctx, { campaign_id: C, video_id: 'v1', fields: { commercial_angle: 'x' } })).output as Row).code, 'FIELD_NOT_ALLOWED');
  assertEquals(((await updateCampaignVideoMetadata(ctx, { campaign_id: 'other', video_id: 'v1', fields: { hook_text: 'x' } })).output as Row).code, 'NOT_FOUND');
});

Deno.test('override recalculates canonical price, ignores client price, stores audit + coherent state', async () => {
  const { tables, ctx } = setup();
  const before = snapshot(tables);
  const r = await overrideCampaignShotRouting(ctx, args({ estimated_cost: 0.01, price: 0.01 }), deps);
  const o = r.output as Row;
  const expected = planningEstimate(resolveCostPerSecond('kling-3', 'USD')!, 5, 1);
  assertEquals(o.estimated_cost, expected);
  const s = tables.campaign_shots[0];
  assertEquals([s.selected_model, s.resolution, s.duration_s, s.aspect_ratio, s.generation_mode, s.estimated_cost, s.routing_stale], ['kling-3', '1080p', 5, '9:16', 't2v', expected, false]);
  assertEquals(s.routing_rationale.automatic.chosen, 'wan-2-7-pro');
  assertEquals(s.routing_override.previous.model, 'wan-2-7-pro');
  assertEquals(tables.campaign_planning_audit.length, 1);
  assertEquals(tables.campaign_planning_audit[0].reason, 'user choice');
  // Second override keeps the ORIGINAL automatic decision and appends history.
  await overrideCampaignShotRouting(ctx, args({ model: 'kling-2.5-turbo' }), deps);
  assertEquals(tables.campaign_shots[0].routing_rationale.automatic.chosen, 'wan-2-7-pro');
  assertEquals(tables.campaign_planning_audit.length, 2);
  // Other shots untouched; no approvals, ledger, wallet or generations.
  assertEquals(tables.campaign_shots[1].selected_model, 'wan-2-7-pro');
  assertEquals(snapshot(tables), before);
});

Deno.test('override applies account discount via the same formula', async () => {
  const { ctx } = setup();
  const o = (await overrideCampaignShotRouting(ctx, args(), { currency: async () => 'USD', discount: async () => 0.8 })).output as Row;
  assertEquals(o.estimated_cost, planningEstimate(resolveCostPerSecond('kling-3', 'USD')!, 5, 0.8));
});

Deno.test('override rejects unsupported model / mode / duration / resolution / aspect', async () => {
  const cases: Array<[Row, Row, string]> = [
    [{ model: 'made-up' }, {}, 'MODEL_NOT_INTEGRATED'],
    [{}, { generation_mode: 'v2v-nope' }, 'MODE_UNSUPPORTED'],
    [{ model: 'kling-2.5-turbo' }, { duration_s: 7, generation_duration_s: 7 }, 'DURATION_UNSUPPORTED'],
    [{ resolution: '8K' }, {}, 'RESOLUTION_UNSUPPORTED'],
    [{}, { aspect_ratio: '7:3' }, 'ASPECT_UNSUPPORTED'],
  ];
  for (const [a, shotPatch, code] of cases) {
    const { tables, ctx } = setup();
    Object.assign(tables.campaign_shots[0], shotPatch);
    assertEquals(((await overrideCampaignShotRouting(ctx, args(a), deps)).output as Row).code, code);
    assertEquals(tables.campaign_planning_audit.length, 0);
  }
});

Deno.test('override requires approval + reason and planning state', async () => {
  const { tables, ctx } = setup();
  assertEquals(((await overrideCampaignShotRouting(ctx, args({ user_approved: false }), deps)).output as Row).code, 'USER_APPROVAL_REQUIRED');
  assertEquals(((await overrideCampaignShotRouting(ctx, args({ override_reason: ' ' }), deps)).output as Row).code, 'REASON_REQUIRED');
  assertEquals(((await overrideCampaignShotRouting(ctx, args({ video_id: 'v2' }), deps)).output as Row).code, 'NOT_FOUND');
  tables.campaign_shot_attempts.push({ id: 'at', shot_id: 's1' });
  assertEquals(((await overrideCampaignShotRouting(ctx, args(), deps)).output as Row).code, 'HAS_ATTEMPT');
  tables.campaign_budget_approvals.push({ id: 'ap', campaign_id: C, status: 'pending', scope: [{ shot_id: 's2' }] });
  assertEquals(((await overrideCampaignShotRouting(ctx, args({ shot_id: 's2' }), deps)).output as Row).code, 'IN_BUDGET_APPROVAL');
  tables.campaign_shots[2].current_generation_id = 'g';
  assertEquals(((await overrideCampaignShotRouting(ctx, args({ shot_id: 's3' }), deps)).output as Row).code, 'HAS_GENERATION');
});

Deno.test('both tools are individually allowed in planning mode', () => {
  assert(PLANNING_TOOLS.has('update_campaign_video_metadata'));
  assert(PLANNING_TOOLS.has('override_campaign_shot_routing'));
});

import { assert, assertEquals, assertRejects, assertThrows } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { assertTransition, canTransition, ForbiddenTransition } from './stateMachine.ts';
import { compareTurn } from './compare.ts';
import { isLoop } from './loopGuard.ts';
import { openWorkflow, runStepOnce, transitionWorkflow, VersionConflict, type Row, type WorkflowStore } from './repo.ts';
import { observeShadowTurn, runShadowSafely } from './shadow.ts';

/** In-memory store with the same semantics as the DB (unique index, CAS, atomic claim). */
function memStore(mode = 'shadow') {
  const wfs: Row[] = [], steps: Row[] = [], events: Row[] = [];
  const writes: string[] = [];
  const store: WorkflowStore = {
    getMode: async () => mode as never,
    getOpen: async (c, v) => wfs.find((w) => w.conversation_id === c && w.video_id === v && w.status === 'open') ?? null,
    latestOpenForConversation: async (c) => wfs.filter((w) => w.conversation_id === c && w.status === 'open').pop() ?? null,
    insertWorkflow: async (row) => {
      if (wfs.some((w) => w.conversation_id === row.conversation_id && w.video_id === row.video_id && w.status === 'open')) return { row: null, conflict: true };
      const r = { id: crypto.randomUUID(), version: 1, status: 'open', ...row }; wfs.push(r); writes.push('agent_workflows'); return { row: { ...r }, conflict: false };
    },
    transition: async (id, ev, from, to, boundary, next, fp) => {
      const w = wfs.find((x) => x.id === id);
      if (!w || w.version !== ev || w.state !== from) return null;
      Object.assign(w, { state: to, boundary, next_action: next, state_fingerprint: fp, version: w.version + 1 }); writes.push('agent_workflows'); return w.version;
    },
    insertStep: async (row) => {
      const ex = steps.find((s) => s.user_id === row.user_id && s.workflow_id === row.workflow_id && s.idempotency_key === row.idempotency_key);
      if (ex) return { row: { ...ex }, inserted: false };
      const r = { id: crypto.randomUUID(), status: 'pending', attempt: 0, ...row }; steps.push(r); writes.push('agent_workflow_steps'); return { row: { ...r }, inserted: true };
    },
    claimStep: async (id, owner) => {
      const s = steps.find((x) => x.id === id)!;
      if (!['pending', 'failed'].includes(s.status)) return false;
      Object.assign(s, { status: 'running', lease_owner: owner, attempt: s.attempt + 1 }); return true;
    },
    finishStep: async (id, owner, status, result, error) => { const s = steps.find((x) => x.id === id)!; if (s.lease_owner === owner) Object.assign(s, { status, result, error }); },
    insertEvent: async (row) => { events.push({ ...row, created_at: events.length }); writes.push('agent_workflow_shadow_events'); },
    lastEvent: async (wid) => events.filter((e) => e.workflow_id === wid).pop() ?? null,
  };
  return { store, wfs, steps, events, writes };
}

const U = 'user-1', C = 'conv-1', V = 'video-1';
const wsState = (next: string, version = 'v1') => ({ recommended_next_action: next, state_version: version, video: { campaign_id: 'camp' }, open_approvals: next === 'approve_pending_approval' ? [{ id: 'asm-1' }] : [] });

Deno.test('forbidden transitions are rejected; allowed ones pass', () => {
  assert(canTransition('NEEDS_CUT', 'READY_FOR_ASSEMBLY'));
  assertThrows(() => assertTransition('NEEDS_CLIPS', 'DONE'), ForbiddenTransition);
  assertThrows(() => assertTransition('NEEDS_CUT', 'ASSEMBLING'), ForbiddenTransition);
  assertThrows(() => assertTransition('READY_FOR_ASSEMBLY', 'DONE'), ForbiddenTransition);
});

Deno.test('forbidden transition keeps the version; stale version conflicts (optimistic lock)', async () => {
  const m = memStore();
  const wf = await openWorkflow(m.store, { user_id: U, conversation_id: C, video_id: V, state: 'NEEDS_CLIPS' });
  await assertRejects(() => transitionWorkflow(m.store, wf, 'DONE', {}, {}, 'x'), ForbiddenTransition);
  assertEquals(m.wfs[0].version, 1);
  assertEquals(await transitionWorkflow(m.store, wf, 'NEEDS_CUT', {}, {}, 'a'), 2);
  await assertRejects(() => transitionWorkflow(m.store, wf /* still version 1 */, 'CUT_BLOCKED', {}, {}, 'b'), VersionConflict);
  assertEquals(m.wfs[0].state, 'NEEDS_CUT');
});

Deno.test('only one open workflow per (conversation, video), also under concurrent opens', async () => {
  const m = memStore();
  const [a, b] = await Promise.all([1, 2].map(() => openWorkflow(m.store, { user_id: U, conversation_id: C, video_id: V, state: 'NEEDS_CUT' })));
  assertEquals(a.id, b.id);
  assertEquals(m.wfs.length, 1);
  assertEquals((await m.store.insertWorkflow({ user_id: U, conversation_id: C, video_id: V, state: 'NEEDS_CUT' })).conflict, true);
});

Deno.test('idempotent step: same key runs once; two concurrent claims → exactly one runs', async () => {
  const m = memStore();
  const wf = await openWorkflow(m.store, { user_id: U, conversation_id: C, video_id: V, state: 'NEEDS_CUT' });
  let runs = 0;
  const p = { userId: U, workflowId: wf.id, kind: 'k', inputFingerprint: 'fp' };
  const [r1, r2] = await Promise.all([runStepOnce(m.store, { ...p, owner: 'w1' }, async () => ({ n: ++runs })), runStepOnce(m.store, { ...p, owner: 'w2' }, async () => ({ n: ++runs }))]);
  assertEquals(runs, 1);
  assertEquals([r1.ran, r2.ran].filter(Boolean).length, 1);
  const r3 = await runStepOnce(m.store, { ...p, owner: 'w3' }, async () => ({ n: ++runs }));
  assertEquals(r3.ran, false); assertEquals(runs, 1); assertEquals(m.steps.length, 1);
  // different user → different key, independent step
  await runStepOnce(m.store, { ...p, userId: 'user-2', owner: 'w4' }, async () => ({ n: ++runs }));
  assertEquals(m.steps.length, 2);
});

Deno.test('loop: same intent + same state + same next action → loop; retry after a real error → not a loop', () => {
  const s = { intent_hash: 'h', state_fingerprint: 'f', expected_next_action: 'prepare_assembly', turn_error: null };
  assert(isLoop(s, s));
  assert(!isLoop({ ...s, turn_error: 'Muse request failed.' }, s));
  assert(!isLoop({ ...s, state_fingerprint: 'f2' }, s));
  assert(!isLoop({ ...s, intent_hash: 'other' }, s));
});

Deno.test('compare: read-only single workspace read matches; legacy chain / extra reads / boundary ignored are mismatches', () => {
  assert(compareTurn('read_only', 'approve_pending_approval', [{ name: 'get_video_workspace_state', video_id: V }]).match);
  assertEquals(compareTurn('read_only', 'done', [{ name: 'get_spot_edit', video_id: V }, { name: 'get_spot_assembly', video_id: V }]).mismatch_reason, 'legacy_read_chain');
  assertEquals(compareTurn('read_only', 'done', [{ name: 'get_video_workspace_state', video_id: V }, { name: 'get_spot_edit', video_id: V }]).mismatch_reason, 'extra_reads');
  assertEquals(compareTurn('normal', 'approve_pending_approval', [{ name: 'get_video_workspace_state', video_id: V }, { name: 'prepare_spot_assembly', video_id: V }]).mismatch_reason, 'boundary_ignored');
  assertEquals(compareTurn('normal', 'prepare_assembly', [{ name: 'get_video_workspace_state', video_id: V }]).mismatch_reason, 'no_action');
  assertEquals(compareTurn('read_only', 'done', []).mismatch_reason, 'no_state_read');
});

Deno.test('shadow: records expected vs observed, writes only workflow tables, duplicate request records once', async () => {
  const m = memStore();
  const deps = { store: m.store, loadState: async () => wsState('approve_pending_approval') };
  const inp = { userId: U, conversationId: C, requestId: 'req-1', message: 'Wie ist der Stand?', mode: 'read_only' as const, observed: [{ name: 'get_video_workspace_state', video_id: V }], modelCalls: 2, turnError: null };
  const ev = await observeShadowTurn(deps, inp);
  assertEquals(ev?.expected_next_action, 'approve_pending_approval');
  assertEquals(ev?.match, true);
  assertEquals(ev?.engine_state, 'AWAITING_APPROVAL');
  assertEquals(await observeShadowTurn(deps, inp), null); // same request again
  assertEquals(m.events.length, 1);
  assert(m.writes.every((t) => t.startsWith('agent_workflow')));
  // same intent, unchanged state, new request → loop recorded (not blocked)
  const ev2 = await observeShadowTurn(deps, { ...inp, requestId: 'req-2' });
  assertEquals(ev2?.loop_detected, true);
});

Deno.test('shadow: forbidden derived transition is recorded, workflow state untouched', async () => {
  const m = memStore();
  await observeShadowTurn({ store: m.store, loadState: async () => wsState('prepare_cut') }, { userId: U, conversationId: C, requestId: 'a1', message: 'x', mode: 'read_only', observed: [{ name: 'get_video_workspace_state', video_id: V }], modelCalls: 1, turnError: null });
  const ev = await observeShadowTurn({ store: m.store, loadState: async () => wsState('wait_for_assembly', 'v2') }, { userId: U, conversationId: C, requestId: 'a2', message: 'y', mode: 'read_only', observed: [], modelCalls: 1, turnError: null });
  assertEquals(ev?.forbidden_transition, 'NEEDS_CUT->ASSEMBLING');
  assertEquals(m.wfs[0].state, 'NEEDS_CUT');
});

Deno.test('shadow off → nothing recorded; failing observer never throws into the turn', async () => {
  const m = memStore('off');
  assertEquals(await observeShadowTurn({ store: m.store, loadState: async () => { throw new Error('should not load'); } }, { userId: U, conversationId: C, requestId: 'r', message: 'm', mode: 'normal', observed: [], modelCalls: 1, turnError: null }), null);
  assertEquals(m.writes.length, 0);
  await runShadowSafely(async () => { throw new Error('db down'); });
  await runShadowSafely(() => new Promise(() => {}), 10); // hang → bounded
});

Deno.test('guard: workflow engine imports no dispatcher, pricing, wallet, approval or assembly writers', async () => {
  for (const f of ['stateMachine.ts', 'compare.ts', 'loopGuard.ts', 'repo.ts', 'shadow.ts']) {
    const src = await Deno.readTextFile(new URL(`./${f}`, import.meta.url));
    const imports = [...src.matchAll(/from '([^']+)'/g)].map((x) => x[1]);
    for (const i of imports) assert(/^\.\/|^\.\.\/state\/workspaceState\.ts$/.test(i), `${f} imports ${i}`);
    assert(!/from\('(?!agent_workflow)/.test(src), `${f} touches a non-workflow table`);
  }
});

/**
 * Shadow observer (workflow_engine_v1 = shadow). Runs AFTER a Muse turn has been
 * answered and persisted. It reads the canonical workspace state, derives the
 * engine's expected next action and compares it with what Muse did.
 * It never blocks/triggers tools, creates approvals or starts jobs, and writes
 * only to the workflow tables. Every failure is swallowed (logged).
 */
import type { NextAction } from '../state/workspaceState.ts';
import { boundaryFor, canTransition, STATE_FOR_ACTION, type WorkflowState } from './stateMachine.ts';
import { compareTurn, type ObservedCall, type TurnMode } from './compare.ts';
import { isLoop, normalizeIntent, sha256 } from './loopGuard.ts';
import { openWorkflow, runStepOnce, type Row, type WorkflowStore } from './repo.ts';

export interface ShadowInput {
  userId: string;
  conversationId: string;
  requestId: string | null;
  message: string;
  mode: TurnMode;
  observed: ObservedCall[];
  modelCalls: number;
  turnError: string | null;
}

export interface ShadowDeps {
  store: WorkflowStore;
  /** Read-only canonical state loader (get_video_workspace_state). */
  loadState: (videoId: string) => Promise<Row>;
  owner?: string;
}

export async function observeShadowTurn(deps: ShadowDeps, inp: ShadowInput): Promise<Row | null> {
  if ((await deps.store.getMode(inp.userId)) !== 'shadow') return null;

  let videoId = inp.observed.map((c) => c.video_id).filter(Boolean).pop() ?? null;
  if (!videoId) videoId = (await deps.store.latestOpenForConversation(inp.conversationId))?.video_id ?? null;
  const intent_hash = inp.message ? await sha256(normalizeIntent(inp.message)) : null;
  const counts = { tool_calls: inp.observed.length, model_calls: inp.modelCalls };

  if (!videoId) {
    const row = { user_id: inp.userId, conversation_id: inp.conversationId, request_id: inp.requestId, turn_mode: inp.mode, observed_actions: inp.observed, match: null, mismatch_reason: 'no_video_context', intent_hash, turn_error: inp.turnError, read_calls: 0, ...counts };
    await deps.store.insertEvent(row);
    return row;
  }

  const ws = await deps.loadState(videoId);
  const next = ws.recommended_next_action as NextAction;
  const target = STATE_FOR_ACTION[next];
  const fp = await sha256(String(ws.state_version));
  const approvalIds = (ws.open_approvals ?? []).map((a: Row) => a.id);
  const boundary = boundaryFor(target, approvalIds);

  const wf = await openWorkflow(deps.store, {
    user_id: inp.userId, conversation_id: inp.conversationId, campaign_id: ws.video?.campaign_id ?? null, video_id: videoId,
    state: target, boundary, next_action: { action: next }, state_fingerprint: fp, mode: 'shadow',
  });

  let forbidden: string | null = null;
  if (wf.state !== target || wf.state_fingerprint !== fp) {
    if (!canTransition(wf.state as WorkflowState, target)) forbidden = `${wf.state}->${target}`;
    else await deps.store.transition(wf.id, wf.version, wf.state, target, boundary, { action: next }, fp); // null = concurrent change; observation still recorded
  }

  const cmp = compareTurn(inp.mode, next, inp.observed);
  const prev = await deps.store.lastEvent(wf.id);
  const loop = isLoop(prev as never, { intent_hash, state_fingerprint: fp, expected_next_action: next, turn_error: inp.turnError });

  const event = {
    user_id: inp.userId, conversation_id: inp.conversationId, workflow_id: wf.id, video_id: videoId, request_id: inp.requestId,
    turn_mode: inp.mode, engine_state: target, expected_next_action: next, expected_tools: cmp.expected_tools,
    observed_actions: inp.observed, match: cmp.match, mismatch_reason: cmp.mismatch_reason, forbidden_transition: forbidden,
    loop_detected: loop, intent_hash, state_fingerprint: fp, turn_error: inp.turnError,
    tool_calls: cmp.tool_calls, read_calls: cmp.read_calls, model_calls: inp.modelCalls,
  };
  // One observation per (request, state): duplicate deliveries record nothing new.
  const obsKey = `${inp.requestId ?? crypto.randomUUID()}|${fp}`;
  const res = await runStepOnce(deps.store, { userId: inp.userId, workflowId: wf.id, kind: 'shadow_observe', inputFingerprint: obsKey, owner: deps.owner ?? 'shadow' }, async () => {
    await deps.store.insertEvent(event);
    return { recorded: true };
  });
  return res.ran ? event : null;
}

/** Safe wrapper for the agent loop: bounded time, never throws. */
export async function runShadowSafely(fn: () => Promise<unknown>, timeoutMs = 4000): Promise<void> {
  try {
    let t: number | undefined;
    await Promise.race([fn(), new Promise((r) => { t = setTimeout(r, timeoutMs); })]).finally(() => clearTimeout(t));
  } catch (e) {
    console.error('[workflow-shadow] observation failed', e instanceof Error ? e.message : String(e));
  }
}

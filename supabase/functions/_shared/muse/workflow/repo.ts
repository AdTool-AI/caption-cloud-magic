/**
 * Workflow persistence. Touches ONLY agent_workflows / agent_workflow_steps /
 * agent_workflow_shadow_events / agent_workflow_settings. Store interface so the
 * same logic runs against Postgres (atomic RPCs) or an in-memory store in tests.
 */
import { assertTransition, type WorkflowState } from './stateMachine.ts';
import { sha256 } from './loopGuard.ts';

// deno-lint-ignore no-explicit-any
export type Row = Record<string, any>;
export type EngineMode = 'off' | 'shadow' | 'internal_only';

export interface WorkflowStore {
  getMode(userId: string): Promise<EngineMode>;
  getOpen(conversationId: string, videoId: string): Promise<Row | null>;
  latestOpenForConversation(conversationId: string): Promise<Row | null>;
  insertWorkflow(row: Row): Promise<{ row: Row | null; conflict: boolean }>;
  transition(id: string, expectedVersion: number, from: string, to: string, boundary: Row, next: Row, fp: string): Promise<number | null>;
  insertStep(row: Row): Promise<{ row: Row; inserted: boolean }>;
  claimStep(id: string, owner: string, leaseSeconds: number): Promise<boolean>;
  finishStep(id: string, owner: string, status: 'done' | 'failed', result: Row | null, error: string | null): Promise<void>;
  insertEvent(row: Row): Promise<void>;
  lastEvent(workflowId: string): Promise<Row | null>;
}

export class VersionConflict extends Error { code = 'VERSION_CONFLICT'; }

/** User- and workflow-scoped idempotency key over the canonical input. */
export async function stepKey(userId: string, workflowId: string, kind: string, inputFingerprint: string) {
  return await sha256(`${userId}|${workflowId}|${kind}|${inputFingerprint}`);
}

/** Opens the single open workflow for (conversation, video); a concurrent insert loses and re-reads. */
export async function openWorkflow(store: WorkflowStore, row: Row): Promise<Row> {
  const existing = await store.getOpen(row.conversation_id, row.video_id);
  if (existing) return existing;
  const ins = await store.insertWorkflow(row);
  if (ins.row) return ins.row;
  const again = await store.getOpen(row.conversation_id, row.video_id);
  if (!again) throw new Error('workflow open failed');
  return again;
}

export async function transitionWorkflow(store: WorkflowStore, wf: Row, to: WorkflowState, boundary: Row, next: Row, fp: string): Promise<number> {
  assertTransition(wf.state as WorkflowState, to);
  const v = await store.transition(wf.id, wf.version, wf.state, to, boundary, next, fp);
  if (v == null) throw new VersionConflict('Workflow changed concurrently.');
  return v;
}

/** Idempotent step: same key → same row; only a successful claim may run fn, at most once. */
export async function runStepOnce<T extends Row>(store: WorkflowStore, p: { userId: string; workflowId: string; kind: string; inputFingerprint: string; owner: string }, fn: () => Promise<T>): Promise<{ ran: boolean; row: Row; result?: T }> {
  const key = await stepKey(p.userId, p.workflowId, p.kind, p.inputFingerprint);
  const { row } = await store.insertStep({ user_id: p.userId, workflow_id: p.workflowId, step_kind: p.kind, idempotency_key: key, input_fingerprint: p.inputFingerprint });
  if (row.status === 'done') return { ran: false, row };
  if (!(await store.claimStep(row.id, p.owner, 60))) return { ran: false, row };
  try {
    const result = await fn();
    await store.finishStep(row.id, p.owner, 'done', result, null);
    return { ran: true, row, result };
  } catch (e) {
    await store.finishStep(row.id, p.owner, 'failed', null, e instanceof Error ? e.message : String(e));
    throw e;
  }
}

// deno-lint-ignore no-explicit-any
export function supabaseStore(admin: any): WorkflowStore {
  return {
    async getMode(userId) {
      const { data } = await admin.from('agent_workflow_settings').select('engine_mode').eq('user_id', userId).maybeSingle();
      return (data?.engine_mode ?? 'off') as EngineMode;
    },
    async getOpen(c, v) {
      const { data } = await admin.from('agent_workflows').select('*').eq('conversation_id', c).eq('video_id', v).eq('status', 'open').maybeSingle();
      return data ?? null;
    },
    async latestOpenForConversation(c) {
      const { data } = await admin.from('agent_workflows').select('*').eq('conversation_id', c).eq('status', 'open').order('updated_at', { ascending: false }).limit(1).maybeSingle();
      return data ?? null;
    },
    async insertWorkflow(row) {
      const { data, error } = await admin.from('agent_workflows').insert(row).select('*').single();
      if (error) return { row: null, conflict: error.code === '23505' };
      return { row: data, conflict: false };
    },
    async transition(id, ev, from, to, boundary, next, fp) {
      const { data, error } = await admin.rpc('workflow_transition', { p_id: id, p_expected_version: ev, p_from: from, p_to: to, p_boundary: boundary, p_next: next, p_fp: fp });
      if (error) throw new Error(error.message);
      return typeof data === 'number' ? data : null;
    },
    async insertStep(row) {
      const { data, error } = await admin.from('agent_workflow_steps').insert(row).select('*').single();
      if (!error) return { row: data, inserted: true };
      const { data: ex } = await admin.from('agent_workflow_steps').select('*').eq('user_id', row.user_id).eq('workflow_id', row.workflow_id).eq('idempotency_key', row.idempotency_key).single();
      return { row: ex, inserted: false };
    },
    async claimStep(id, owner, lease) {
      const { data, error } = await admin.rpc('workflow_claim_step', { p_step: id, p_owner: owner, p_lease_seconds: lease });
      if (error) throw new Error(error.message);
      return data === true;
    },
    async finishStep(id, owner, status, result, err) {
      await admin.from('agent_workflow_steps').update({ status, result, error: err, lease_until: null, updated_at: new Date().toISOString() }).eq('id', id).eq('lease_owner', owner);
    },
    async insertEvent(row) {
      const { error } = await admin.from('agent_workflow_shadow_events').insert(row);
      if (error) throw new Error(error.message);
    },
    async lastEvent(wid) {
      const { data } = await admin.from('agent_workflow_shadow_events').select('*').eq('workflow_id', wid).order('created_at', { ascending: false }).limit(1).maybeSingle();
      return data ?? null;
    },
  };
}

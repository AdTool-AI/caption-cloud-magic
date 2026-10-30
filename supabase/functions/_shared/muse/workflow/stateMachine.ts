/**
 * Workflow engine v1 — fixed state machine for one campaign video.
 * Pure: no DB, no tools. The only source of transitions is ALLOWED below.
 */
import type { NextAction } from '../state/workspaceState.ts';

export type WorkflowState =
  | 'NEEDS_CLIPS' | 'NEEDS_CUT' | 'CUT_BLOCKED' | 'READY_FOR_ASSEMBLY' | 'AWAITING_APPROVAL'
  | 'ASSEMBLING' | 'EXPORT_RENDERING' | 'ASSEMBLY_FAILED' | 'QA_REVIEW' | 'CONTENT_CONFIRMATION' | 'DONE';

export const STATE_FOR_ACTION: Record<NextAction, WorkflowState> = {
  produce_missing_clips: 'NEEDS_CLIPS',
  prepare_cut: 'NEEDS_CUT',
  fix_cut: 'CUT_BLOCKED',
  approve_pending_approval: 'AWAITING_APPROVAL',
  wait_for_assembly: 'ASSEMBLING',
  wait_for_export: 'EXPORT_RENDERING',
  prepare_assembly: 'READY_FOR_ASSEMBLY',
  review_failed_assembly: 'ASSEMBLY_FAILED',
  review_final_qa: 'QA_REVIEW',
  confirm_content: 'CONTENT_CONFIRMATION',
  done: 'DONE',
};

const ALLOWED: Record<WorkflowState, WorkflowState[]> = {
  NEEDS_CLIPS: ['AWAITING_APPROVAL', 'NEEDS_CUT', 'CUT_BLOCKED'],
  NEEDS_CUT: ['CUT_BLOCKED', 'READY_FOR_ASSEMBLY', 'AWAITING_APPROVAL', 'NEEDS_CLIPS'],
  CUT_BLOCKED: ['NEEDS_CUT', 'READY_FOR_ASSEMBLY', 'AWAITING_APPROVAL', 'NEEDS_CLIPS'],
  READY_FOR_ASSEMBLY: ['AWAITING_APPROVAL', 'CUT_BLOCKED', 'NEEDS_CLIPS'],
  AWAITING_APPROVAL: ['ASSEMBLING', 'NEEDS_CLIPS', 'READY_FOR_ASSEMBLY', 'CUT_BLOCKED', 'NEEDS_CUT', 'QA_REVIEW', 'ASSEMBLY_FAILED'],
  ASSEMBLING: ['EXPORT_RENDERING', 'ASSEMBLY_FAILED', 'QA_REVIEW', 'CONTENT_CONFIRMATION', 'DONE'],
  EXPORT_RENDERING: ['ASSEMBLING', 'ASSEMBLY_FAILED', 'QA_REVIEW', 'READY_FOR_ASSEMBLY'],
  ASSEMBLY_FAILED: ['AWAITING_APPROVAL', 'READY_FOR_ASSEMBLY', 'CUT_BLOCKED', 'NEEDS_CLIPS'],
  QA_REVIEW: ['AWAITING_APPROVAL', 'READY_FOR_ASSEMBLY', 'CUT_BLOCKED', 'NEEDS_CLIPS', 'CONTENT_CONFIRMATION', 'DONE'],
  CONTENT_CONFIRMATION: ['DONE', 'QA_REVIEW', 'READY_FOR_ASSEMBLY', 'NEEDS_CLIPS', 'AWAITING_APPROVAL'],
  DONE: ['READY_FOR_ASSEMBLY', 'CUT_BLOCKED', 'NEEDS_CLIPS', 'AWAITING_APPROVAL'],
};

export class ForbiddenTransition extends Error {
  code = 'FORBIDDEN_TRANSITION';
  constructor(public from: WorkflowState, public to: WorkflowState) { super(`Forbidden transition ${from} → ${to}`); }
}

export function canTransition(from: WorkflowState, to: WorkflowState): boolean {
  return from === to || ALLOWED[from].includes(to);
}

export function assertTransition(from: WorkflowState, to: WorkflowState): void {
  if (!canTransition(from, to)) throw new ForbiddenTransition(from, to);
}

/** Boundary: where the engine must stop and wait for something outside it. */
export type Boundary =
  | { type: 'user_approval'; approval_ids: string[] }
  | { type: 'waiting_job'; job: 'assembly' | 'export' }
  | { type: 'user_confirmation' }
  | { type: 'none' };

export function boundaryFor(state: WorkflowState, approvalIds: string[]): Boundary {
  if (state === 'AWAITING_APPROVAL') return { type: 'user_approval', approval_ids: approvalIds };
  if (state === 'ASSEMBLING') return { type: 'waiting_job', job: 'assembly' };
  if (state === 'EXPORT_RENDERING') return { type: 'waiting_job', job: 'export' };
  if (state === 'CONTENT_CONFIRMATION') return { type: 'user_confirmation' };
  return { type: 'none' };
}

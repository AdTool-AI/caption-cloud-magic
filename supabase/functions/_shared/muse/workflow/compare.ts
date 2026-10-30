/**
 * Shadow comparison: what the engine expected vs. what Muse actually did. Pure.
 */
import type { NextAction } from '../state/workspaceState.ts';

export const STATE_READ_TOOLS = new Set([
  'get_video_workspace_state', 'get_spot_edit', 'get_spot_assembly', 'get_campaign',
  'get_campaign_production_status', 'get_video_status',
]);
export const AUX_READ_TOOLS = new Set(['list_voiceover_voices', 'get_user_context', 'get_available_video_models']);
const LEGACY_STATE_READS = new Set(['get_spot_edit', 'get_spot_assembly', 'get_campaign_production_status']);

/** Action tools the engine would accept as progressing the workflow from each next action. */
export const EXPECTED_ACTION_TOOLS: Record<NextAction, string[]> = {
  produce_missing_clips: ['estimate_campaign_budget', 'start_campaign_production', 'prepare_shot_retry', 'request_retry_approval'],
  prepare_cut: ['save_spot_edit', 'refresh_campaign_edit_clip_urls'],
  fix_cut: ['refresh_campaign_edit_clip_urls', 'save_spot_edit', 'select_shot_attempt'],
  approve_pending_approval: [], // boundary: the user clicks the card
  wait_for_assembly: [],
  wait_for_export: ['refresh_spot_export'],
  prepare_assembly: ['prepare_spot_assembly'],
  review_failed_assembly: ['prepare_spot_assembly'],
  review_final_qa: ['prepare_shot_retry', 'request_retry_approval', 'save_spot_edit', 'select_shot_attempt'],
  confirm_content: [],
  done: [],
};

export interface ObservedCall { name: string; video_id?: string | null; failed?: boolean }
export type TurnMode = 'read_only' | 'planning' | 'normal';

export interface Comparison {
  expected_tools: string[];
  match: boolean;
  mismatch_reason: string | null;
  tool_calls: number;
  read_calls: number;
}

export function compareTurn(mode: TurnMode, next: NextAction, observed: ObservedCall[]): Comparison {
  const reads = observed.filter((c) => STATE_READ_TOOLS.has(c.name));
  const actions = observed.filter((c) => !STATE_READ_TOOLS.has(c.name) && !AUX_READ_TOOLS.has(c.name));
  const expectedActions = mode === 'read_only' ? [] : EXPECTED_ACTION_TOOLS[next];
  const expected_tools = ['get_video_workspace_state', ...expectedActions];
  const base = { expected_tools, tool_calls: observed.length, read_calls: reads.length + observed.filter((c) => AUX_READ_TOOLS.has(c.name)).length };
  const miss = (r: string): Comparison => ({ ...base, match: false, mismatch_reason: r });

  if (reads.length === 0 && actions.length === 0) return miss('no_state_read');
  const stateReadsPerVideo = new Map<string, number>();
  for (const r of reads) stateReadsPerVideo.set(r.video_id ?? '-', (stateReadsPerVideo.get(r.video_id ?? '-') ?? 0) + 1);
  if (reads.some((r) => LEGACY_STATE_READS.has(r.name)) && !reads.some((r) => r.name === 'get_video_workspace_state')) return miss('legacy_read_chain');
  if ([...stateReadsPerVideo.values()].some((n) => n > 1)) return miss('extra_reads');
  if (actions.length) {
    if (next === 'approve_pending_approval' || next === 'confirm_content') return miss('boundary_ignored');
    if (actions.some((a) => !expectedActions.includes(a.name))) return miss('different_tool');
  } else if (mode !== 'read_only' && expectedActions.length && mode === 'normal') {
    return miss('no_action');
  }
  return { ...base, match: true, mismatch_reason: null };
}

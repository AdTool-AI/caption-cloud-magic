/**
 * Agent tools for spot assembly. Thin wrappers around spotRuntime — the same
 * operations the campaign workspace UI uses. There is deliberately NO approve
 * tool: provider steps only run after the user approves them in the UI.
 */
import type { MuseFunctionTool } from '../museClient.ts';
import type { ToolContext, ToolResult } from '../toolRuntime.ts';
import { getSpot, prepareAction, refreshExport, runAction, saveEdit, selectAttempt, SpotError, type SpotCtx } from './spotRuntime.ts';

const id = { type: 'string' };
export const SPOT_TOOL_DEFINITIONS: MuseFunctionTool[] = [
  { type: 'function', name: 'get_spot_edit', description: 'Read the cut of a campaign video: stage (planning_done/clips_done/cut_done/export_done/final_checked), clips with trims, audio/text layers, blocking issues, pending actions, export and checks. Free.', parameters: { type: 'object', properties: { video_id: id }, required: ['video_id'], additionalProperties: false } },
  { type: 'function', name: 'select_shot_attempt', description: 'Choose which EXISTING attempt of a shot goes into the cut. Never generates. Makes an earlier export stale.', parameters: { type: 'object', properties: { video_id: id, shot_id: id, attempt_id: id }, required: ['video_id', 'shot_id', 'attempt_id'], additionalProperties: false } },
  { type: 'function', name: 'save_spot_edit', description: 'Edit the cut using existing files only: reorder/trim clips (list every current shot_id), overlays, endcard, logo (stored campaign asset or user upload only), music volume/duck, sfx timing, subtitle text. Never generates.', parameters: { type: 'object', properties: { video_id: id, patch: { type: 'object' }, expected_revision: { type: 'integer' } }, required: ['video_id', 'patch'], additionalProperties: false } },
  { type: 'function', name: 'prepare_spot_action', description: 'Prepare a provider step (voiceover | music | sfx | subtitles | export) with its cost note. It stays pending until the USER approves it in the campaign workspace — tell the user to approve it there. Subtitles require a voiceover; export requires a complete cut.', parameters: { type: 'object', properties: { video_id: id, kind: { type: 'string', enum: ['voiceover', 'music', 'sfx', 'subtitles', 'export'] }, params: { type: 'object' } }, required: ['video_id', 'kind'], additionalProperties: false } },
  { type: 'function', name: 'run_spot_action', description: 'Run a step the user has already approved (fails otherwise). Runs once.', parameters: { type: 'object', properties: { action_id: id }, required: ['action_id'], additionalProperties: false } },
  { type: 'function', name: 'refresh_spot_export', description: 'Check the export job; when finished, stores the file and runs the technical check. The content check is done by the user.', parameters: { type: 'object', properties: { video_id: id }, required: ['video_id'], additionalProperties: false } },
];
export const SPOT_TOOL_NAMES = new Set(SPOT_TOOL_DEFINITIONS.map((t) => t.name));

// deno-lint-ignore no-explicit-any
export async function executeSpotTool(ctx: ToolContext, name: string, a: Record<string, any>): Promise<ToolResult | null> {
  if (!SPOT_TOOL_NAMES.has(name)) return null;
  const sctx: SpotCtx = { admin: ctx.admin, userId: ctx.userId, userJwt: ctx.userJwt, supabaseUrl: ctx.supabaseUrl, anonKey: ctx.anonKey, fetchImpl: (ctx as { fetchImpl?: typeof fetch }).fetchImpl };
  try {
    switch (name) {
      case 'get_spot_edit': return { output: await getSpot(sctx, a.video_id) };
      case 'select_shot_attempt': return { output: await selectAttempt(sctx, a.video_id, a.shot_id, a.attempt_id) };
      case 'save_spot_edit': return { output: await saveEdit(sctx, a.video_id, a.patch ?? {}, Number.isInteger(a.expected_revision) ? a.expected_revision : null) };
      case 'prepare_spot_action': return { output: await prepareAction(sctx, a.video_id, a.kind, a.params ?? {}, 'agent') };
      case 'run_spot_action': return { output: await runAction(sctx, a.action_id) };
      case 'refresh_spot_export': return { output: await refreshExport(sctx, a.video_id) };
    }
  } catch (e) {
    return { output: { error: e instanceof SpotError ? e.code : 'FAILED', message: (e as Error).message } };
  }
  return null;
}

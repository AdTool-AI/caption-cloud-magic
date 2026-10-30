/**
 * Agent tools for spot assembly. Thin wrappers around spotRuntime — the same
 * operations the campaign workspace UI uses. There is deliberately NO approve
 * tool: provider steps only run after the user approves them in the UI.
 */
import type { MuseFunctionTool } from '../museClient.ts';
import type { ToolContext, ToolResult } from '../toolRuntime.ts';
import { listVoiceoverVoices, VOICE_CATALOG_TOOL } from './voiceCatalog.ts';
import { SET_VOICE_TOOL, setCampaignVoiceoverVoice } from './voiceSelection.ts';
import { getVideoWorkspaceState } from '../state/workspaceState.ts';
import { StateNotFound } from '../state/loaders.ts';
import { getAssembly, prepareAssembly } from './assembly.ts';
import { getSpot, prepareAction, refreshClipUrls, refreshExport, runAction, saveEdit, selectAttempt, SpotError, type SpotCtx } from './spotRuntime.ts';

const id = { type: 'string' };
export const SPOT_TOOL_DEFINITIONS: MuseFunctionTool[] = [
  { type: 'function', name: 'get_video_workspace_state', description: 'PREFERRED single read of one campaign video: clips + attempts, current cut, voice, music, sfx, logo, latest export, shot QA, final QA, assembly, open approvals, retry plans, stale_flags, blocking_reasons and recommended_next_action. Use this instead of chaining get_campaign/get_spot_edit/get_spot_assembly/get_campaign_production_status. Free, never writes.', parameters: { type: 'object', properties: { video_id: id }, required: ['video_id'], additionalProperties: false } },
  { type: 'function', name: 'get_spot_edit', description: 'Read the cut of a campaign video: stage (planning_done/clips_done/cut_done/export_done/final_checked), clips with trims, audio/text layers, blocking issues, pending actions, export and checks. Free.', parameters: { type: 'object', properties: { video_id: id }, required: ['video_id'], additionalProperties: false } },
  { type: 'function', name: 'select_shot_attempt', description: 'Choose which EXISTING attempt of a shot goes into the cut. Never generates. Makes an earlier export stale.', parameters: { type: 'object', properties: { video_id: id, shot_id: id, attempt_id: id }, required: ['video_id', 'shot_id', 'attempt_id'], additionalProperties: false } },
  { type: 'function', name: 'save_spot_edit', description: 'Edit the cut using existing files only: reorder/trim clips (list every current shot_id), overlays, endcard, logo (stored campaign asset or user upload only), music volume/duck, sfx timing, subtitle text. Never generates.', parameters: { type: 'object', properties: { video_id: id, patch: { type: 'object' }, expected_revision: { type: 'integer' } }, required: ['video_id', 'patch'], additionalProperties: false } },
  { type: 'function', name: 'prepare_spot_action', description: 'Prepare a provider step (voiceover | music | sfx | subtitles | export) with its cost note. It stays pending until the USER approves it in the campaign workspace — tell the user to approve it there. Subtitles require a voiceover; export requires a complete cut.', parameters: { type: 'object', properties: { video_id: id, kind: { type: 'string', enum: ['voiceover', 'music', 'sfx', 'subtitles', 'export'] }, params: { type: 'object' } }, required: ['video_id', 'kind'], additionalProperties: false } },
  { type: 'function', name: 'run_spot_action', description: 'Run a step the user has already approved (fails otherwise). Runs once.', parameters: { type: 'object', properties: { action_id: id }, required: ['action_id'], additionalProperties: false } },
  { type: 'function', name: 'refresh_campaign_edit_clip_urls', description: 'Repair the cut: fill missing/stale clip links from the stored attempts. Keeps order and trims. Fails if any selected attempt has no finished clip. Free, never generates.', parameters: { type: 'object', properties: { video_id: id }, required: ['video_id'], additionalProperties: false } },
  { type: 'function', name: 'refresh_spot_export', description: 'Check the export job; when finished, stores the file and runs the technical check. The content check is done by the user.', parameters: { type: 'object', properties: { video_id: id }, required: ['video_id'], additionalProperties: false } },
  { type: 'function', name: 'prepare_spot_assembly', description: 'Prepare the complete Phase C assembly of one campaign video as ONE exact, immutable scope: German voiceover → subtitles from that voiceover → one music track → one SFX → overlays → text-only or approved-logo endcard → one export → technical validation → frame/text check → full-ad AI QA. Returns the maximum user cost. Never generates or retries video shots. The USER approves and starts it by clicking the approval card (chat or campaign workspace) — never via a text reply; it then runs in the background without further chat turns. Use branding_mode "text_only" when no confirmed logo exists.', parameters: { type: 'object', properties: { video_id: id, params: { type: 'object', properties: { branding_mode: { type: 'string', enum: ['text_only', 'approved_logo'] }, voiceover: { type: 'object', properties: { text: { type: 'string' }, voice_id: { type: 'string' }, language: { type: 'string' }, start: { type: 'number' } }, required: ['text'] }, music: { type: 'object', properties: { prompt: { type: 'string' }, tier: { type: 'string', enum: ['minimax-15', 'lyria-3-pro', 'stable-audio-25'] }, volume: { type: 'number' }, duck: { type: 'number' } }, required: ['prompt'] }, sfx: { type: 'object', properties: { prompt: { type: 'string' }, start: { type: 'number' }, duration: { type: 'number' }, volume: { type: 'number' } }, required: ['prompt'] } }, required: ['branding_mode', 'voiceover', 'music', 'sfx'] } }, required: ['video_id', 'params'], additionalProperties: false } },
  { type: 'function', name: 'get_spot_assembly', description: 'Read the latest assembly job of a campaign video: status, step progress, max cost, error. Free.', parameters: { type: 'object', properties: { video_id: id }, required: ['video_id'], additionalProperties: false } },
  VOICE_CATALOG_TOOL,
  SET_VOICE_TOOL,
];
export const SPOT_TOOL_NAMES = new Set(SPOT_TOOL_DEFINITIONS.map((t) => t.name));

// deno-lint-ignore no-explicit-any
export async function executeSpotTool(ctx: ToolContext, name: string, a: Record<string, any>): Promise<ToolResult | null> {
  if (!SPOT_TOOL_NAMES.has(name)) return null;
  const sctx: SpotCtx = { admin: ctx.admin, userId: ctx.userId, userJwt: ctx.userJwt, supabaseUrl: ctx.supabaseUrl, anonKey: ctx.anonKey, fetchImpl: (ctx as { fetchImpl?: typeof fetch }).fetchImpl };
  try {
    switch (name) {
      case 'list_voiceover_voices': return { output: await listVoiceoverVoices(sctx as never, a) };
      case 'set_campaign_voiceover_voice': return { output: await setCampaignVoiceoverVoice(sctx as never, a) };
      case 'get_video_workspace_state': return { output: await getVideoWorkspaceState(ctx, a.video_id) };
      case 'get_spot_edit': return { output: await getSpot(sctx, a.video_id) };
      case 'select_shot_attempt': return { output: await selectAttempt(sctx, a.video_id, a.shot_id, a.attempt_id) };
      case 'save_spot_edit': return { output: await saveEdit(sctx, a.video_id, a.patch ?? {}, Number.isInteger(a.expected_revision) ? a.expected_revision : null) };
      case 'prepare_spot_action': return { output: await prepareAction(sctx, a.video_id, a.kind, a.params ?? {}, 'agent') };
      case 'run_spot_action': return { output: await runAction(sctx, a.action_id) };
      case 'refresh_campaign_edit_clip_urls': return { output: await refreshClipUrls(sctx, a.video_id) };
      case 'prepare_spot_assembly': return { output: await prepareAssembly(sctx, a.video_id, a.params ?? {}, 'agent') };
      case 'get_spot_assembly': return { output: { assembly: await getAssembly(sctx, a.video_id) } };
      case 'refresh_spot_export': return { output: await refreshExport(sctx, a.video_id) };
    }
  } catch (e) {
    return { output: { error: e instanceof SpotError || e instanceof StateNotFound ? (e as { code: string }).code : 'FAILED', message: (e as Error).message } };
  }
  return null;
}

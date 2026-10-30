/**
 * get_video_workspace_state — one compact, canonical read of a campaign video.
 * Built only from the shared loaders (never by calling other agent tools) and
 * never writes (a missing cut is reported, not created).
 * recommended_next_action is derived deterministically from data.
 */
import { deriveStage, pickAttempt, requirementsFrom, totalCut, validateEdit, type SpotEdit } from '../campaign/spot.ts';
import { customerReady, technicalAcceptance } from '../campaign/spotQa.ts';
import { loadVideoBundle, type LoaderCtx, type Row, type VideoBundle } from './loaders.ts';

export type NextAction =
  | 'produce_missing_clips' | 'prepare_cut' | 'fix_cut' | 'approve_pending_approval' | 'wait_for_assembly'
  | 'prepare_assembly' | 'review_failed_assembly' | 'wait_for_export' | 'review_final_qa' | 'confirm_content' | 'done';

const OPEN_APPROVAL = new Set(['pending', 'awaiting_approval', 'quoted']);

export function buildWorkspaceState(b: VideoBundle, now = Date.now()) {
  const { video, shots, attempts, actions, assembly, approvals, genById } = b;
  const edit: SpotEdit | null = video.edit ?? null;
  const st = deriveStage(video, shots, attempts);
  const editRev: number | null = video.edit_revision ?? null;
  const exportRev: number | null = video.export_revision ?? null;
  const qaRev: number | null = video.final_ai_qa?.revision ?? null;

  const stale: string[] = [];
  if (video.export_status === 'done' && exportRev !== editRev) stale.push('EXPORT_OLDER_THAN_CUT');
  if (qaRev != null && qaRev !== exportRev) stale.push('FINAL_QA_FOR_OLD_EXPORT');
  if (video.technical_check?.revision != null && video.technical_check.revision !== exportRev) stale.push('TECHNICAL_CHECK_FOR_OLD_EXPORT');
  if (video.frame_check?.revision != null && video.frame_check.revision !== exportRev) stale.push('FRAME_CHECK_FOR_OLD_EXPORT');
  if (assembly && assembly.edit_revision != null && assembly.edit_revision !== editRev && ['pending', 'running'].includes(assembly.status)) stale.push('ASSEMBLY_FOR_OLD_CUT');

  const issues = edit ? validateEdit(edit, requirementsFrom(video.post_production, edit)) : [];
  const blocking: string[] = [];
  if (!edit) blocking.push('NO_CUT');
  for (const i of issues) if (i.blocking) blocking.push(i.code);

  const openApprovals = approvals.filter((a: Row) => OPEN_APPROVAL.has(a.status) && (!a.start_expires_at || Date.parse(a.start_expires_at) > now))
    .map((a: Row) => ({ id: a.id, kind: a.kind ?? 'production', status: a.status, max_total: a.max_total, shot_id: a.retry_binding?.shot_id ?? null, attempt_no: a.retry_binding?.attempt_no ?? null, expires_at: a.start_expires_at }));
  if (assembly?.status === 'pending') openApprovals.unshift({ id: assembly.id, kind: 'assembly', status: 'pending', max_total: assembly.max_cost?.wallet_usd ?? assembly.max_cost?.max_wallet ?? null, shot_id: null, attempt_no: null, expires_at: null });

  const clips = shots.map((s: Row) => {
    const a = pickAttempt(s, attempts);
    const g = a?.generation_id ? genById.get(a.generation_id) : null;
    return {
      shot_id: s.id, index: s.shot_index, status: s.status, model: a?.model ?? s.selected_model ?? null,
      attempt_id: a?.id ?? null, attempt_no: a?.attempt_no ?? null, attempts: attempts.filter((x: Row) => x.shot_id === s.id).length,
      has_clip: !!g?.video_url, qa_verdict: a?.qa_verdict ?? null, visual_client_ready: s.visual_client_ready === true,
    };
  });
  const retryPlans = shots.filter((s: Row) => s.retry_plan).map((s: Row) => ({ shot_id: s.id, index: s.shot_index, plan: s.retry_plan }));
  const pp = video.post_production ?? {};
  const tech = technicalAcceptance(video);
  const ready = customerReady(video, shots);

  let next: NextAction;
  if (st.missing.includes('clips')) next = 'produce_missing_clips';
  else if (assembly?.status === 'running') next = 'wait_for_assembly';
  else if (openApprovals.length) next = 'approve_pending_approval';
  else if (!edit) next = 'prepare_cut';
  else if (blocking.length && !assembly) next = 'fix_cut';
  else if (video.export_status === 'rendering') next = 'wait_for_export';
  else if (assembly?.status === 'failed') next = 'review_failed_assembly';
  else if (video.export_status !== 'done' || stale.includes('EXPORT_OLDER_THAN_CUT')) next = 'prepare_assembly';
  else if (!(video.final_ai_qa?.revision === exportRev && video.final_ai_qa?.verdict === 'pass')) next = 'review_final_qa';
  else if (!ready.ready) next = 'confirm_content';
  else next = 'done';

  const version = [editRev, exportRev, qaRev, assembly?.id ?? '-', assembly?.status ?? '-', openApprovals.map((a) => a.id).join(','), video.updated_at ?? ''].join('|');
  return {
    video: { id: video.id, campaign_id: video.campaign_id, title: video.title, status: video.status, stage: st.stage },
    state_version: version, edit_revision: editRev, export_revision: exportRev, qa_revision: qaRev,
    clips,
    current_edit: edit ? { revision: editRev, cut_seconds: totalCut(edit), aspect: edit.aspect ?? null, branding_mode: edit.branding_mode ?? 'approved_logo', clip_count: edit.clips?.length ?? 0, missing_clip_urls: (edit.clips ?? []).filter((c) => !c.url).length } : null,
    voice: pp.voiceover_voice_id ? { voice_id: pp.voiceover_voice_id, name: pp.voiceover_voice_name ?? null, language: pp.voiceover_language ?? null, confirmed: pp.voiceover_voice_user_confirmed === true } : null,
    music: pp.music_direction ?? null, sfx: pp.sfx_direction ?? null,
    logo: edit?.logo ? { url: edit.logo.url ?? null } : null,
    latest_export: { status: video.export_status ?? null, revision: exportRev, url: video.export_url ?? null },
    shot_qa: { visually_ready: clips.filter((c) => c.visual_client_ready).length, total: clips.length },
    final_qa: video.final_ai_qa ? { revision: qaRev, verdict: video.final_ai_qa.verdict ?? null, score: video.final_ai_qa.score ?? null, recommendation: video.final_ai_qa.recommendation ?? null } : null,
    technical_acceptance: tech,
    assembly: assembly ? { id: assembly.id, status: assembly.status, edit_revision: assembly.edit_revision, error: assembly.error ?? null, failed_step: (assembly.steps ?? []).find((s: Row) => s.status === 'failed')?.kind ?? null } : null,
    open_approvals: openApprovals,
    pending_actions: actions.filter((a: Row) => ['pending', 'approved', 'running'].includes(a.status)).map((a: Row) => ({ id: a.id, kind: a.kind, status: a.status })),
    retry_plans: retryPlans,
    final_client_ready: video.final_client_ready === true,
    stale_flags: stale,
    blocking_reasons: [...new Set([...blocking, ...ready.reasons])],
    recommended_next_action: next,
  };
}

export async function getVideoWorkspaceState(ctx: LoaderCtx, videoId: string) {
  return buildWorkspaceState(await loadVideoBundle(ctx, videoId));
}

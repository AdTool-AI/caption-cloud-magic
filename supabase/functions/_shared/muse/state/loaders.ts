/**
 * Canonical DB loaders for one campaign video. Every read tool
 * (get_spot_edit, get_spot_assembly, get_video_workspace_state) goes through
 * these, so they can never disagree about the same video. Read-only: no writes.
 */
// deno-lint-ignore no-explicit-any
export type Row = Record<string, any>;
// deno-lint-ignore no-explicit-any
export interface LoaderCtx { admin: any; userId: string }

export class StateNotFound extends Error { code = 'NOT_FOUND'; }

/** Video + shots + attempts + campaign + assets + post actions + generations (owner-scoped). */
export async function loadVideoCore(ctx: LoaderCtx, videoId: string) {
  const { data: video } = await ctx.admin.from('campaign_videos').select('*').eq('id', videoId).eq('user_id', ctx.userId).maybeSingle();
  if (!video) throw new StateNotFound('Campaign video not found.');
  const [{ data: shots }, { data: attempts }, { data: campaign }, { data: assets }, { data: actions }] = await Promise.all([
    ctx.admin.from('campaign_shots').select('*').eq('video_id', videoId).is('archived_at', null).order('shot_index'),
    ctx.admin.from('campaign_shot_attempts').select('id, shot_id, user_id, attempt_no, generation_id, model, cost_charged, qa_verdict, client_ready, created_at').eq('campaign_id', video.campaign_id),
    ctx.admin.from('agent_campaigns').select('id, video_duration_s, language, company_name').eq('id', video.campaign_id).maybeSingle(),
    ctx.admin.from('campaign_assets').select('id, url, kind, reuse_status, owner_note, source_url, discovery_source, file_type, width, height, official_confidence').eq('campaign_id', video.campaign_id),
    ctx.admin.from('campaign_post_actions').select('*').eq('video_id', videoId).order('created_at', { ascending: false }).limit(30),
  ]);
  const genIds = (attempts ?? []).map((a: Row) => a.generation_id).filter(Boolean);
  const { data: gens } = genIds.length
    ? await ctx.admin.from('ai_video_generations').select('id, user_id, video_url, duration_seconds, measured_duration_seconds, status').in('id', genIds)
    : { data: [] };
  const genById = new Map<string, Row>((gens ?? []).map((g: Row) => [g.id, { ...g, duration_seconds: g.measured_duration_seconds ?? g.duration_seconds }]));
  return { video, shots: (shots ?? []) as Row[], attempts: (attempts ?? []) as Row[], campaign, assets: (assets ?? []) as Row[], actions: (actions ?? []) as Row[], genById };
}

/** Newest assembly job of a video (owner-scoped). */
export async function loadLatestAssembly(ctx: LoaderCtx, videoId: string): Promise<Row | null> {
  const { data } = await ctx.admin.from('campaign_assembly_jobs').select('id, status, steps, max_cost, scope, error, created_at, approved_at, finished_at, edit_revision')
    .eq('video_id', videoId).eq('user_id', ctx.userId).order('created_at', { ascending: false }).limit(1).maybeSingle();
  return data ?? null;
}

/** Recent budget/retry approvals of the video's campaign. */
export async function loadApprovals(ctx: LoaderCtx, campaignId: string): Promise<Row[]> {
  const { data } = await ctx.admin.from('campaign_budget_approvals').select('id, kind, status, estimated_total, max_total, spent_total, start_expires_at, execution_expires_at, retry_binding, created_at')
    .eq('campaign_id', campaignId).order('created_at', { ascending: false }).limit(10);
  return (data ?? []) as Row[];
}

/** Everything the workspace state needs, in one place. */
export async function loadVideoBundle(ctx: LoaderCtx, videoId: string) {
  const core = await loadVideoCore(ctx, videoId);
  const [assembly, approvals] = await Promise.all([loadLatestAssembly(ctx, videoId), loadApprovals(ctx, core.video.campaign_id)]);
  return { ...core, assembly, approvals };
}
export type VideoBundle = Awaited<ReturnType<typeof loadVideoBundle>>;

/**
 * Spot assembly runtime — shared by the agent tools and the `campaign-spot`
 * Edge Function so manual UI and agent use the very same operations.
 * Paid/provider steps go through campaign_post_actions: prepare → (user) approve → run.
 * Approval is never exposed as an agent tool.
 */
import {
  buildClips, buildRenderPayload, costDoc, defaultEdit, deriveStage, requirementsFrom,
  scanMp4Tracks, technicalCheck, totalCut, validateEdit, DEFAULT_DUCK, type SpotEdit,
} from './spot.ts';

// deno-lint-ignore no-explicit-any
type Row = Record<string, any>;
export interface SpotCtx {
  // deno-lint-ignore no-explicit-any
  admin: any;
  userId: string;
  userJwt: string;
  supabaseUrl: string;
  anonKey: string;
  fetchImpl?: typeof fetch;
}
export type ActionKind = 'voiceover' | 'music' | 'sfx' | 'subtitles' | 'export';
export class SpotError extends Error { constructor(public code: string, msg: string) { super(msg); } }

async function loadAll(ctx: SpotCtx, videoId: string) {
  const { data: video } = await ctx.admin.from('campaign_videos').select('*').eq('id', videoId).eq('user_id', ctx.userId).maybeSingle();
  if (!video) throw new SpotError('NOT_FOUND', 'Campaign video not found.');
  const [{ data: shots }, { data: attempts }, { data: campaign }, { data: assets }, { data: actions }] = await Promise.all([
    ctx.admin.from('campaign_shots').select('*').eq('video_id', videoId).is('archived_at', null).order('shot_index'),
    ctx.admin.from('campaign_shot_attempts').select('id, shot_id, attempt_no, generation_id, model, cost_charged, qa_verdict, client_ready, created_at').eq('campaign_id', video.campaign_id),
    ctx.admin.from('agent_campaigns').select('id, video_duration_s, language, company_name').eq('id', video.campaign_id).maybeSingle(),
    ctx.admin.from('campaign_assets').select('id, url, kind, reuse_status, owner_note').eq('campaign_id', video.campaign_id),
    ctx.admin.from('campaign_post_actions').select('*').eq('video_id', videoId).order('created_at', { ascending: false }).limit(30),
  ]);
  const genIds = (attempts ?? []).map((a: Row) => a.generation_id).filter(Boolean);
  const { data: gens } = genIds.length
    ? await ctx.admin.from('ai_video_generations').select('id, video_url, duration_seconds, measured_duration_seconds, status').in('id', genIds)
    : { data: [] };
  const genById = new Map<string, Row>((gens ?? []).map((g: Row) => [g.id, { ...g, duration_seconds: g.measured_duration_seconds ?? g.duration_seconds }]));
  return { video, shots: shots ?? [], attempts: attempts ?? [], campaign, assets: assets ?? [], actions: actions ?? [], genById };
}

async function persist(ctx: SpotCtx, videoId: string, edit: SpotEdit, expected: number | null): Promise<number> {
  const { data, error } = await ctx.admin.rpc('save_campaign_edit', { p_video: videoId, p_user: ctx.userId, p_edit: edit, p_expected: expected });
  if (error) throw new SpotError(/CONFLICT/.test(error.message) ? 'EDIT_REVISION_CONFLICT' : 'SAVE_FAILED', error.message);
  return data as number;
}

function view(all: Awaited<ReturnType<typeof loadAll>>) {
  const { video, shots, attempts, actions, assets } = all;
  const edit: SpotEdit | null = video.edit;
  const st = deriveStage(video, shots, attempts);
  return {
    video_id: video.id, title: video.title, revision: video.edit_revision, edit,
    stage: st.stage, export_stale: st.export_stale, missing: st.missing,
    cut_seconds: edit ? totalCut(edit) : null,
    issues: edit ? validateEdit(edit, requirementsFrom(video.post_production)) : [],
    requirements: requirementsFrom(video.post_production),
    export: { status: video.export_status, url: video.export_url, revision: video.export_revision, meta: video.export_meta },
    technical_check: video.technical_check, content_check: video.content_check,
    final_client_ready: video.final_client_ready === true,
    actions: actions.map((a: Row) => ({ id: a.id, kind: a.kind, status: a.status, cost: a.cost_doc, revision: a.edit_revision, requested_by: a.requested_by, error: a.error, created_at: a.created_at })),
    logo_candidates: assets.filter((a: Row) => /logo/i.test(`${a.kind} ${a.url}`)).map((a: Row) => ({ id: a.id, url: a.url, reuse_status: a.reuse_status })),
    shots: shots.map((s: Row) => ({
      id: s.id, index: s.shot_index, selected_attempt_id: s.selected_attempt_id,
      attempts: attempts.filter((a: Row) => a.shot_id === s.id).map((a: Row) => ({ id: a.id, attempt_no: a.attempt_no, model: a.model, qa_verdict: a.qa_verdict, has_clip: !!a.generation_id })),
    })),
  };
}

/** Load the spot; creates the edit exactly once (it is a column on the video, so reopening never duplicates). */
export async function getSpot(ctx: SpotCtx, videoId: string) {
  let all = await loadAll(ctx, videoId);
  if (!all.video.edit) {
    const clips = buildClips(all.shots, all.attempts, all.genById);
    const target = Number(all.campaign?.video_duration_s ?? 30);
    try { await persist(ctx, videoId, defaultEdit(all.video, clips, target), all.video.edit_revision); } catch (e) {
      if (!(e instanceof SpotError && e.code === 'EDIT_REVISION_CONFLICT')) throw e; // parallel open → the other one won
    }
    all = await loadAll(ctx, videoId);
  }
  return view(all);
}

export async function selectAttempt(ctx: SpotCtx, videoId: string, shotId: string, attemptId: string) {
  const all = await loadAll(ctx, videoId);
  const att = all.attempts.find((a: Row) => a.id === attemptId && a.shot_id === shotId);
  if (!att || !all.shots.some((s: Row) => s.id === shotId)) throw new SpotError('BAD_ATTEMPT', 'Attempt does not belong to this shot.');
  if (!att.generation_id || !all.genById.get(att.generation_id)?.video_url) throw new SpotError('NO_CLIP', 'This attempt has no finished clip.');
  await ctx.admin.from('campaign_shots').update({ selected_attempt_id: attemptId }).eq('id', shotId).eq('user_id', ctx.userId);
  const shots = all.shots.map((s: Row) => (s.id === shotId ? { ...s, selected_attempt_id: attemptId } : s));
  const base: SpotEdit = all.video.edit ?? defaultEdit(all.video, [], Number(all.campaign?.video_duration_s ?? 30));
  const clips = buildClips(shots, all.attempts, all.genById, base.clips);
  await persist(ctx, videoId, { ...base, clips }, all.video.edit_revision);
  return getSpot(ctx, videoId);
}

const isOwnStorage = (ctx: SpotCtx, url: string) => url.startsWith(`${ctx.supabaseUrl}/storage/v1/object/`) && url.includes(`/${ctx.userId}/`);

/**
 * Manual/agent edit. Clip URLs are always re-derived from stored attempts (never trusted
 * from input) and no edit ever triggers a generation.
 */
export async function saveEdit(ctx: SpotCtx, videoId: string, patch: Row, expected: number | null) {
  const all = await loadAll(ctx, videoId);
  const cur: SpotEdit = all.video.edit ?? defaultEdit(all.video, [], Number(all.campaign?.video_duration_s ?? 30));
  const next: SpotEdit = { ...cur };
  if (Array.isArray(patch.clips)) {
    const byId = new Map(cur.clips.map((c) => [c.shot_id, c]));
    if (patch.clips.length !== cur.clips.length || patch.clips.some((c: Row) => !byId.has(c.shot_id))) throw new SpotError('BAD_CLIPS', 'Clips must list exactly the current shots (reorder/trim only).');
    next.clips = patch.clips.map((c: Row) => {
      const o = byId.get(c.shot_id)!;
      return { ...o, trim_in: Number(c.trim_in ?? o.trim_in), trim_out: Number(c.trim_out ?? o.trim_out) };
    });
  }
  if ('voiceover' in patch) {
    const v = patch.voiceover;
    if (v && v.source === 'upload' && !isOwnStorage(ctx, String(v.url))) throw new SpotError('BAD_UPLOAD', 'Uploaded voiceover must be in your own storage.');
    next.voiceover = v ? { url: String(v.url), start: Number(v.start ?? 0), duration: Number(v.duration), volume: Number(v.volume ?? 1), source: v.source === 'upload' ? 'upload' : (cur.voiceover?.source ?? 'generated'), script: v.script ?? cur.voiceover?.script, language: v.language ?? cur.voiceover?.language } : null;
    if (v && cur.voiceover && v.source === 'upload' && v.url !== cur.voiceover.url) next.subtitles = null; // subtitles must come from the actual voiceover
  }
  if ('music' in patch) next.music = patch.music ? { ...cur.music!, ...patch.music, duck: Number(patch.music.duck ?? cur.music?.duck ?? DEFAULT_DUCK) } : null;
  if (Array.isArray(patch.sfx)) next.sfx = patch.sfx.map((s: Row) => ({ url: String(s.url), start: Number(s.start), duration: Number(s.duration), volume: Number(s.volume ?? 1), label: s.label }));
  if (patch.subtitles && cur.subtitles && Array.isArray(patch.subtitles.segments)) {
    next.subtitles = { ...cur.subtitles, segments: patch.subtitles.segments.map((s: Row) => ({ start: Number(s.start), end: Number(s.end), text: String(s.text) })) };
  }
  if (Array.isArray(patch.overlays)) next.overlays = patch.overlays.map((o: Row, i: number) => ({ id: String(o.id ?? `ov-${i}`), text: String(o.text), start: Number(o.start), end: Number(o.end), role: ['product_name', 'cta'].includes(o.role) ? o.role : 'text' }));
  if ('logo' in patch) {
    const l = patch.logo;
    if (l) {
      const fromAsset = all.assets.some((a: Row) => a.url === l.url);
      if (!fromAsset && !isOwnStorage(ctx, String(l.url))) throw new SpotError('BAD_LOGO', 'Logo must be a stored campaign asset or your own upload — no substitute logos.');
      next.logo = { url: String(l.url), source: fromAsset ? 'campaign_asset' : 'upload', rights_confirmed: l.rights_confirmed === true };
    } else next.logo = null;
  }
  if ('endcard' in patch) next.endcard = patch.endcard ? { headline: String(patch.endcard.headline ?? ''), cta: String(patch.endcard.cta ?? ''), duration: Number(patch.endcard.duration ?? 3) } : null;
  await persist(ctx, videoId, next, expected ?? all.video.edit_revision);
  return getSpot(ctx, videoId);
}

export async function prepareAction(ctx: SpotCtx, videoId: string, kind: ActionKind, params: Row, by: 'user' | 'agent') {
  const spot = await getSpot(ctx, videoId);
  const all = await loadAll(ctx, videoId);
  if (kind === 'subtitles' && !spot.edit?.voiceover) throw new SpotError('NO_VOICEOVER', 'Subtitles are made from the actual voiceover — add one first.');
  if (kind === 'export') {
    const blocking = spot.issues.filter((i) => i.blocking);
    if (blocking.length) throw new SpotError('NOT_EXPORTABLE', blocking.map((i) => i.detail).join(' '));
  }
  if (kind === 'voiceover' && !String(params.text ?? '').trim()) throw new SpotError('NO_TEXT', 'Voiceover text required.');
  if ((kind === 'music' || kind === 'sfx') && !String(params.prompt ?? '').trim()) throw new SpotError('NO_PROMPT', 'Prompt required.');
  await ctx.admin.from('campaign_post_actions').update({ status: 'superseded', updated_at: new Date().toISOString() })
    .eq('video_id', videoId).eq('kind', kind).eq('status', 'pending');
  const { data, error } = await ctx.admin.from('campaign_post_actions').insert({
    user_id: ctx.userId, campaign_id: all.video.campaign_id, video_id: videoId, kind,
    params: { ...params, language: params.language ?? all.campaign?.language ?? 'de' },
    cost_doc: costDoc(kind, params), edit_revision: all.video.edit_revision, requested_by: by,
  }).select('*').single();
  if (error) throw new SpotError(/duplicate/.test(error.message) ? 'ACTION_OPEN' : 'PREPARE_FAILED', error.message);
  return { action_id: data.id, kind, cost: data.cost_doc, status: 'pending', note: 'Needs the user to approve it in the campaign workspace before it can run.' };
}

/** Only the user (UI → campaign-spot) calls this. There is no agent tool for it. */
export async function approveAction(ctx: SpotCtx, actionId: string) {
  const { data } = await ctx.admin.from('campaign_post_actions').update({ status: 'approved', approved_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', actionId).eq('user_id', ctx.userId).eq('status', 'pending').select('id').maybeSingle();
  if (!data) throw new SpotError('NOT_PENDING', 'Action is not pending.');
  return { action_id: actionId, status: 'approved' };
}

async function callFn(ctx: SpotCtx, name: string, body: Row) {
  const res = await (ctx.fetchImpl ?? fetch)(`${ctx.supabaseUrl}/functions/v1/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ctx.userJwt}`, apikey: ctx.anonKey },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json?.error) throw new SpotError('PROVIDER_FAILED', `${name}: ${json?.error ?? res.status}`);
  return json as Row;
}

/** Runs an approved action once (atomic claim). Results are written into the same edit the user edits. */
export async function runAction(ctx: SpotCtx, actionId: string) {
  const { data: action, error } = await ctx.admin.rpc('claim_post_action', { p_id: actionId, p_user: ctx.userId });
  if (error || !action?.id) throw new SpotError('NOT_APPROVED', 'Action is not approved or already ran.');
  const finish = (patch: Row) => ctx.admin.from('campaign_post_actions').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', actionId);
  try {
    const all = await loadAll(ctx, action.video_id);
    const edit: SpotEdit = all.video.edit;
    const p = action.params ?? {};
    let result: Row;
    if (action.kind === 'export') {
      if (all.video.edit_revision !== action.edit_revision) throw new SpotError('STALE_ACTION', 'The cut changed after approval — prepare the export again.');
      const payload = buildRenderPayload(edit, all.video.edit_revision);
      const r = await callFn(ctx, 'render-directors-cut', payload);
      await ctx.admin.from('campaign_videos').update({ export_render_id: r.render_id, export_status: 'rendering', export_revision: all.video.edit_revision, export_url: null, technical_check: null, content_check: null, final_client_ready: false }).eq('id', all.video.id);
      result = { render_id: r.render_id };
    } else {
      const next: SpotEdit = { ...edit };
      if (action.kind === 'voiceover') {
        const r = await callFn(ctx, 'generate-voiceover', { text: p.text, voiceId: p.voice_id, language: p.language ?? 'de', projectId: all.video.id });
        next.voiceover = { url: r.audioUrl, start: Number(p.start ?? 0), duration: Number(r.duration), volume: 1, source: 'generated', script: p.text, language: p.language ?? 'de' };
        next.subtitles = null;
        result = { url: r.audioUrl, duration: r.duration };
      } else if (action.kind === 'music') {
        const r = await callFn(ctx, 'generate-music-track', { prompt: p.prompt, tier: p.tier, durationSeconds: Math.ceil(totalCut(edit)), instrumental: true });
        next.music = { url: r.url ?? r.track?.url, start: 0, duration: totalCut(edit), volume: Number(p.volume ?? 0.6), duck: Number(p.duck ?? DEFAULT_DUCK) };
        result = { url: next.music.url };
      } else if (action.kind === 'sfx') {
        const r = await callFn(ctx, 'generate-scene-sfx', { prompt: p.prompt, duration: Number(p.duration ?? 2), kind: 'sfx' });
        next.sfx = [...edit.sfx, { url: r.url, start: Number(p.start ?? 0), duration: Number(p.duration ?? 2), volume: Number(p.volume ?? 0.8), label: p.prompt }];
        result = { url: r.url };
      } else {
        if (!edit.voiceover) throw new SpotError('NO_VOICEOVER', 'No voiceover.');
        const r = await callFn(ctx, 'generate-subtitles', { audioUrl: edit.voiceover.url, language: p.language ?? 'de' });
        const off = edit.voiceover.start;
        next.subtitles = { from_voiceover_url: edit.voiceover.url, segments: (r.subtitles ?? []).map((s: Row) => ({ start: Math.round((s.startTime + off) * 1000) / 1000, end: Math.round((s.endTime + off) * 1000) / 1000, text: s.text })) };
        result = { segments: next.subtitles.segments.length };
      }
      await persist(ctx, all.video.id, next, all.video.edit_revision);
    }
    await finish({ status: 'done', result });
    return { action_id: actionId, status: 'done', result };
  } catch (e) {
    await finish({ status: 'failed', error: (e as Error).message });
    throw e;
  }
}

/** Poll the existing render job; on completion store the file and run the technical check. */
export async function refreshExport(ctx: SpotCtx, videoId: string) {
  const { data: v } = await ctx.admin.from('campaign_videos').select('*').eq('id', videoId).eq('user_id', ctx.userId).maybeSingle();
  if (!v?.export_render_id) return getSpot(ctx, videoId);
  const { data: r } = await ctx.admin.from('director_cut_renders').select('status, output_url, output_width, output_height, output_duration_seconds, file_size_bytes, error_message').eq('id', v.export_render_id).maybeSingle();
  if (r?.status === 'failed') {
    await ctx.admin.from('campaign_videos').update({ export_status: 'failed', export_meta: { error: r.error_message } }).eq('id', videoId);
  } else if (r?.status === 'completed' && r.output_url && v.export_status !== 'done') {
    let tracks = null, ctype: string | null = null, bytes: number | null = r.file_size_bytes ?? null;
    try {
      const res = await (ctx.fetchImpl ?? fetch)(r.output_url);
      ctype = res.headers.get('content-type');
      const buf = new Uint8Array(await res.arrayBuffer());
      bytes = buf.byteLength;
      if (buf.byteLength <= 120 * 1024 * 1024) tracks = scanMp4Tracks(buf);
    } catch { /* stays unknown */ }
    const tech = technicalCheck(v.edit, v.export_revision, { width: r.output_width, height: r.output_height, duration: r.output_duration_seconds, content_type: ctype, bytes, tracks });
    await ctx.admin.from('campaign_videos').update({
      export_status: 'done', export_url: r.output_url,
      export_meta: { width: r.output_width, height: r.output_height, duration: r.output_duration_seconds, bytes },
      technical_check: tech,
    }).eq('id', videoId);
  }
  return getSpot(ctx, videoId);
}

/** Content check is a separate human confirmation for the exact exported revision. */
export async function confirmContent(ctx: SpotCtx, videoId: string, revision: number, checks: Row) {
  const { data: v } = await ctx.admin.from('campaign_videos').select('*').eq('id', videoId).eq('user_id', ctx.userId).maybeSingle();
  if (!v) throw new SpotError('NOT_FOUND', 'Not found.');
  if (v.export_status !== 'done' || v.export_revision !== v.edit_revision || revision !== v.edit_revision) throw new SpotError('STALE', 'Confirm only the current export.');
  const passed = checks.voiceover_audible_correct === true && checks.texts_readable === true && checks.picture_ok === true;
  const content = { revision, passed, checks, by: 'user', checked_at: new Date().toISOString() };
  const techOk = v.technical_check?.revision === revision && v.technical_check?.passed === true;
  await ctx.admin.from('campaign_videos').update({ content_check: content, final_client_ready: passed && techOk }).eq('id', videoId);
  return getSpot(ctx, videoId);
}

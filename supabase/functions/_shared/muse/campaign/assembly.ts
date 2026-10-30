/**
 * Phase C spot assembly job.
 *
 * prepare → the user approves one exact, immutable scope (one row in
 * campaign_assembly_jobs) → the background worker executes exactly that scope,
 * step by step, persisting after every step. Each provider step becomes one
 * campaign_post_actions row and runs at most once (claim_post_action). A step
 * that was interrupted mid-provider-call is never repeated — the job fails.
 * Chat continuations never touch this job; nothing here generates video shots.
 */
import { loadLatestAssembly } from '../state/loaders.ts';
import { costDoc, totalCut, validateEdit, requirementsFrom, type SpotEdit } from './spot.ts';
import { getSpot, loadAll, refreshExport, runAction, SpotError, type SpotCtx } from './spotRuntime.ts';
import { probeRemoteVideo, type ProbedVideoMetadata } from '../../mp4-probe.ts';

export const DURATION_TOLERANCE_S = 0.1;
export const MIN_SHORT_SIDE = 720;
export const MIN_LONG_SIDE = 1280;

/** Pure: judges measured export metadata. Every unknown value is a failure, never a pass. */
export function evaluateTechnical(m: ProbedVideoMetadata, want: { target_duration: number; aspect: string; need_audio: boolean }) {
  const w = Number(m.width) || 0, h = Number(m.height) || 0, d = Number(m.durationSeconds);
  const measured = { container: m.container, duration_s: Number.isFinite(d) ? d : null, width: w || null, height: h || null, aspect: w && h ? Number((w / h).toFixed(4)) : null, video_track: m.hasVideoTrack === true, audio_track: m.hasAudioTrack === true, size_bytes: m.sizeBytes || null, codec: m.codec ?? null };
  const items = [
    { code: 'CONTAINER_INVALID', ok: m.container === 'mp4' && (m.sizeBytes ?? 0) > 10_000, observed: `${m.container}/${m.sizeBytes ?? '?'}B`, expected: 'mp4 >10KB' },
    { code: 'DURATION_OUT_OF_TOLERANCE', ok: Number.isFinite(d) && d > 0 && Math.abs(d - want.target_duration) <= DURATION_TOLERANCE_S, observed: `${measured.duration_s ?? '?'}s`, expected: `${want.target_duration}±${DURATION_TOLERANCE_S}s` },
    { code: 'NOT_PORTRAIT_9_16', ok: want.aspect !== '9:16' || (w > 0 && h > w && Math.abs(w / h - 9 / 16) < 0.01), observed: `${w || '?'}x${h || '?'}`, expected: want.aspect },
    { code: 'RESOLUTION_BELOW_HD', ok: Math.min(w, h) >= MIN_SHORT_SIDE && Math.max(w, h) >= MIN_LONG_SIDE, observed: `${w || '?'}x${h || '?'}`, expected: `>=${MIN_SHORT_SIDE}x${MIN_LONG_SIDE}` },
    { code: 'NO_VIDEO_TRACK', ok: m.hasVideoTrack === true, observed: String(m.hasVideoTrack ?? 'unknown'), expected: 'true' },
    { code: 'NO_AUDIO_TRACK', ok: !want.need_audio || m.hasAudioTrack === true, observed: String(m.hasAudioTrack ?? 'unknown'), expected: want.need_audio ? 'true' : 'any' },
  ];
  return { passed: items.every((i) => i.ok), items, measured };
}

// deno-lint-ignore no-explicit-any
type Row = Record<string, any>;

export const ASSEMBLY_STEPS = [
  'voiceover', 'subtitles', 'music', 'sfx', 'overlays', 'endcard', 'export', 'technical_validation', 'frame_check', 'spot_ai_qa',
] as const;
export type AssemblyStep = typeof ASSEMBLY_STEPS[number];
const PROVIDER_STEPS = new Set<AssemblyStep>(['voiceover', 'subtitles', 'music', 'sfx', 'export', 'frame_check', 'spot_ai_qa']);

/** Music engines with a known flat price — the only ones an assembly may use, so the cap is exact. */
export const MUSIC_FLAT_USD: Record<string, number> = { 'minimax-15': 0.30, 'lyria-3-pro': 0.42, 'stable-audio-25': 0.55 };
export const SFX_CREDITS = 5;
/** Layers the job itself produces — they may be missing at prepare time. */
const PRODUCED = new Set(['VOICEOVER_MISSING', 'SUBTITLES_MISSING', 'SUBTITLES_STALE', 'MUSIC_MISSING', 'SFX_MISSING']);
const STEP_STALE_MS = 10 * 60 * 1000;

export interface AssemblyParams {
  branding_mode: 'approved_logo' | 'text_only';
  voiceover: { text: string; voice_id: string; language: string; start: number };
  music: { prompt: string; tier: string; volume: number; duck: number };
  sfx: { prompt: string; start: number; duration: number; volume: number };
}

export function normalizeParams(p: Row): AssemblyParams {
  const vo = p.voiceover ?? {}, mu = p.music ?? {}, sf = p.sfx ?? {};
  const out: AssemblyParams = {
    branding_mode: p.branding_mode === 'approved_logo' ? 'approved_logo' : 'text_only',
    voiceover: { text: String(vo.text ?? '').trim(), voice_id: String(vo.voice_id ?? ''), language: String(vo.language ?? 'de'), start: Number(vo.start ?? 0) },
    music: { prompt: String(mu.prompt ?? '').trim(), tier: String(mu.tier ?? 'minimax-15'), volume: Number(mu.volume ?? 0.5), duck: Number(mu.duck ?? 0.35) },
    sfx: { prompt: String(sf.prompt ?? '').trim(), start: Number(sf.start ?? 0), duration: Number(sf.duration ?? 2), volume: Number(sf.volume ?? 0.6) },
  };
  if (!out.voiceover.text) throw new SpotError('NO_TEXT', 'Voiceover text required.');
  if (!out.voiceover.voice_id) throw new SpotError('NO_VOICE', 'Voice id required.');
  if (!out.music.prompt) throw new SpotError('NO_PROMPT', 'Music prompt required.');
  if (!(out.music.tier in MUSIC_FLAT_USD)) throw new SpotError('MUSIC_TIER_NOT_CAPPABLE', `Music engine must have a fixed price: ${Object.keys(MUSIC_FLAT_USD).join(', ')}.`);
  if (!out.sfx.prompt) throw new SpotError('NO_PROMPT', 'SFX prompt required.');
  if (!(out.sfx.duration > 0 && out.sfx.duration <= 10)) throw new SpotError('BAD_SFX', 'SFX duration must be 0–10 s.');
  return out;
}

/** Pure: the exact scope and the maximum user price. */
export function buildScope(edit: SpotEdit, revision: number, p: AssemblyParams) {
  const stepParams: Record<string, Row> = {
    voiceover: { text: p.voiceover.text, voice_id: p.voiceover.voice_id, language: p.voiceover.language, start: p.voiceover.start },
    subtitles: { language: p.voiceover.language },
    music: { prompt: p.music.prompt, tier: p.music.tier, volume: p.music.volume, duck: p.music.duck },
    sfx: { prompt: p.sfx.prompt, start: p.sfx.start, duration: p.sfx.duration, volume: p.sfx.volume },
    export: {}, frame_check: {}, spot_ai_qa: {},
  };
  const scope = {
    edit_revision: revision, aspect: edit.aspect, cut_seconds: totalCut(edit), branding_mode: p.branding_mode,
    clips: edit.clips.map((c) => ({ shot_id: c.shot_id, attempt_id: c.attempt_id, trim_in: c.trim_in, trim_out: c.trim_out })),
    overlays: edit.overlays, endcard: edit.endcard,
    steps: ASSEMBLY_STEPS.map((s) => ({ step: s, params: stepParams[s] ?? null })),
    no_shot_generation: true,
  };
  const max_cost = {
    wallet_usd_max: MUSIC_FLAT_USD[p.music.tier],
    legacy_credits_max: SFX_CREDITS,
    per_step: Object.fromEntries([...PROVIDER_STEPS].map((k) => [k, costDoc(k as never, stepParams[k])])),
    note: 'Voiceover, subtitles, export and checks have no user price; their internal costs are not metered and are not stated as numbers.',
  };
  return { scope, max_cost };
}

/** Key-order-independent JSON: jsonb columns reorder object keys on read, so hashes must not depend on insertion order. */
export function canonicalJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v as Row).filter((k) => (v as Row)[k] !== undefined).sort()
      .map((k) => `${JSON.stringify(k)}:${canonicalJson((v as Row)[k])}`).join(',')}}`;
  }
  return JSON.stringify(v ?? null);
}

export async function fingerprint(v: unknown): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalJson(v)));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Semantic JSON equality (key order irrelevant). Never compare JSON objects with JSON.stringify. */
export const jsonEqual = (a: unknown, b: unknown) => canonicalJson(a ?? null) === canonicalJson(b ?? null);

/** The approval covers scope AND max cost together; a change to either invalidates it. */
export const approvalFingerprint = (scope: unknown, maxCost: unknown) => fingerprint({ scope, max_cost: maxCost });

/** Pure: does this step's runtime cost match the approved cost document? */
export const stepCostMatches = (step: AssemblyStep, params: Row, maxCost: Row | null | undefined) =>
  jsonEqual(costDoc(step as never, params), maxCost?.per_step?.[step] ?? null);

/** Explicit voice id wins; else a user-confirmed saved choice; else NO_VOICE (from normalizeParams). */
export function resolveVoice(raw: Row, pp: Row | null): Row {
  const vo = raw?.voiceover ?? {};
  if (vo.voice_id) return raw;
  if (pp?.voiceover_voice_user_confirmed === true && typeof pp.voiceover_voice_id === 'string' && pp.voiceover_voice_id) {
    return { ...raw, voiceover: { ...vo, voice_id: pp.voiceover_voice_id, language: vo.language ?? pp.voiceover_language ?? 'de' } };
  }
  return raw;
}

export async function prepareAssembly(ctx: SpotCtx, videoId: string, raw: Row, by: 'user' | 'agent') {
  await getSpot(ctx, videoId);
  const all = await loadAll(ctx, videoId);
  const params = normalizeParams(resolveVoice(raw, all.video.post_production ?? null));
  let edit: SpotEdit = all.video.edit;
  if (!edit) throw new SpotError('NO_EDIT', 'No cut yet.');
  if (params.branding_mode === 'approved_logo' && !edit.logo) throw new SpotError('LOGO_MISSING', 'approved_logo needs a confirmed logo in the cut.');
  const blocking = validateEdit({ ...edit, branding_mode: params.branding_mode }, requirementsFrom(all.video.post_production, { branding_mode: params.branding_mode }))
    .filter((i) => i.blocking && !PRODUCED.has(i.code));
  if (blocking.length) throw new SpotError('NOT_ASSEMBLABLE', blocking.map((i) => i.detail).join(' '));
  let revision = all.video.edit_revision;
  if (edit.branding_mode !== params.branding_mode) {
    const { data, error } = await ctx.admin.rpc('save_campaign_edit', { p_video: videoId, p_user: ctx.userId, p_edit: { ...edit, branding_mode: params.branding_mode }, p_expected: revision });
    if (error) throw new SpotError('SAVE_FAILED', error.message);
    revision = data as number; edit = { ...edit, branding_mode: params.branding_mode };
  }
  const { scope, max_cost } = buildScope(edit, revision, params);
  await ctx.admin.from('campaign_assembly_jobs').update({ status: 'superseded', updated_at: new Date().toISOString() })
    .eq('video_id', videoId).eq('user_id', ctx.userId).eq('status', 'pending');
  const { data, error } = await ctx.admin.from('campaign_assembly_jobs').insert({
    user_id: ctx.userId, campaign_id: all.video.campaign_id, video_id: videoId, scope, scope_fingerprint: await approvalFingerprint(scope, max_cost),
    edit_revision: revision, expected_revision: revision, max_cost, requested_by: by,
    steps: ASSEMBLY_STEPS.map((s) => ({ step: s, status: 'pending' })),
  }).select('id, max_cost, scope').single();
  if (error) throw new SpotError(/duplicate/.test(error.message) ? 'ASSEMBLY_RUNNING' : 'PREPARE_FAILED', error.message);
  const pp = all.video.post_production ?? {};
  return {
    assembly_id: data.id, status: 'pending', max_cost: data.max_cost, steps: ASSEMBLY_STEPS,
    card: {
      video_id: videoId, video_title: all.video.title ?? null, edit_revision: revision, branding_mode: params.branding_mode,
      voice: { voice_id: params.voiceover.voice_id, voice_name: pp.voiceover_voice_id === params.voiceover.voice_id ? pp.voiceover_voice_name ?? null : null, language: params.voiceover.language },
      scope: data.scope, regenerates_shots: false,
    },
    note: 'An approval card is now shown to the user in chat and in the campaign workspace. Only the user clicking "Approve & start" starts it; a text reply never does. Do not claim it is running.',
  };
}

/**
 * Owner-only (UI → campaign-spot, from the chat card or the workspace — the
 * single execution path). Everything is checked BEFORE the atomic claim, so a
 * stale or tampered package is refused without changing state.
 */
export async function startAssembly(ctx: SpotCtx, jobId: string) {
  const { data: pre } = await ctx.admin.from('campaign_assembly_jobs').select('id, user_id, status, video_id, scope, max_cost, scope_fingerprint, edit_revision').eq('id', jobId).maybeSingle();
  if (!pre || pre.user_id !== ctx.userId || pre.status !== 'pending') throw new SpotError('NOT_PENDING', 'Assembly is not pending (already started, superseded, rejected or not yours).');
  if ((await approvalFingerprint(pre.scope, pre.max_cost)) !== pre.scope_fingerprint) throw new SpotError('SCOPE_MISMATCH', 'The prepared scope or cost no longer matches its fingerprint — prepare again.');
  const v0 = await ctx.admin.from('campaign_videos').select('edit_revision').eq('id', pre.video_id).maybeSingle();
  if (v0.data?.edit_revision !== pre.edit_revision) throw new SpotError('EDIT_CHANGED', 'The cut changed after the scope was prepared — prepare again.');
  const { data, error } = await ctx.admin.rpc('start_assembly_job', { p_id: jobId, p_user: ctx.userId });
  if (error || !data?.id) throw new SpotError('NOT_PENDING', 'Assembly is not pending (already started, superseded or not yours).');
  const v = await ctx.admin.from('campaign_videos').select('edit_revision').eq('id', data.video_id).maybeSingle();
  if (v.data?.edit_revision !== data.edit_revision || (await approvalFingerprint(data.scope, data.max_cost)) !== data.scope_fingerprint) {
    await failJob(ctx, data.id, 'EDIT_CHANGED: the cut changed after the scope was prepared — prepare again.');
    throw new SpotError('EDIT_CHANGED', 'The cut changed after the scope was prepared — prepare again.');
  }
  return { assembly_id: data.id, status: 'running' };
}

/** start + exactly one worker kick, only after a successful claim. Used by campaign-spot. */
export async function startAssemblyAndDispatch(ctx: SpotCtx, jobId: string, dispatch: () => void) {
  const r = await startAssembly(ctx, jobId);
  dispatch();
  return r;
}

/** Owner-only. pending → rejected (rejected_at set); nothing is dispatched. */
export async function rejectAssembly(ctx: SpotCtx, jobId: string) {
  const now = new Date().toISOString();
  const { data } = await ctx.admin.from('campaign_assembly_jobs').update({ status: 'rejected', rejected_at: now, updated_at: now })
    .eq('id', jobId).eq('user_id', ctx.userId).eq('status', 'pending').select('id').maybeSingle();
  if (!data?.id) throw new SpotError('NOT_PENDING', 'Assembly is not pending.');
  return { assembly_id: data.id, status: 'rejected' };
}

async function failJob(ctx: SpotCtx, id: string, error: string) {
  await ctx.admin.from('campaign_assembly_jobs').update({ status: 'failed', error, lease_id: null, lease_until: null, finished_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', id).eq('status', 'running');
}

const stepParams = (job: Row, step: string) => (job.scope.steps as Row[]).find((s) => s.step === step)?.params ?? {};

/**
 * Advance one running job until it finishes, fails, has to wait for the export,
 * or the time budget is spent. Caller must hold the lease (claim_assembly_job).
 */
export async function tickAssembly(ctx: SpotCtx, jobId: string, deadline: number): Promise<{ status: string; step?: string; error?: string }> {
  const T = ctx.admin.from.bind(ctx.admin);
  while (Date.now() < deadline) {
    const { data: job } = await T('campaign_assembly_jobs').select('*').eq('id', jobId).maybeSingle();
    if (!job || job.status !== 'running') return { status: job?.status ?? 'missing' };
    if ((await approvalFingerprint(job.scope, job.max_cost)) !== job.scope_fingerprint) { await failJob(ctx, jobId, 'SCOPE_TAMPERED'); return { status: 'failed', error: 'SCOPE_TAMPERED' }; }
    const steps: Row[] = job.steps;
    const i = steps.findIndex((s) => s.status !== 'done');
    if (i < 0) {
      await T('campaign_assembly_jobs').update({ status: 'done', current_step: steps.length, lease_id: null, lease_until: null, finished_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', jobId).eq('status', 'running');
      return { status: 'done' };
    }
    const step = steps[i].step as AssemblyStep;
    const save = async (patch: Row, jobPatch: Row = {}) => {
      const next = steps.map((s, k) => (k === i ? { ...s, ...patch, updated_at: new Date().toISOString() } : s));
      await T('campaign_assembly_jobs').update({ steps: next, current_step: i, updated_at: new Date().toISOString(), ...jobPatch }).eq('id', jobId).eq('status', 'running');
    };
    const fail = async (msg: string) => { await save({ status: 'failed', error: msg }); await failJob(ctx, jobId, `${step}: ${msg}`); return { status: 'failed', step, error: msg }; };
    const all = await loadAll(ctx, job.video_id);
    const video = all.video;
    const edit: SpotEdit = video.edit;
    if (!steps[i].action_id && video.edit_revision !== job.expected_revision) return fail(`EDIT_CHANGED (expected revision ${job.expected_revision}, found ${video.edit_revision})`);
    if (edit.branding_mode !== job.scope.branding_mode) return fail('BRANDING_MODE_CHANGED');

    if (step === 'overlays') {
      const bad = edit.overlays.some((o) => o.end <= o.start || o.end > totalCut(edit) + 0.05);
      if (bad || !jsonEqual(edit.overlays, job.scope.overlays)) return fail('OVERLAYS_CHANGED_OR_INVALID');
      await save({ status: 'done', result: { overlays: edit.overlays.length } }); continue;
    }
    if (step === 'endcard') {
      if (!jsonEqual(edit.endcard, job.scope.endcard)) return fail('ENDCARD_CHANGED');
      if (job.scope.branding_mode === 'text_only' ? !edit.endcard?.headline?.trim() : !edit.logo) return fail(job.scope.branding_mode === 'text_only' ? 'TEXT_BRANDING_MISSING' : 'LOGO_MISSING');
      await save({ status: 'done', result: { branding_mode: job.scope.branding_mode } }); continue;
    }
    if (step === 'technical_validation') {
      // Always measured on the real exported file — never taken from renderer metadata.
      if (video.export_status !== 'done' || !video.export_url || video.export_revision !== video.edit_revision) return fail('NO_CURRENT_EXPORT');
      let m: ProbedVideoMetadata;
      try { m = await (ctx.probeMedia ?? ((u: string) => probeRemoteVideo(u, ctx.fetchImpl ?? fetch)))(video.export_url); }
      catch (e) { return fail(`MEDIA_METADATA_UNAVAILABLE: ${(e as Error).message}`.slice(0, 300)); }
      const ev = evaluateTechnical(m, { target_duration: Number(edit.target_duration), aspect: edit.aspect, need_audio: !!(edit.voiceover || edit.music || edit.sfx?.length) });
      const measured = { ...ev.measured, source_url: video.export_url };
      await T('campaign_videos').update({ technical_check: { revision: video.export_revision, passed: ev.passed, measured, items: ev.items, source: 'export_file_probe', checked_at: new Date().toISOString() } }).eq('id', video.id);
      if (!ev.passed) {
        const msg = ev.items.filter((x) => !x.ok).map((x) => `${x.code} (${x.observed} vs ${x.expected})`).join('; ');
        await save({ status: 'failed', error: msg, result: { measured, items: ev.items } });
        await failJob(ctx, jobId, `${step}: ${msg}`);
        return { status: 'failed', step, error: msg };
      }
      await save({ status: 'done', result: { passed: true, measured } }); continue;
    }

    // Provider steps — at most once each.
    if (!PROVIDER_STEPS.has(step)) return fail('UNKNOWN_STEP');
    if (steps[i].action_id) {
      const { data: a } = await T('campaign_post_actions').select('id, status, error, updated_at, result').eq('id', steps[i].action_id).maybeSingle();
      if (!a) return fail('ACTION_MISSING');
      if (a.status === 'failed') return fail(a.error ?? 'provider failed');
      if (a.status === 'approved') { /* created, never claimed → run it now (still once) */ }
      else if (a.status === 'running') {
        if (Date.now() - new Date(a.updated_at).getTime() > STEP_STALE_MS) return fail('STEP_INTERRUPTED — not repeated');
        return { status: 'running', step };
      } else if (a.status === 'done') {
        if (step === 'export') {
          if (video.export_status === 'rendering') {
            await refreshExport(ctx, job.video_id);
            const { data: v2 } = await T('campaign_videos').select('export_status, export_meta').eq('id', job.video_id).maybeSingle();
            if (v2?.export_status === 'failed') return fail(`EXPORT_FAILED ${JSON.stringify(v2.export_meta ?? {})}`);
            if (v2?.export_status !== 'done') { await save({ status: 'waiting' }); return { status: 'running', step }; }
          } else if (video.export_status !== 'done') return fail(`EXPORT_${video.export_status}`);
        }
        const { data: v3 } = await T('campaign_videos').select('edit_revision').eq('id', job.video_id).maybeSingle();
        await save({ status: 'done', result: a.result }, { expected_revision: v3?.edit_revision ?? job.expected_revision });
        continue;
      } else return fail(`ACTION_${a.status}`);
    } else {
      const params = stepParams(job, step);
      if (!stepCostMatches(step, params, job.max_cost)) return fail('COST_OUTSIDE_APPROVED_SCOPE');
      await T('campaign_post_actions').update({ status: 'superseded', updated_at: new Date().toISOString() }).eq('video_id', job.video_id).eq('kind', step).eq('status', 'pending');
      const { data: ins, error } = await T('campaign_post_actions').insert({
        user_id: job.user_id, campaign_id: job.campaign_id, video_id: job.video_id, kind: step, params, cost_doc: job.max_cost.per_step[step],
        edit_revision: video.edit_revision, requested_by: 'assembly', status: 'approved', approved_at: new Date().toISOString(), assembly_job_id: job.id,
      }).select('id').single();
      if (error) return fail(/duplicate/.test(error.message) ? 'ANOTHER_STEP_OF_THIS_KIND_IS_OPEN' : error.message);
      await save({ status: 'running', action_id: ins.id }); // persisted before the provider call
    }
    try {
      const { data: cur } = await T('campaign_assembly_jobs').select('steps').eq('id', jobId).maybeSingle();
      await runAction(ctx, (cur?.steps as Row[])[i].action_id);
    } catch (e) {
      return fail((e as Error).message);
    }
    // loop: next iteration reads the action as done and advances
  }
  return { status: 'running' };
}

export async function getAssembly(ctx: SpotCtx, videoId: string) {
  return await loadLatestAssembly(ctx, videoId);
}

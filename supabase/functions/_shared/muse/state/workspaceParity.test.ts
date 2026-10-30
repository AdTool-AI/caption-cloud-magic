/**
 * Before/after parity: the legacy readers (get_spot_edit, get_spot_assembly,
 * production status) and the canonical get_video_workspace_state must report
 * identical values for the same fixture state — and the canonical read never writes.
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { fakeDb } from '../campaign/spotTestKit.ts';
import { getSpot } from '../campaign/spotRuntime.ts';
import { getAssembly } from '../campaign/assembly.ts';
import { productionStatus } from '../campaign/production.ts';
import { pickAttempt } from '../campaign/spot.ts';
import { getVideoWorkspaceState } from './workspaceState.ts';

// deno-lint-ignore no-explicit-any
type Row = Record<string, any>;
const U = 'u1';
const FUTURE = new Date(Date.now() + 86_400_000).toISOString();

function complete(): Record<string, Row[]> {
  const edit = { aspect: '9:16', branding_mode: 'text_only', logo: { url: 'https://x/logo.png' },
    clips: [1, 2].map((i) => ({ shot_id: `s${i}`, attempt_id: `a${i}b`, url: `https://x/${i}.mp4`, trim_start: 0, trim_end: 5 })), overlays: [], target_duration: 30, voiceover: null, music: null, sfx: [], subtitles: null, endcard: { headline: 'Café Buur', cta: 'Komm vorbei', duration: 3 } };
  return {
    agent_campaigns: [{ id: 'c1', user_id: U, stage: 'production', video_duration_s: 30 }],
    campaign_videos: [{ id: 'v1', user_id: U, campaign_id: 'c1', title: 'Pancake', edit, edit_revision: 23, export_status: 'done', export_url: 'https://x/e.mp4', export_revision: 23,
      final_ai_qa: { revision: 23, verdict: 'needs_work', score: 6, recommendation: 'VO kürzen' }, final_client_ready: false,
      post_production: { voiceover_voice_id: 'XrEx', voiceover_voice_name: 'Hannah', voiceover_language: 'de', voiceover_voice_user_confirmed: true, music_direction: { prompt: 'indie-pop' }, sfx_direction: { prompt: 'cup' } } }],
    campaign_shots: [1, 2].map((i) => ({ id: `s${i}`, user_id: U, video_id: 'v1', campaign_id: 'c1', shot_index: i, status: i === 1 ? 'needs_retry' : 'done', selected_attempt_id: `a${i}b`, visual_client_ready: i === 2, client_ready: i === 2, retry_plan: i === 1 ? { model: 'kling-3', est: 1.2 } : null })),
    campaign_shot_attempts: [1, 2].flatMap((i) => ['a', 'b'].map((x, n) => ({ id: `a${i}${x}`, shot_id: `s${i}`, campaign_id: 'c1', user_id: U, attempt_no: n + 1, generation_id: `g${i}${x}`, model: 'kling-3', qa_verdict: i === 1 ? 'fail' : 'pass' }))),
    ai_video_generations: [1, 2].flatMap((i) => ['a', 'b'].map((x) => ({ id: `g${i}${x}`, user_id: U, video_url: `https://x/${i}${x}.mp4`, duration_seconds: 5, status: 'completed' }))),
    campaign_assets: [], campaign_post_actions: [{ id: 'pa1', video_id: 'v1', kind: 'export', status: 'done', created_at: '2026-10-13T09:00:00Z' }],
    campaign_assembly_jobs: [{ id: 'as1', video_id: 'v1', user_id: U, status: 'done', edit_revision: 23, steps: [{ kind: 'export', status: 'done' }], max_cost: { wallet_usd: 0.3 }, created_at: '2026-10-13T10:00:00Z' }],
    campaign_budget_approvals: [{ id: 'ap1', campaign_id: 'c1', kind: 'retry', status: 'pending', max_total: 1.5, start_expires_at: FUTURE, retry_binding: { shot_id: 's1', attempt_no: 3 }, created_at: '2026-10-13T11:00:00Z' }],
    ai_video_wallets: [{ user_id: U, currency: 'USD' }], campaign_spend_ledger: [],
  };
}
function incomplete(): Record<string, Row[]> {
  const t = complete();
  t.campaign_videos[0].edit = { aspect: '9:16', branding_mode: 'text_only', clips: [], overlays: [], target_duration: 30, voiceover: null, music: null, sfx: [], subtitles: null, endcard: null };
  Object.assign(t.campaign_videos[0], { export_status: null, export_url: null, export_revision: null, final_ai_qa: null, post_production: {} });
  t.campaign_assembly_jobs = [{ id: 'as2', video_id: 'v1', user_id: U, status: 'pending', edit_revision: 23, steps: [], max_cost: { wallet_usd: 0.3 }, created_at: '2026-10-13T12:00:00Z' }];
  t.campaign_shots.forEach((s) => { s.retry_plan = null; });
  return t;
}

/** Wraps fakeDb and counts every write (update/insert/upsert/delete/rpc). */
function countingDb(tables: Record<string, Row[]>) {
  const db = fakeDb(tables);
  const writes: string[] = [];
  return {
    writes,
    db: {
      rpc: (n: string, a: Row) => { writes.push(`rpc:${n}`); return db.rpc(n, a); },
      from: (t: string) => {
        const b = db.from(t);
        for (const m of ['update', 'insert', 'upsert', 'delete']) {
          const orig = b[m];
          b[m] = (...args: unknown[]) => { writes.push(`${m}:${t}`); return orig ? orig(...args) : b; };
        }
        return b;
      },
    },
  };
}
const canon = (v: unknown): unknown => Array.isArray(v) ? v.map(canon)
  : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v as Row).sort().map((k) => [k, canon((v as Row)[k])])) : v;
const same = (label: string, a: unknown, b: unknown) => assertEquals(canon(a), canon(b), label);

for (const [name, seed] of [['complete', complete], ['incomplete', incomplete]] as const) {
  Deno.test(`parity (${name}): legacy readers and canonical state report identical values`, async () => {
    const tables = seed();
    const snapshot = JSON.stringify(tables);
    const c = countingDb(tables);
    const ctx = { admin: c.db, userId: U, userJwt: '', supabaseUrl: '', anonKey: '', conversationId: 'conv' };

    const ws = await getVideoWorkspaceState(ctx, 'v1');
    assertEquals(c.writes, [], 'canonical read never writes');
    assertEquals(JSON.stringify(tables), snapshot, 'tables unchanged');

    const spot = await getSpot(ctx as never, 'v1'); // edit exists in both fixtures → no write path
    const asm = await getAssembly(ctx as never, 'v1');
    const prod = (await productionStatus(ctx as never, { campaign_id: 'c1' })).output as Row;
    assertEquals(c.writes, [], 'legacy reads did not write either (edit present)');
    const video = tables.campaign_videos[0];

    // Edit / revision
    same('edit_revision', spot.revision, ws.edit_revision);
    same('stage', spot.stage, ws.video.stage);
    same('cut_seconds', spot.cut_seconds, ws.current_edit?.cut_seconds ?? null);
    same('branding_mode', spot.branding_mode, ws.current_edit?.branding_mode);
    same('clip_count', spot.edit?.clips?.length ?? 0, ws.current_edit?.clip_count);

    // Clips + selected attempts
    same('clips', spot.shots.map((s: Row) => ({ shot_id: s.id, index: s.index, attempts: s.attempts.length, attempt_id: pickAttempt(tables.campaign_shots.find((x) => x.id === s.id)!, tables.campaign_shot_attempts)?.id ?? null })),
      ws.clips.map((c) => ({ shot_id: c.shot_id, index: c.index, attempts: c.attempts, attempt_id: c.attempt_id })));
    same('selected attempts match stored selection', spot.shots.map((s: Row) => s.selected_attempt_id), ws.clips.map((c) => c.attempt_id));

    // Voice / Music / SFX / Logo
    const pp = video.post_production ?? {};
    same('voice', pp.voiceover_voice_id ? { voice_id: pp.voiceover_voice_id, name: pp.voiceover_voice_name, language: pp.voiceover_language, confirmed: pp.voiceover_voice_user_confirmed === true } : null, ws.voice);
    same('music', pp.music_direction ?? null, ws.music);
    same('sfx', pp.sfx_direction ?? null, ws.sfx);
    same('logo', spot.edit?.logo ? { url: spot.edit.logo.url } : null, ws.logo);

    // Export
    same('export', { status: spot.export.status, revision: spot.export.revision, url: spot.export.url }, ws.latest_export);
    same('technical_acceptance', spot.technical_acceptance, ws.technical_acceptance);

    // Shot QA (production status)
    same('shot qa verdicts', spot.shots.map((s: Row) => s.attempts.find((a: Row) => a.id === s.selected_attempt_id)?.qa_verdict ?? null), ws.clips.map((c) => c.qa_verdict));
    same('shot status', (prod.shots as Row[]).map((s) => ({ id: s.id, status: s.status })), ws.clips.map((c) => ({ id: c.shot_id, status: c.status })));
    same('visually ready', tables.campaign_shots.filter((s) => s.visual_client_ready === true).length, ws.shot_qa.visually_ready);

    // Final QA
    same('final_qa', spot.final_ai_qa ? { revision: spot.final_ai_qa.revision, verdict: spot.final_ai_qa.verdict, score: spot.final_ai_qa.score, recommendation: spot.final_ai_qa.recommendation ?? null } : null, ws.final_qa);
    same('final_client_ready', spot.final_client_ready, ws.final_client_ready);

    // Assembly
    same('assembly', asm ? { id: asm.id, status: asm.status, edit_revision: asm.edit_revision } : null,
      ws.assembly ? { id: ws.assembly.id, status: ws.assembly.status, edit_revision: ws.assembly.edit_revision } : null);

    // Approvals (budget/retry from production status; assembly approval derived from pending job)
    const legacyOpen = (prod.approvals as Row[]).filter((a) => a.status === 'pending').map((a) => a.id);
    if (asm?.status === 'pending') legacyOpen.unshift(asm.id);
    same('open approvals', legacyOpen, ws.open_approvals.map((a) => a.id));

    // Retry plans
    same('retry plans', (prod.shots as Row[]).filter((s) => s.retry_plan).map((s) => ({ shot_id: s.id, plan: s.retry_plan })), ws.retry_plans.map((r) => ({ shot_id: r.shot_id, plan: r.plan })));
  });
}

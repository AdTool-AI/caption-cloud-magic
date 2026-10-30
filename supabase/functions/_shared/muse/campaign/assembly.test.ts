import { assert, assertEquals, assertRejects } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { getAssembly, prepareAssembly, startAssembly, tickAssembly } from './assembly.ts';
import { getSpot, saveEdit, type SpotProviders } from './spotRuntime.ts';
import { requirementsFrom, validateEdit, buildRenderPayload, type SpotEdit } from './spot.ts';
import { planFrameProbes } from './frameCheck.ts';
import { setup } from './spotTestKit.ts';

// deno-lint-ignore no-explicit-any
type Row = Record<string, any>;

const params = {
  branding_mode: 'text_only',
  voiceover: { text: 'Kräftig gewürzt.', voice_id: 'voice-de', language: 'de', start: 0.5 },
  music: { prompt: 'warm acoustic', tier: 'minimax-15' },
  sfx: { prompt: 'pan sizzle', start: 0, duration: 2 },
};
const providers: SpotProviders = {
  observeFrames: async (_u, probes) => probes.map((p) => ({ element_id: p.element_id, ocr_text: p.expected })),
  analyzeSpot: async () => JSON.stringify({ score: 7, verdict: 'pass', issues: [] }),
};

async function ready() {
  const s = setup();
  await getSpot(s.ctx, 'v1');
  await saveEdit(s.ctx, 'v1', { endcard: { headline: 'CORDIAL', cta: 'Jetzt ansehen', duration: 3 } }, null);
  return s;
}
const job = (t: Record<string, Row[]>) => t.campaign_assembly_jobs[0];
const finishRender = (t: Record<string, Row[]>) => { const r = t.director_cut_renders[0]; Object.assign(r, { status: 'completed', output_url: 'https://x/out.mp4', output_width: 1080, output_height: 1920, output_duration_seconds: 30 }); };

Deno.test('text_only: no logo requirement, no LOGO_MISSING, no logo in payload or frame probes', () => {
  const pp = { brand_name_overlay: 'X', cta_text: 'Go' };
  assertEquals(requirementsFrom(pp, { branding_mode: 'text_only' }).logo, false);
  assertEquals(requirementsFrom(pp).logo, true);
  const e = { aspect: '9:16', target_duration: 5, clips: [{ shot_id: 's', attempt_id: 'a', url: 'u', source_duration: 5, trim_in: 0, trim_out: 5 }], voiceover: null, music: null, sfx: [], subtitles: null, overlays: [], logo: { url: 'l', source: 'upload', rights_confirmed: false, width: 10, height: 10 }, endcard: { headline: 'X', cta: 'Go', duration: 2 }, branding_mode: 'text_only' } as SpotEdit;
  const codes = validateEdit(e, requirementsFrom(pp, e)).map((i) => i.code);
  assert(!codes.includes('LOGO_MISSING') && !codes.includes('LOGO_RIGHTS'));
  assert(!buildRenderPayload(e, 1).overlays?.some((o: Row) => o.kind === 'logo'));
  assert(!planFrameProbes(e).some((p) => p.kind === 'logo'));
  const noHead = validateEdit({ ...e, endcard: { headline: '', cta: 'Go', duration: 2 } }, requirementsFrom(pp, e)).map((i) => i.code);
  assert(noHead.includes('TEXT_BRANDING_MISSING'));
});

Deno.test('prepare makes one pending scope with exact cap; no provider call', async () => {
  const { ctx, tables, calls } = await ready();
  const r = await prepareAssembly(ctx, 'v1', params, 'agent');
  assertEquals(r.status, 'pending');
  assertEquals(r.max_cost.wallet_usd_max, 0.30);
  assertEquals(r.max_cost.legacy_credits_max, 5);
  assertEquals(calls.length, 0);
  assertEquals(tables.campaign_post_actions.length, 0);
  await assertRejects(() => prepareAssembly(ctx, 'v1', { ...params, music: { prompt: 'x', tier: 'elevenlabs-music-v2' } }, 'agent'));
});

Deno.test('worker does nothing without approval; start twice → one start', async () => {
  const { ctx, tables, calls } = await ready();
  const { assembly_id } = await prepareAssembly(ctx, 'v1', params, 'agent');
  assertEquals((await tickAssembly(ctx, assembly_id, Date.now() + 5000)).status, 'pending');
  assertEquals(calls.length, 0);
  await startAssembly(ctx, assembly_id);
  await assertRejects(() => startAssembly(ctx, assembly_id));
  assertEquals(job(tables).status, 'running');
});

Deno.test('full run: each provider step exactly once, waits for export, final_client_ready stays false', async () => {
  const { ctx, tables, calls } = await ready();
  ctx.providers = providers;
  const { assembly_id } = await prepareAssembly(ctx, 'v1', params, 'user');
  await startAssembly(ctx, assembly_id);
  let r = await tickAssembly(ctx, assembly_id, Date.now() + 5000);
  assertEquals(r.status, 'running'); // waiting on render
  assertEquals(calls.map((c) => c.fn), ['generate-voiceover', 'generate-subtitles', 'generate-music-track', 'generate-scene-sfx', 'render-directors-cut']);
  assertEquals(calls[2].body.tier, 'minimax-15');
  // a second tick while rendering repeats nothing
  r = await tickAssembly(ctx, assembly_id, Date.now() + 5000);
  assertEquals(calls.length, 5);
  finishRender(tables);
  r = await tickAssembly(ctx, assembly_id, Date.now() + 5000);
  assertEquals(r.status, 'done', JSON.stringify(job(tables).steps));
  assertEquals(calls.length, 5);
  const kinds = tables.campaign_post_actions.map((a) => a.kind).sort();
  assertEquals(kinds, ['export', 'frame_check', 'music', 'sfx', 'spot_ai_qa', 'subtitles', 'voiceover']);
  assert(tables.campaign_post_actions.every((a) => a.status === 'done' && a.requested_by === 'assembly'));
  assertEquals(tables.campaign_videos[0].final_client_ready, false); // shots never passed visual QA
  assertEquals(tables.ai_video_generations.length, 7); // no shot generation
  assertEquals((await getAssembly(ctx, 'v1'))?.status, 'done');
});

Deno.test('interrupted provider step is never repeated; job fails', async () => {
  const { ctx, tables, calls } = await ready();
  const { assembly_id } = await prepareAssembly(ctx, 'v1', params, 'user');
  await startAssembly(ctx, assembly_id);
  // simulate crash: step 1 recorded with an action stuck in running for 11 min
  tables.campaign_post_actions.push({ id: 'stuck', kind: 'voiceover', video_id: 'v1', user_id: 'user-1', status: 'running', updated_at: new Date(Date.now() - 11 * 60_000).toISOString() });
  job(tables).steps[0] = { step: 'voiceover', status: 'running', action_id: 'stuck' };
  const r = await tickAssembly(ctx, assembly_id, Date.now() + 5000);
  assertEquals(r.status, 'failed');
  assertEquals(calls.length, 0);
});

Deno.test('provider failure stops the job; edit change after approval stops the job', async () => {
  const a = await ready();
  const { assembly_id } = await prepareAssembly(a.ctx, 'v1', params, 'user');
  await startAssembly(a.ctx, assembly_id);
  a.ctx.fetchImpl = (async () => new Response(JSON.stringify({ error: 'boom' }), { status: 500 })) as typeof fetch;
  assertEquals((await tickAssembly(a.ctx, assembly_id, Date.now() + 5000)).status, 'failed');
  assertEquals(job(a.tables).status, 'failed');

  const b = await ready();
  const p = await prepareAssembly(b.ctx, 'v1', params, 'user');
  await saveEdit(b.ctx, 'v1', { overlays: [{ id: 'x', text: 'neu', start: 1, end: 2 }] }, null);
  await assertRejects(() => startAssembly(b.ctx, p.assembly_id));
  assertEquals(b.calls.length, 0);
});

Deno.test('missing check providers → job stops at frame check, nothing faked', async () => {
  const { ctx, tables } = await ready();
  const { assembly_id } = await prepareAssembly(ctx, 'v1', params, 'user');
  await startAssembly(ctx, assembly_id);
  await tickAssembly(ctx, assembly_id, Date.now() + 5000);
  finishRender(tables);
  const r = await tickAssembly(ctx, assembly_id, Date.now() + 5000);
  assertEquals(r.status, 'failed');
  assertEquals(r.step, 'frame_check');
  assertEquals(tables.campaign_videos[0].frame_check ?? null, null);
});

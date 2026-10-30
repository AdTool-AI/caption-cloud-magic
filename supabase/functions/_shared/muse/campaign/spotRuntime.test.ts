import { assert, assertEquals, assertRejects } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { refreshClipUrls, approveAction, confirmContent, getSpot, prepareAction, refreshExport, runAction, saveEdit, selectAttempt, type SpotCtx } from './spotRuntime.ts';

import { fakeDb, setup, U } from './spotTestKit.ts';
import type { SpotProviders } from './spotRuntime.ts';
function mockProviders(missing: string[] = []): SpotProviders {
  return {
    observeFrames: async (_u, probes) => probes.map((p) => p.kind === 'logo'
      ? { element_id: p.element_id, logo_similarity: missing.includes(p.element_id) ? 0.1 : 0.95 }
      : { element_id: p.element_id, ocr_text: missing.includes(p.element_id) ? 'random' : p.expected }),
    analyzeSpot: async () => '{"score":7,"verdict":"pass","issues":[],"summary":"ok"}',
  };
}

async function approveRun(ctx: SpotCtx, id: string) { await approveAction(ctx, id); return runAction(ctx, id); }

Deno.test('end-to-end with mocked providers: cut → audio/text → export → checks', async () => {
  const { tables, ctx, calls } = setup();
  const s0 = await getSpot(ctx, 'v1');
  assertEquals(s0.cut_seconds, 30);
  assertEquals(s0.stage, 'clips_done');
  // reopening never duplicates or rewrites the cut
  const again = await getSpot(ctx, 'v1');
  assertEquals(again.revision, s0.revision);

  // pick the 2nd attempt of shot 1 — no generation call
  await selectAttempt(ctx, 'v1', 's1', 'a1b');
  assertEquals(calls.length, 0);
  assertEquals(tables.campaign_videos[0].edit.clips[0].url, 'https://x/g1b.mp4');

  // provider steps need explicit user approval
  const vo = await prepareAction(ctx, 'v1', 'voiceover', { text: 'Ein Kabel. Ein Klang.' }, 'agent');
  await assertRejects(() => runAction(ctx, vo.action_id));
  assertEquals(calls.length, 0);
  await approveRun(ctx, vo.action_id);
  assertEquals(calls[0].body.language, 'de');
  // second run of the same approval does nothing
  await assertRejects(() => runAction(ctx, vo.action_id));
  assertEquals(calls.filter((c) => c.fn === 'generate-voiceover').length, 1);

  const sub = await prepareAction(ctx, 'v1', 'subtitles', {}, 'user');
  await approveRun(ctx, sub.action_id);
  assertEquals(calls.at(-1)!.body.audioUrl, 'https://x/vo.mp3');
  const music = await prepareAction(ctx, 'v1', 'music', { prompt: 'warm indie', tier: 'minimax-15' }, 'user');
  assertEquals(music.cost.internal, '0.30 USD flat');
  await approveRun(ctx, music.action_id);
  const sfx = await prepareAction(ctx, 'v1', 'sfx', { prompt: 'jack plug click', start: 1, duration: 1 }, 'user');
  await approveRun(ctx, sfx.action_id);

  // export blocked until logo exists; foreign logos refused
  await assertRejects(() => prepareAction(ctx, 'v1', 'export', {}, 'agent'));
  await assertRejects(() => saveEdit(ctx, 'v1', { logo: { url: 'https://evil/fake.png', rights_confirmed: true } }, null));
  await assertRejects(() => saveEdit(ctx, 'v1', { logo: { url: 'https://cordial/found-logo.png', rights_confirmed: true } }, null)); // reference_only until owner confirms
  await saveEdit(ctx, 'v1', { logo: { url: 'https://cordial/logo.svg', rights_confirmed: true, width: 800, height: 400 } }, null);

  const exp = await prepareAction(ctx, 'v1', 'export', {}, 'agent');
  await approveRun(ctx, exp.action_id);
  const render = calls.find((c) => c.fn === 'render-directors-cut')!.body;
  assertEquals(render.duration_seconds, 30);
  assertEquals(render.scenes.length, 6);
  assertEquals(render.scenes[0].additional_media.url, 'https://x/g1b.mp4');
  assertEquals(render.export_settings.aspect_ratio, '9:16');
  assertEquals(render.subtitle_track.clips[0].startTime, 0);

  tables.director_cut_renders[0] = { id: 'r1', status: 'completed', output_url: 'https://cdn/out.mp4', output_width: 1080, output_height: 1920, output_duration_seconds: 30 };
  const done = await refreshExport(ctx, 'v1');
  assertEquals(done.stage, 'export_done');
  assert(done.technical_check.passed, JSON.stringify(done.technical_check.items));
  assert(!done.final_client_ready);

  // acceptance checks: refuse without a configured provider, then run once with mocks
  const fc0 = await prepareAction(ctx, 'v1', 'frame_check', {}, 'agent');
  await approveAction(ctx, fc0.action_id);
  await assertRejects(() => runAction(ctx, fc0.action_id)); // PROVIDER_NOT_CONFIGURED, nothing called
  ctx.providers = mockProviders();
  const fc = await prepareAction(ctx, 'v1', 'frame_check', {}, 'user');
  await approveRun(ctx, fc.action_id);
  const qa = await prepareAction(ctx, 'v1', 'spot_ai_qa', {}, 'user');
  await approveRun(ctx, qa.action_id);
  const checked = await getSpot(ctx, 'v1');
  assert(checked.frame_check.passed, JSON.stringify(checked.frame_check.items));
  assertEquals(checked.technical_acceptance.status, 'passed');
  assertEquals(checked.final_ai_qa.method, 'ai_analysis');
  // shots not visually ready → never customer-ready, even with everything else passed
  const notReady = await confirmContent(ctx, 'v1', done.revision, { voiceover_audible_correct: true, texts_readable: true, picture_ok: true });
  assert(!notReady.final_client_ready);
  assert(notReady.customer_ready.reasons.some((r: string) => r.startsWith('SHOTS_NOT_VISUALLY_READY')));
  tables.campaign_shots.forEach((s) => { s.visual_client_ready = true; });

  const fin = await confirmContent(ctx, 'v1', done.revision, { voiceover_audible_correct: true, texts_readable: true, picture_ok: true });
  assertEquals(fin.stage, 'final_checked');
  assert(fin.final_client_ready);

  // any edit afterwards makes the export visibly stale and clears "ready"
  const edited = await saveEdit(ctx, 'v1', { endcard: { headline: 'CORDIAL', cta: 'Jetzt ansehen', duration: 2 } }, null);
  assertEquals(edited.stage, 'cut_done');
  assert(edited.export_stale);
  assert(!edited.final_client_ready);
  // no clip was ever (re)generated
  assert(!calls.some((c) => /generate-.*-video/.test(c.fn)));
});

Deno.test('an approved step runs exactly once even with parallel runs', async () => {
  const { ctx, calls } = setup();
  await getSpot(ctx, 'v1');
  const vo = await prepareAction(ctx, 'v1', 'voiceover', { text: 'x' }, 'user');
  await approveAction(ctx, vo.action_id);
  // a parallel second run of the same approval: only one wins
  const results = await Promise.allSettled([runAction(ctx, vo.action_id), runAction(ctx, vo.action_id)]);
  assertEquals(results.filter((r) => r.status === 'fulfilled').length, 1);
  assertEquals(calls.filter((c) => c.fn === 'generate-voiceover').length, 1);
});

Deno.test('clip list edits only reorder/trim existing shots', async () => {
  const { ctx } = setup();
  const s = await getSpot(ctx, 'v1');
  await assertRejects(() => saveEdit(ctx, 'v1', { clips: s.edit!.clips.slice(1) }, null));
  const rev = [...s.edit!.clips].reverse().map((c) => ({ shot_id: c.shot_id, trim_in: c.trim_in, trim_out: c.trim_out, url: 'https://evil/x.mp4' }));
  const out = await saveEdit(ctx, 'v1', { clips: rev }, s.revision);
  assertEquals(out.edit!.clips[0].shot_id, 's6');
  assertEquals(out.edit!.clips[0].url, 'https://x/g6.mp4'); // URL never taken from input
  await assertRejects(() => saveEdit(ctx, 'v1', { overlays: [] }, s.revision)); // stale revision
});

Deno.test('refreshClipUrls: fills null URLs, keeps order/trims, no paid writes; fails closed', async () => {
  const { tables, ctx, calls } = setup();
  tables.ai_video_generations.forEach((g) => { g.status = 'completed'; g.user_id = U; });
  await getSpot(ctx, 'v1');
  const v = tables.campaign_videos[0];
  v.edit.clips = v.edit.clips.map((c: Row) => ({ ...c, url: null }));
  const before = structuredClone(v.edit.clips);
  const counts = () => JSON.stringify([tables.campaign_post_actions.length, tables.ai_video_generations.length, calls.length]);
  const c0 = counts();
  const r = await refreshClipUrls(ctx, 'v1');
  assertEquals(r.changed, 6);
  v.edit.clips.forEach((c: Row, i: number) => { assert(c.url); assertEquals({ ...c, url: null }, before[i]); });
  assertEquals(counts(), c0);
  const rev = v.edit_revision;
  assertEquals((await refreshClipUrls(ctx, 'v1')).changed, 0);
  assertEquals(v.edit_revision, rev);
  v.edit.clips[2].url = null; tables.ai_video_generations.find((g) => g.id === v.edit.clips[2].attempt_id.replace('a', 'g'))!.video_url = null;
  await assertRejects(() => refreshClipUrls(ctx, 'v1'));
  assertEquals(v.edit_revision, rev);
  assertEquals(v.edit.clips[2].url, null);
  await assertRejects(() => refreshClipUrls({ ...ctx, userId: 'other' }, 'v1'));
});

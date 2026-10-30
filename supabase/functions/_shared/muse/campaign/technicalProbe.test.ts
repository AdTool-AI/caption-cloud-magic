import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { evaluateTechnical, prepareAssembly, startAssembly, tickAssembly } from './assembly.ts';
import { getSpot, saveEdit, type SpotProviders } from './spotRuntime.ts';
import { CAFE_EXPORT, setup } from './spotTestKit.ts';

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
const want = { target_duration: 30, aspect: '9:16', need_audio: true };
const failing = (m: Record<string, unknown>) => evaluateTechnical({ ...CAFE_EXPORT, ...m } as never, want).items.filter((i) => !i.ok).map((i) => i.code);

Deno.test('Café Buur export shape passes', () => {
  const r = evaluateTechnical(CAFE_EXPORT, want);
  assert(r.passed); assertEquals(r.measured.aspect, 0.5625); assertEquals(r.measured.audio_track, true);
});
Deno.test('each failure has its own code; unknown never passes', () => {
  assertEquals(failing({ durationSeconds: 27.9 }), ['DURATION_OUT_OF_TOLERANCE']);
  assertEquals(failing({ width: 1920, height: 1080 }), ['NOT_PORTRAIT_9_16']);
  assertEquals(failing({ width: 540, height: 960 }), ['RESOLUTION_BELOW_HD']);
  assertEquals(failing({ hasAudioTrack: false }), ['NO_AUDIO_TRACK']);
  assertEquals(failing({ hasVideoTrack: undefined }), ['NO_VIDEO_TRACK']);
  assertEquals(failing({ container: 'mov' }), ['CONTAINER_INVALID']);
  assertEquals(failing({ durationSeconds: NaN, width: 0, height: 0 }).sort(), ['DURATION_OUT_OF_TOLERANCE', 'NOT_PORTRAIT_9_16', 'RESOLUTION_BELOW_HD']);
});

async function ready() {
  const s = setup();
  s.ctx.providers = providers;
  await getSpot(s.ctx, 'v1');
  await saveEdit(s.ctx, 'v1', { endcard: { headline: 'CORDIAL', cta: 'Jetzt ansehen', duration: 3 } }, null);
  const { assembly_id } = await prepareAssembly(s.ctx, 'v1', params, 'user');
  await startAssembly(s.ctx, assembly_id);
  return { ...s, id: assembly_id };
}
// Renderer metadata deliberately missing: only the file probe may decide.
const finishRender = (t: Record<string, Record<string, unknown>[]>) => Object.assign(t.director_cut_renders[0], { status: 'completed', output_url: 'https://x/out.mp4' });
const job = (t: Record<string, Record<string, unknown>[]>) => t.campaign_assembly_jobs[0] as Record<string, any>;

Deno.test('export waiting → render completes → worker wakes → same export done → technical validation on the measured file continues', async () => {
  const s = await ready();
  let r = await tickAssembly(s.ctx, s.id, Date.now() + 5000);
  assertEquals(r.status, 'running');
  assertEquals(job(s.tables).steps[6].status, 'waiting');
  r = await tickAssembly(s.ctx, s.id, Date.now() + 5000); // tick while still rendering
  assertEquals(job(s.tables).steps[6].status, 'waiting');
  finishRender(s.tables);
  r = await tickAssembly(s.ctx, s.id, Date.now() + 5000); // worker wakes
  assertEquals(r.status, 'done', JSON.stringify(job(s.tables).steps));
  assertEquals(s.calls.filter((c) => c.fn === 'render-directors-cut').length, 1);
  assertEquals(s.tables.director_cut_renders.length, 1);
  assertEquals(s.tables.campaign_post_actions.filter((a) => a.kind === 'export').length, 1);
  assertEquals(s.probes, ['https://x/out.mp4']);
  const tv = job(s.tables).steps[7];
  assertEquals(tv.status, 'done'); assertEquals(tv.result.measured.width, 1080); assertEquals(tv.result.measured.duration_s, 30);
  assertEquals((s.tables.campaign_videos[0] as Record<string, any>).technical_check.source, 'export_file_probe');
  assertEquals((s.tables.campaign_videos[0] as Record<string, any>).final_client_ready, false);
});

Deno.test('unreadable export → MEDIA_METADATA_UNAVAILABLE, job fails at step 8, no later step runs', async () => {
  const s = await ready();
  s.ctx.probeMedia = async () => { throw new Error('no moov'); };
  await tickAssembly(s.ctx, s.id, Date.now() + 5000);
  finishRender(s.tables);
  const r = await tickAssembly(s.ctx, s.id, Date.now() + 5000);
  assertEquals(r.status, 'failed'); assertEquals(r.step, 'technical_validation');
  assert(String(r.error).startsWith('MEDIA_METADATA_UNAVAILABLE'));
  assert(!s.tables.campaign_post_actions.some((a) => a.kind === 'frame_check'));
});

Deno.test('missing audio track with VO in scope → NO_AUDIO_TRACK with measured values stored', async () => {
  const s = await ready();
  s.ctx.probeMedia = async () => ({ ...CAFE_EXPORT, hasAudioTrack: false });
  await tickAssembly(s.ctx, s.id, Date.now() + 5000);
  finishRender(s.tables);
  const r = await tickAssembly(s.ctx, s.id, Date.now() + 5000);
  assertEquals(r.status, 'failed'); assert(String(r.error).includes('NO_AUDIO_TRACK'));
  assertEquals(job(s.tables).steps[7].result.measured.audio_track, false);
  assertEquals(job(s.tables).status, 'failed');
});

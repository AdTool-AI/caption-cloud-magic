import { assert, assertEquals, assertThrows } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { judgeFrames, planFrameProbes, textCoverage } from './frameCheck.ts';
import { customerReady, parseSpotQa, technicalAcceptance } from './spotQa.ts';
import { buildRenderPayload, logoBox, validateEdit, type SpotEdit } from './spot.ts';

const edit = (logo: Partial<NonNullable<SpotEdit['logo']>> | null = { width: 1000, height: 500 }): SpotEdit => ({
  aspect: '9:16', target_duration: 30,
  clips: [{ shot_id: 's1', attempt_id: 'a1', url: 'u', source_duration: 30, trim_in: 0, trim_out: 30 }] as SpotEdit['clips'],
  voiceover: null, music: null, sfx: [], subtitles: null,
  overlays: [{ id: 'ov-0', text: 'Café Buur', start: 0, end: 2.5, role: 'text' }, { id: 'ov-3', text: 'Frisch aus der Pfanne', start: 19, end: 21.5, role: 'text' }],
  logo: logo ? { url: 'https://x/logo.png', source: 'upload', rights_confirmed: true, ...logo } : null,
  endcard: { headline: 'Café Buur Düsseldorf', cta: 'Erlebe Brunch neu – komm vorbei!', duration: 3 },
});

Deno.test('logo keeps its aspect ratio (landscape, portrait, square)', () => {
  const land = logoBox(1080, 1920, 1000, 500);
  assertEquals(land.px.w, 432); assertEquals(land.px.h, 216);
  const sq = logoBox(1080, 1920, 600, 600);
  assertEquals(sq.px.w, sq.px.h);
  const tall = logoBox(1080, 1920, 300, 3000); // clamps to 60 % height, ratio preserved
  assertEquals(tall.px.h, 1152); assertEquals(Math.round(tall.px.h / tall.px.w), 10);
  const box = buildRenderPayload(edit(), 1).text_overlays.find((o) => o.id === 'logo')!.box;
  assertEquals(box.w, 0.4);
});

Deno.test('logo without pixel size blocks export and is not rendered', () => {
  const e = edit({ width: undefined, height: undefined });
  assert(validateEdit(e, { voiceover: false, music: false, sfx: false, subtitles: false, logo: true, endcard: true }).some((i) => i.code === 'LOGO_SIZE_UNKNOWN'));
  assert(!buildRenderPayload(e, 1).text_overlays.some((o) => o.id === 'logo'));
});

Deno.test('frame check: probes at window middles; missing element fails', () => {
  const probes = planFrameProbes(edit());
  assertEquals(probes.map((p) => [p.element_id, p.t]), [['ov-0', 1.25], ['ov-3', 20.25], ['endcard', 28.5], ['logo', 28.5]]);
  const ok = judgeFrames(5, probes, probes.map((p) => p.kind === 'logo' ? { element_id: p.element_id, logo_similarity: 0.9 } : { element_id: p.element_id, ocr_text: p.expected.toUpperCase() }));
  assert(ok.passed);
  const bad = judgeFrames(5, probes, probes.filter((p) => p.element_id !== 'ov-3').map((p) => p.kind === 'logo' ? { element_id: p.element_id, logo_similarity: 0.9 } : { element_id: p.element_id, ocr_text: p.expected }));
  assert(!bad.passed);
  assertEquals(bad.items.find((i) => i.element_id === 'ov-3')!.status, 'not_checkable');
  const wrong = judgeFrames(5, probes, probes.map((p) => ({ element_id: p.element_id, ocr_text: 'xyz', logo_similarity: 0.2 })));
  assertEquals(wrong.items.filter((i) => i.status === 'not_visible').length, 4);
  assertEquals(textCoverage('Café Buur', 'CAFE BUUR'), 1);
});

Deno.test('AI QA parsing is strict', () => {
  assertEquals(parseSpotQa('noise {"score":6,"verdict":"needs_work","issues":[{"category":"visual","severity":"high","at_s":4,"detail":"x"}]}').issues.length, 1);
  assertThrows(() => parseSpotQa('no json'));
  assertThrows(() => parseSpotQa('{"score":42}'));
});

Deno.test('technical acceptance and customer-ready stay separate', () => {
  const v = { export_status: 'done', export_revision: 3, edit_revision: 3, technical_check: { revision: 3, passed: true, items: [] }, frame_check: { revision: 3, passed: true, items: [] }, final_ai_qa: { revision: 3, verdict: 'pass' }, content_check: { revision: 3, passed: true } };
  assertEquals(technicalAcceptance(v).status, 'passed');
  const r = customerReady(v, [{ visual_client_ready: false }, { visual_client_ready: true }]);
  assert(!r.ready); assertEquals(r.reasons, ['SHOTS_NOT_VISUALLY_READY:1']);
  assertEquals(technicalAcceptance({ ...v, frame_check: null }).status, 'pending');
  assertEquals(technicalAcceptance({ ...v, edit_revision: 4 }).status, 'pending');
});

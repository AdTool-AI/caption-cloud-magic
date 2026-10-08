import { assert, assertEquals, assertNotEquals } from 'jsr:@std/assert@1';
import { activeCutSeconds, planShotSave, routingFingerprint, type ExistingShot, type ShotPlanFields } from './shotPersistence.ts';
import { explainExclusions, assessRisk } from './routing.ts';

const base = (i: number, desc = `shot ${i}`): ShotPlanFields => ({
  start_s: (i - 1) * 5, end_s: i * 5, purpose: 'p', shot_type: 'close', subject_emphasis: 'product',
  description: desc, on_screen_text: null, voiceover: `vo ${i}`, asset_id: null,
});
const existing = (n: number): ExistingShot[] => Array.from({ length: n }, (_, k) => {
  const f = { ...base(k + 1), english_prompt: `prompt ${k + 1}`, negative_constraints: ['no text'] };
  return { ...f, id: `id-${k + 1}`, shot_index: k + 1, routing_fingerprint: routingFingerprint(f), selected_model: 'wan-2.7-pro', attempt_count: 0, current_generation_id: null };
});

Deno.test('re-save identical plan keeps ids and routing, nothing stale', () => {
  const p = planShotSave(existing(6), Array.from({ length: 6 }, (_, k) => base(k + 1)));
  assertEquals(p.updates.map((u) => u.id), ['id-1', 'id-2', 'id-3', 'id-4', 'id-5', 'id-6']);
  assertEquals(p.updates.filter((u) => u.stale).length, 0);
  assertEquals(p.inserts.length + p.archive.length, 0);
});

Deno.test('separate (studio) voiceover change does not stale routing', () => {
  const inc = Array.from({ length: 6 }, (_, k) => ({ ...base(k + 1), voiceover: 'new' }));
  assertEquals(planShotSave(existing(6), inc).updates.filter((u) => u.stale).length, 0);
});

Deno.test('model-generated speech: spoken text and audio source are routing-relevant', () => {
  const s = { ...base(1), audio_source: 'model_speech' };
  assertNotEquals(routingFingerprint(s), routingFingerprint({ ...s, voiceover: 'other line' }));
  assertNotEquals(routingFingerprint(base(1)), routingFingerprint({ ...base(1), audio_source: 'provider' }));
  assertEquals(routingFingerprint(base(1)), routingFingerprint({ ...base(1), audio_source: 'studio', voiceover: 'x' }));
});

Deno.test('prompt, negative prompt, references and resolution change the fingerprint', () => {
  const f = { ...base(1), english_prompt: 'a', negative_constraints: ['x'] };
  const fp = routingFingerprint(f);
  assertNotEquals(fp, routingFingerprint({ ...f, english_prompt: 'b' }));
  assertNotEquals(fp, routingFingerprint({ ...f, negative_constraints: ['y'] }));
  assertNotEquals(fp, routingFingerprint({ ...f, asset_id: 'asset-1' }));
  assertNotEquals(fp, routingFingerprint({ ...f, reference_asset_ids: ['r1'] }));
  assertNotEquals(fp, routingFingerprint({ ...f, required_resolution: '1080p' }));
});

Deno.test('changing one shot marks only that shot stale (routing kept visible)', () => {
  const inc = Array.from({ length: 6 }, (_, k) => base(k + 1, k === 2 ? 'different action' : `shot ${k + 1}`));
  const p = planShotSave(existing(6), inc);
  assertEquals(p.updates.filter((u) => u.stale).map((u) => u.id), ['id-3']);
});

Deno.test('changed required resolution marks that shot stale', () => {
  const inc = Array.from({ length: 6 }, (_, k) => ({ ...base(k + 1), required_resolution: k === 0 ? '720p' : null }));
  assertEquals(planShotSave(existing(6), inc).updates.filter((u) => u.stale).map((u) => u.id), ['id-1']);
});

Deno.test('re-ordering with ids keeps each shot on its own row', () => {
  const ex = existing(3);
  // Shot "id-3" content moves to the first slot (same content, new timing).
  const inc: ShotPlanFields[] = [
    { ...base(3), id: 'id-3', start_s: 0, end_s: 5 },
    { ...base(1), id: 'id-1', start_s: 5, end_s: 10 },
    { ...base(2), id: 'id-2', start_s: 10, end_s: 15 },
  ];
  const p = planShotSave(ex, inc);
  assertEquals(p.updates.map((u) => [u.id, u.fields.description, u.matched_by]), [
    ['id-3', 'shot 3', 'id'], ['id-1', 'shot 1', 'id'], ['id-2', 'shot 2', 'id'],
  ]);
  assertEquals(p.inserts.length, 0);
});

Deno.test('id match beats index fallback; unknown ids are new shots', () => {
  const p = planShotSave(existing(2), [{ ...base(1), id: 'id-2' }, { ...base(2), id: 'foreign' }]);
  assertEquals(p.updates.map((u) => u.id), ['id-2']);
  assertEquals(p.inserts.length, 1);
  assertEquals(p.archive, ['id-1']);
});

Deno.test('surplus shots are archived, never deleted, and leave the 30 s sum', () => {
  const ex = existing(6); ex[5].attempt_count = 1;
  const p = planShotSave(ex, Array.from({ length: 4 }, (_, k) => base(k + 1)));
  assertEquals(p.archive, ['id-5', 'id-6']);
  const rows = ex.map((e) => ({ ...e, archived_at: p.archive.includes(e.id) ? 'now' : null }));
  assertEquals(activeCutSeconds(rows), 20);
});

Deno.test('exclusions explain long cuts', () => {
  const s = { ...base(1), start_s: 0, end_s: 25 } as never;
  const ex = explainExclusions(s, assessRisk(s), { aspectRatio: '9:16', mode: 't2v' });
  assert(ex.length > 0);
});

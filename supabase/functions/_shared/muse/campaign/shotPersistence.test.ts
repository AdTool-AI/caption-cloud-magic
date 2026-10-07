import { assert, assertEquals } from 'jsr:@std/assert@1';
import { planShotSave, routingFingerprint, type ExistingShot, type ShotPlanFields } from './shotPersistence.ts';
import { explainExclusions, assessRisk } from './routing.ts';

const base = (i: number, desc = `shot ${i}`): ShotPlanFields => ({
  start_s: (i - 1) * 5, end_s: i * 5, purpose: 'p', shot_type: 'close', subject_emphasis: 'product',
  description: desc, on_screen_text: null, voiceover: `vo ${i}`, asset_id: null,
});
const existing = (n: number): ExistingShot[] => Array.from({ length: n }, (_, k) => {
  const f = base(k + 1);
  return { ...f, id: `id-${k + 1}`, shot_index: k + 1, routing_fingerprint: routingFingerprint(f), selected_model: 'wan-2.7-pro', attempt_count: 0, current_generation_id: null };
});

Deno.test('re-save identical plan keeps ids and routing, nothing stale', () => {
  const p = planShotSave(existing(6), Array.from({ length: 6 }, (_, k) => base(k + 1)));
  assertEquals(p.updates.map((u) => u.id), ['id-1', 'id-2', 'id-3', 'id-4', 'id-5', 'id-6']);
  assertEquals(p.updates.filter((u) => u.stale).length, 0);
  assertEquals(p.inserts.length + p.deletes.length, 0);
});

Deno.test('voiceover-only change does not stale routing', () => {
  const inc = Array.from({ length: 6 }, (_, k) => ({ ...base(k + 1), voiceover: 'new' }));
  assertEquals(planShotSave(existing(6), inc).updates.filter((u) => u.stale).length, 0);
});

Deno.test('changing one shot marks only that shot stale', () => {
  const inc = Array.from({ length: 6 }, (_, k) => base(k + 1, k === 2 ? 'different action' : `shot ${k + 1}`));
  const p = planShotSave(existing(6), inc);
  assertEquals(p.updates.filter((u) => u.stale).map((u) => u.id), ['id-3']);
});

Deno.test('surplus shots: removed only without attempts', () => {
  const ex = existing(6); ex[5].attempt_count = 1;
  const p = planShotSave(ex, Array.from({ length: 4 }, (_, k) => base(k + 1)));
  assertEquals(p.deletes, ['id-5']);
  assertEquals(p.kept, ['id-6']);
});

Deno.test('exclusions explain long cuts', () => {
  const s = { ...base(1), start_s: 0, end_s: 25 } as never;
  const ex = explainExclusions(s, assessRisk(s), { aspectRatio: '9:16', mode: 't2v' });
  assert(ex.length > 0);
});

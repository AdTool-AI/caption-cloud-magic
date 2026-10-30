import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { resolveClipUrls, type EditClip } from './spot.ts';

const U = 'u1';
const clips: EditClip[] = Array.from({ length: 6 }, (_, i) => ({ shot_id: `s${i}`, attempt_id: `a${i}`, url: null, source_duration: 5, trim_in: 0, trim_out: 5 }));
const attempts = clips.map((c, i) => ({ id: c.attempt_id, shot_id: c.shot_id, user_id: U, generation_id: `g${i}` }));
const gens = () => new Map(attempts.map((a, i) => [a.generation_id, { id: a.generation_id, user_id: U, status: 'completed', video_url: `https://x/${U}/${i}.mp4` }]));

Deno.test('six completed attempts → six URLs, timing/order unchanged', () => {
  const r = resolveClipUrls(clips, attempts, gens(), U);
  assert(r.ok);
  assertEquals(r.changed, 6);
  r.clips.forEach((c, i) => {
    assertEquals(c.url, `https://x/${U}/${i}.mp4`);
    assertEquals({ ...c, url: null }, clips[i]);
  });
});

Deno.test('missing generation URL → explicit error, nothing applied', () => {
  const g = gens(); g.get('g2')!.video_url = null;
  const r = resolveClipUrls(clips, attempts, g, U);
  assert(!r.ok);
  assertEquals(r.errors, [{ shot_id: 's2', attempt_id: 'a2', code: 'CLIP_URL_MISSING' }]);
});

Deno.test('non-completed generation → error', () => {
  const g = gens(); g.get('g1')!.status = 'processing';
  assert(!resolveClipUrls(clips, attempts, g, U).ok);
});

Deno.test('wrong-user attempt or generation rejected', () => {
  const att = attempts.map((a) => (a.id === 'a3' ? { ...a, user_id: 'other' } : a));
  const r = resolveClipUrls(clips, att, gens(), U);
  assert(!r.ok); assertEquals(r.errors[0].code, 'ATTEMPT_WRONG_USER');
  const g = gens(); g.get('g4')!.user_id = 'other';
  assert(!resolveClipUrls(clips, attempts, g, U).ok);
});

Deno.test('attempt of another shot rejected', () => {
  const att = attempts.map((a) => (a.id === 'a0' ? { ...a, shot_id: 's5' } : a));
  const r = resolveClipUrls(clips, att, gens(), U);
  assert(!r.ok); assertEquals(r.errors[0].code, 'ATTEMPT_WRONG_SHOT');
});

Deno.test('already-correct URLs → no change; client URL ignored', () => {
  const r1 = resolveClipUrls(clips, attempts, gens(), U); assert(r1.ok);
  const r2 = resolveClipUrls(r1.clips, attempts, gens(), U); assert(r2.ok); assertEquals(r2.changed, 0);
  const forged = clips.map((c) => ({ ...c, url: 'https://evil/x.mp4' }));
  const r3 = resolveClipUrls(forged, attempts, gens(), U); assert(r3.ok);
  assert(r3.clips.every((c) => c.url!.startsWith('https://x/')));
});

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { buildRenderPayload, defaultEdit, overlayDuplicatesEndcard, validateEdit, type SpotEdit } from './spot.ts';

const clips = Array.from({ length: 6 }, (_, i) => ({
  shot_id: `shot-${i}-aaaaaaaa`, attempt_id: `a${i}`, url: `https://x/c${i}.mp4`,
  trim_in: 0, trim_out: 5, source_duration: 5,
})) as unknown as SpotEdit['clips'];

Deno.test('every scene plays its own clip from its trim point, inside the clip', () => {
  const e = defaultEdit({ post_production: {} }, clips, 30);
  const p = buildRenderPayload(e, 1) as any;
  assertEquals(p.scenes.length, 6);
  p.scenes.forEach((s: any, i: number) => {
    assertEquals(s.additional_media.type, 'video');
    assertEquals(s.additional_media.url, `https://x/c${i}.mp4`);
    assertEquals(s.playback_rate, 1);
    assertEquals(s.start_time, i * 5);
    assertEquals(s.end_time, i * 5 + 5);
    assertEquals(s.media_source_start, 0);
    assertEquals(s.media_source_end, 5);
    assert(s.media_source_end <= s.additional_media.duration);
  });
});

Deno.test('address/hours overlay is dropped when the endcard already says it', () => {
  const pp = { cta_text: 'Komm vorbei – Friedrichstraße 120, täglich 9–18 Uhr!', brand_name_overlay: 'Café Buur', overlay_text: ['Café Buur', 'Foodporn Pancake', 'Friedrichstraße 120 – täglich 9–18 Uhr'] };
  assert(overlayDuplicatesEndcard('Friedrichstraße 120 – täglich 9–18 Uhr', { cta: pp.cta_text }));
  assert(!overlayDuplicatesEndcard('Foodporn Pancake', { cta: pp.cta_text }));
  const e = defaultEdit({ post_production: pp }, clips, 30);
  assertEquals(e.overlays.map((o) => o.text), ['Café Buur', 'Foodporn Pancake']);
  const withDup = { ...e, overlays: [...e.overlays, { id: 'x', text: pp.overlay_text[2], start: 25, end: 30, role: 'text' as const }] };
  const issues = validateEdit(withDup, { voiceover: false, music: false, sfx: false, subtitles: false, logo: false, endcard: true });
  assert(issues.some((i) => i.code === 'OVERLAY_DUPLICATES_ENDCARD' && !i.blocking));
});

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { buildClips, buildRenderPayload, defaultEdit, deriveStage, musicSegments, scanMp4Tracks, technicalCheck, totalCut, validateEdit, type SpotEdit } from './spot.ts';

const shots = [1, 2, 3, 4, 5, 6].map((i) => ({ id: `s${i}`, shot_index: i, cut_duration_s: [4, 5, 5, 5, 6, 5][i - 1], generation_duration_s: i === 5 ? 10 : 5, current_generation_id: `g${i}` }));
const attempts = shots.flatMap((s) => [{ id: `a${s.shot_index}`, shot_id: s.id, attempt_no: 1, generation_id: `g${s.shot_index}` }]);
attempts.push({ id: 'a2b', shot_id: 's2', attempt_no: 2, generation_id: 'g2b' });
const gens = new Map(Object.entries({ ...Object.fromEntries(shots.map((s) => [`g${s.shot_index}`, { video_url: `https://x/${s.id}.mp4`, duration_seconds: s.generation_duration_s }])), g2b: { video_url: 'https://x/s2b.mp4', duration_seconds: 5 } }));
const req = { voiceover: true, music: true, sfx: true, subtitles: true, logo: true, endcard: true };

function fullEdit(): SpotEdit {
  const e = defaultEdit({ post_production: { cta_text: 'Jetzt testen', brand_name_overlay: 'CORDIAL' } }, buildClips(shots, attempts, gens), 30);
  e.voiceover = { url: 'https://x/vo.mp3', start: 0.5, duration: 27, volume: 1, source: 'generated' };
  e.music = { url: 'https://x/m.mp3', start: 0, duration: 30, volume: 0.6, duck: 0.3 };
  e.sfx = [{ url: 'https://x/sfx.mp3', start: 1, duration: 1, volume: 0.8 }];
  e.subtitles = { from_voiceover_url: 'https://x/vo.mp3', segments: [{ start: 0.5, end: 3, text: 'Hallo' }] };
  e.logo = { url: 'https://x/logo.svg', source: 'campaign_asset', rights_confirmed: true };
  return e;
}

Deno.test('cut keeps shot order, uses current attempt, 30 s from cut durations (not generation length)', () => {
  const clips = buildClips(shots, attempts, gens);
  assertEquals(clips.map((c) => c.shot_id), ['s1', 's2', 's3', 's4', 's5', 's6']);
  assertEquals(clips[4].trim_out, 6); // 10 s generated, 6 s used
  assertEquals(totalCut({ clips } as SpotEdit), 30);
});

Deno.test('selecting another attempt swaps only that clip, keeps order and trims', () => {
  const first = buildClips(shots, attempts, gens);
  const reordered = [first[1], first[0], ...first.slice(2)].map((c) => (c.shot_id === 's3' ? { ...c, trim_in: 0.5, trim_out: 5 } : c));
  const next = buildClips(shots.map((s) => (s.id === 's2' ? { ...s, selected_attempt_id: 'a2b' } : s)), attempts, gens, reordered);
  assertEquals(next.map((c) => c.shot_id).slice(0, 2), ['s2', 's1']);
  assertEquals(next[0].url, 'https://x/s2b.mp4');
  assertEquals(next[2].trim_in, 0.5);
});

Deno.test('archived shot drops out of the cut', () => {
  const clips = buildClips(shots.map((s) => (s.id === 's6' ? { ...s, archived_at: 'x' } : s)), attempts, gens);
  assertEquals(clips.length, 5);
});

Deno.test('validation blocks missing layers, stale subtitles, missing logo', () => {
  const e = defaultEdit({}, buildClips(shots, attempts, gens), 30);
  const codes = validateEdit(e, req).map((i) => i.code);
  for (const c of ['VOICEOVER_MISSING', 'MUSIC_MISSING', 'SFX_MISSING', 'SUBTITLES_MISSING', 'LOGO_MISSING', 'ENDCARD_MISSING']) assert(codes.includes(c), c);
  const f = fullEdit();
  assertEquals(validateEdit(f, req).filter((i) => i.blocking), []);
  f.voiceover = { ...f.voiceover!, url: 'https://x/upload.mp3', source: 'upload' };
  assert(validateEdit(f, req).some((i) => i.code === 'SUBTITLES_STALE'));
});

Deno.test('stage ladder: export_done ≠ final_checked; any edit makes export stale', () => {
  const v = { edit: fullEdit(), edit_revision: 3, post_production: { voiceover_required: true, music_direction: 'x', sfx_direction: 'x', subtitles_required: true, cta_text: 'Jetzt testen' } };
  assertEquals(deriveStage(v, shots, attempts).stage, 'cut_done');
  const exported = { ...v, export_status: 'done', export_url: 'u', export_revision: 3 };
  assertEquals(deriveStage(exported, shots, attempts).stage, 'export_done');
  const tech = { ...exported, technical_check: { revision: 3, passed: true } };
  assertEquals(deriveStage(tech, shots, attempts).stage, 'export_done');
  assertEquals(deriveStage({ ...tech, content_check: { revision: 3, passed: true } }, shots, attempts).stage, 'final_checked');
  const edited = { ...tech, content_check: { revision: 3, passed: true }, edit_revision: 4 };
  const st = deriveStage(edited, shots, attempts);
  assertEquals(st.stage, 'cut_done');
  assert(st.export_stale);
  assertEquals(deriveStage({ ...v, edit: null }, shots.map((s) => ({ ...s, current_generation_id: null })), []).stage, 'planning_done');
});

Deno.test('render payload: per-shot media trims, voiceover/sfx tracks, ducked music, logo + endcard', () => {
  const p = buildRenderPayload(fullEdit(), 7);
  assertEquals(p.duration_seconds, 30);
  assertEquals(p.scenes[4].media_source_end, 6);
  assertEquals(p.scenes[1].start_time, 4);
  assertEquals(p.scenes[0].source_mode, 'media');
  const music = p.audio_tracks.find((t) => t.type === 'background-music')!;
  assertEquals(music.clips.map((c: { volume: number }) => c.volume), [100, 30, 100]);
  assert(p.text_overlays.some((o) => o.kind === 'logo' && o.slots.imageUrl));
  assert(p.text_overlays.some((o) => o.id === 'endcard' && o.startTime === 27));
  assertEquals(p.export_settings.aspect_ratio, '9:16');
  assertEquals(p.subtitle_track!.clips.length, 1);
});

Deno.test('music without voiceover is one full-volume clip', () => {
  const e = fullEdit(); e.voiceover = null;
  assertEquals(musicSegments(e, 30).length, 1);
});

function box(type: string, payload: Uint8Array) {
  const out = new Uint8Array(8 + payload.length);
  new DataView(out.buffer).setUint32(0, out.length);
  out.set(new TextEncoder().encode(type), 4); out.set(payload, 8); return out;
}
const hdlr = (h: string) => box('hdlr', new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0, ...new TextEncoder().encode(h), 0, 0, 0, 0]));

Deno.test('technical check: needs both tracks, 9:16 1080×1920, 30 s; audio track ≠ audible voiceover', () => {
  const e = fullEdit();
  const both = scanMp4Tracks(box('moov', new Uint8Array([...hdlr('vide'), ...hdlr('soun')])));
  assertEquals(both, { video: true, audio: true, moov: true });
  const ok = technicalCheck(e, 1, { width: 1080, height: 1920, duration: 30, content_type: 'video/mp4', bytes: 5e6, tracks: both });
  assert(ok.passed, JSON.stringify(ok.items));
  assert(ok.items.find((i) => i.key === 'audio_track')!.detail.includes('does not prove'));
  const silent = technicalCheck(e, 1, { width: 1080, height: 1920, duration: 30, content_type: 'video/mp4', bytes: 5e6, tracks: scanMp4Tracks(box('moov', hdlr('vide'))) });
  assert(!silent.passed);
  const wrong = technicalCheck(e, 1, { width: 1920, height: 1080, duration: 31, content_type: 'video/mp4', bytes: 5e6, tracks: both });
  assert(!wrong.passed);
  const unknown = technicalCheck(e, 1, { width: null, height: null, duration: null, content_type: null, bytes: null, tracks: null });
  assert(!unknown.passed && unknown.unknown.length > 0);
});

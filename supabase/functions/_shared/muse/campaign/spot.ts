/**
 * Spot assembly (Stage 1): pure logic that turns a campaign video's selected
 * shot attempts + audio/text layers into one cut, a render payload for the
 * existing Director's Cut renderer, and a two-part final check.
 * No I/O here — runtime lives in spotRuntime.ts.
 */

export type SpotStage = 'planning_done' | 'clips_done' | 'cut_done' | 'export_done' | 'final_checked';

export interface EditClip {
  shot_id: string;
  attempt_id: string | null;
  url: string | null;
  /** Length of the generated file (seconds). */
  source_duration: number;
  trim_in: number;
  trim_out: number;
}

export interface AudioClip { url: string; start: number; duration: number; volume: number; label?: string }

export interface SpotEdit {
  aspect: '9:16' | '16:9' | '1:1';
  target_duration: number;
  clips: EditClip[];
  voiceover: (AudioClip & { source: 'generated' | 'upload'; script?: string; language?: string }) | null;
  music: (AudioClip & { duck: number }) | null;
  sfx: AudioClip[];
  subtitles: { from_voiceover_url: string; segments: { start: number; end: number; text: string }[] } | null;
  overlays: { id: string; text: string; start: number; end: number; role: 'text' | 'product_name' | 'cta' }[];
  logo: { url: string; source: 'campaign_asset' | 'upload'; rights_confirmed: boolean } | null;
  endcard: { headline: string; cta: string; duration: number } | null;
}

export const DEFAULT_DUCK = 0.35;

// deno-lint-ignore no-explicit-any
type Row = Record<string, any>;

const round = (n: number) => Math.round(n * 1000) / 1000;
export const cutLength = (c: EditClip) => Math.max(0, round(c.trim_out - c.trim_in));
export const totalCut = (e: SpotEdit) => round(e.clips.reduce((s, c) => s + cutLength(c), 0));

/** Pick the attempt that goes into the cut: explicit selection, else the current generation. Never invents one. */
export function pickAttempt(shot: Row, attempts: Row[]): Row | null {
  const mine = attempts.filter((a) => a.shot_id === shot.id);
  if (shot.selected_attempt_id) return mine.find((a) => a.id === shot.selected_attempt_id) ?? null;
  return mine.find((a) => a.generation_id && a.generation_id === shot.current_generation_id)
    ?? [...mine].sort((a, b) => (b.attempt_no ?? 0) - (a.attempt_no ?? 0))[0] ?? null;
}

/**
 * Build (or refresh) the cut from shots. Existing trims and order are kept for
 * shots that are still present; a changed attempt keeps the trim if it still fits.
 * `genById` maps generation id → { video_url, duration }.
 */
export function buildClips(shots: Row[], attempts: Row[], genById: Map<string, Row>, existing: EditClip[] = []): EditClip[] {
  const active = shots.filter((s) => !s.archived_at);
  const prev = new Map(existing.map((c) => [c.shot_id, c]));
  const order = [
    ...existing.map((c) => c.shot_id).filter((id) => active.some((s) => s.id === id)),
    ...active.filter((s) => !prev.has(s.id)).sort((a, b) => a.shot_index - b.shot_index).map((s) => s.id),
  ];
  return order.map((id) => {
    const shot = active.find((s) => s.id === id)!;
    const att = pickAttempt(shot, attempts);
    const gen = att?.generation_id ? genById.get(att.generation_id) : undefined;
    const srcDur = Number(gen?.duration_seconds ?? gen?.duration ?? shot.generation_duration_s ?? shot.duration_s ?? 0);
    const cut = Number(shot.cut_duration_s ?? shot.duration_s ?? srcDur);
    const old = prev.get(id);
    let trim_in = 0, trim_out = Math.min(cut, srcDur || cut);
    if (old && old.trim_out <= (srcDur || old.trim_out)) { trim_in = old.trim_in; trim_out = old.trim_out; }
    return { shot_id: id, attempt_id: att?.id ?? null, url: gen?.video_url ?? null, source_duration: srcDur, trim_in, trim_out };
  });
}

export function defaultEdit(video: Row, clips: EditClip[], targetDuration: number): SpotEdit {
  const pp = video.post_production ?? {};
  return {
    aspect: '9:16', target_duration: targetDuration, clips,
    voiceover: null, music: null, sfx: [], subtitles: null,
    overlays: (pp.overlay_text ?? []).map((t: string, i: number) => ({ id: `ov-${i}`, text: t, start: 0, end: 2, role: 'text' as const })),
    logo: null,
    endcard: pp.cta_text ? { headline: pp.brand_name_overlay ?? '', cta: pp.cta_text, duration: 3 } : null,
  };
}

export interface Issue { code: string; detail: string; blocking: boolean }

/** What still stands between the cut and an exportable, complete spot. */
export function validateEdit(e: SpotEdit, req: { voiceover: boolean; music: boolean; sfx: boolean; subtitles: boolean; logo: boolean; endcard: boolean }): Issue[] {
  const out: Issue[] = [];
  const add = (code: string, detail: string, blocking = true) => out.push({ code, detail, blocking });
  if (!e.clips.length) add('NO_CLIPS', 'No shots in the cut.');
  e.clips.forEach((c, i) => {
    if (!c.url) add('CLIP_MISSING', `Shot ${i + 1} has no finished clip.`);
    if (c.trim_in < 0 || c.trim_out <= c.trim_in) add('TRIM_INVALID', `Shot ${i + 1} trim ${c.trim_in}–${c.trim_out}s is invalid.`);
    if (c.source_duration && c.trim_out > c.source_duration + 0.05) add('TRIM_BEYOND_SOURCE', `Shot ${i + 1} trim ends at ${c.trim_out}s but the clip is ${c.source_duration}s.`);
  });
  const total = totalCut(e);
  if (Math.abs(total - e.target_duration) > 0.05) add('DURATION_MISMATCH', `Cut is ${total}s, target ${e.target_duration}s.`);
  if (req.voiceover && !e.voiceover) add('VOICEOVER_MISSING', 'Voiceover required.');
  if (e.voiceover && e.voiceover.start + e.voiceover.duration > total + 0.05) add('VOICEOVER_TOO_LONG', `Voiceover ends at ${round(e.voiceover.start + e.voiceover.duration)}s, cut is ${total}s.`);
  if (req.music && !e.music) add('MUSIC_MISSING', 'Background music required.');
  if (req.sfx && !e.sfx.length) add('SFX_MISSING', 'Sound effects required.');
  if (req.subtitles) {
    if (!e.subtitles) add('SUBTITLES_MISSING', 'Subtitles required.');
    else if (!e.voiceover || e.subtitles.from_voiceover_url !== e.voiceover.url) add('SUBTITLES_STALE', 'Subtitles were not made from the current voiceover.');
  }
  if (e.subtitles?.segments.some((s) => s.end > total + 0.05 || s.start < 0 || s.end <= s.start)) add('SUBTITLE_TIMING', 'A subtitle lies outside the cut.');
  if (e.overlays.some((o) => o.end > total + 0.05 || o.end <= o.start)) add('OVERLAY_TIMING', 'A text overlay lies outside the cut.');
  if (req.logo && !e.logo) add('LOGO_MISSING', 'Original logo file required — no substitute is generated.');
  if (e.logo && !e.logo.rights_confirmed) add('LOGO_RIGHTS', 'Usage rights for the logo are not confirmed.');
  if (req.endcard && !e.endcard) add('ENDCARD_MISSING', 'Endcard required.');
  if (e.endcard && e.endcard.duration > total) add('ENDCARD_TOO_LONG', 'Endcard is longer than the cut.');
  return out;
}

export function requirementsFrom(pp: Row | null | undefined) {
  const p = pp ?? {};
  return {
    voiceover: !!p.voiceover_required,
    music: !!p.music_direction,
    sfx: !!p.sfx_direction,
    subtitles: !!p.subtitles_required,
    logo: !!(p.brand_name_overlay || p.cta_text),
    endcard: !!p.cta_text,
  };
}

/** Status ladder — "done" only when every required layer, the export and both checks exist for the current revision. */
export function deriveStage(video: Row, shots: Row[], attempts: Row[]): { stage: SpotStage; export_stale: boolean; missing: string[] } {
  const active = shots.filter((s) => !s.archived_at);
  const missing: string[] = [];
  const clipsReady = active.length > 0 && active.every((s) => { const a = pickAttempt(s, attempts); return !!a?.generation_id; });
  if (!clipsReady) { missing.push('clips'); return { stage: 'planning_done', export_stale: false, missing }; }
  const edit: SpotEdit | null = video.edit ?? null;
  const issues = edit ? validateEdit(edit, requirementsFrom(video.post_production)).filter((i) => i.blocking) : [{ code: 'NO_CUT' }];
  if (issues.length) { missing.push(...issues.map((i) => i.code)); return { stage: 'clips_done', export_stale: false, missing }; }
  const exported = video.export_status === 'done' && !!video.export_url;
  const stale = exported && video.export_revision !== video.edit_revision;
  if (!exported || stale) { missing.push(stale ? 'EXPORT_STALE' : 'EXPORT'); return { stage: 'cut_done', export_stale: stale, missing }; }
  const tech = video.technical_check?.revision === video.edit_revision && video.technical_check?.passed === true;
  const content = video.content_check?.revision === video.edit_revision && video.content_check?.passed === true;
  if (!tech) missing.push('TECHNICAL_CHECK');
  if (!content) missing.push('CONTENT_CHECK');
  return { stage: tech && content ? 'final_checked' : 'export_done', export_stale: false, missing };
}

/** Payload for the existing render-directors-cut function (snake_case contract). */
export function buildRenderPayload(e: SpotEdit, revision: number) {
  let t = 0;
  const scenes = e.clips.map((c, i) => {
    const len = cutLength(c);
    const s = {
      id: `shot-${i + 1}-${c.shot_id.slice(0, 8)}`,
      start_time: round(t), end_time: round(t + len),
      original_start_time: round(t), original_end_time: round(t + len),
      media_source_start: c.trim_in, media_source_end: c.trim_out,
      playback_rate: 1,
      additional_media: { type: 'video', url: c.url, duration: c.source_duration },
      source_mode: 'media', is_from_original_video: false,
    };
    t += len;
    return s;
  });
  const total = round(t);
  const tracks: Row[] = [];
  if (e.voiceover) tracks.push({ id: 'vo', type: 'voiceover', volume: e.voiceover.volume, clips: [{ id: 'vo-1', url: e.voiceover.url, startTime: e.voiceover.start, duration: e.voiceover.duration }] });
  if (e.music) tracks.push({ id: 'music', type: 'background-music', volume: e.music.volume, clips: [{ id: 'music-1', url: e.music.url, startTime: 0, duration: total, fadeOut: 1 }] });
  if (e.sfx.length) tracks.push({ id: 'sfx', type: 'sound-effect', volume: 1, clips: e.sfx.map((s, i) => ({ id: `sfx-${i + 1}`, url: s.url, startTime: s.start, duration: s.duration, volume: s.volume })) });
  const overlays: Row[] = e.overlays.map((o) => ({ id: o.id, text: o.text, startTime: o.start, endTime: o.end, position: o.role === 'cta' ? 'bottom' : 'top', kind: 'text' }));
  if (e.endcard) {
    overlays.push({ id: 'endcard', text: [e.endcard.headline, e.endcard.cta].filter(Boolean).join('\n'), startTime: round(total - e.endcard.duration), endTime: total, position: 'center', kind: 'text' });
  }
  if (e.logo) overlays.push({ id: 'logo', kind: 'image', imageUrl: e.logo.url, startTime: e.endcard ? round(total - e.endcard.duration) : 0, endTime: total, position: 'center' });
  return {
    source_video_url: e.clips[0]?.url,
    duration_seconds: total,
    scenes,
    transitions: [],
    audio_tracks: tracks,
    audio_settings: { music_duck_factor: e.music?.duck ?? DEFAULT_DUCK },
    subtitle_track: e.subtitles ? { visible: true, clips: e.subtitles.segments.map((s, i) => ({ id: `sub-${i + 1}`, text: s.text, startTime: s.start, endTime: s.end })) } : undefined,
    text_overlays: overlays,
    export_settings: { aspect_ratio: e.aspect, quality: 'hd', format: 'mp4' },
    spot_revision: revision,
  };
}

/** Scan an MP4 buffer for track handler boxes. Proves the container lists the tracks — not that they decode or are audible. */
export function scanMp4Tracks(bytes: Uint8Array): { video: boolean; audio: boolean; moov: boolean } {
  const find = (s: string) => {
    const a = s.charCodeAt(0), b = s.charCodeAt(1), c = s.charCodeAt(2), d = s.charCodeAt(3);
    for (let i = 0; i + 3 < bytes.length; i++) if (bytes[i] === a && bytes[i + 1] === b && bytes[i + 2] === c && bytes[i + 3] === d) return i;
    return -1;
  };
  const moov = find('moov') >= 0;
  let video = false, audio = false;
  for (let i = 0; i + 12 < bytes.length; i++) {
    if (bytes[i] === 0x68 && bytes[i + 1] === 0x64 && bytes[i + 2] === 0x6c && bytes[i + 3] === 0x72) { // 'hdlr'
      const h = String.fromCharCode(bytes[i + 12], bytes[i + 13], bytes[i + 14], bytes[i + 15]);
      if (h === 'vide') video = true;
      if (h === 'soun') audio = true;
    }
  }
  return { video, audio, moov };
}

export interface TechCheckInput {
  width: number | null; height: number | null; duration: number | null;
  content_type: string | null; bytes: number | null;
  tracks: { video: boolean; audio: boolean; moov: boolean } | null;
}

/** Technical check only. Content (audible, correct German voiceover, readable texts) is a separate, human/QA check. */
export function technicalCheck(e: SpotEdit, revision: number, m: TechCheckInput) {
  const items: { key: string; ok: boolean | null; detail: string }[] = [];
  const total = totalCut(e);
  items.push({ key: 'duration', ok: m.duration == null ? null : Math.abs(m.duration - e.target_duration) <= 0.1, detail: `${m.duration ?? '?'}s vs ${e.target_duration}s` });
  const portrait = e.aspect === '9:16';
  items.push({ key: 'aspect', ok: m.width && m.height ? (portrait ? m.height > m.width && Math.abs(m.width / m.height - 9 / 16) < 0.01 : true) : null, detail: `${m.width ?? '?'}×${m.height ?? '?'}` });
  items.push({ key: 'resolution', ok: m.width && m.height ? Math.min(m.width, m.height) >= 1080 : null, detail: `${m.width ?? '?'}×${m.height ?? '?'}` });
  items.push({ key: 'container', ok: m.content_type ? /mp4|octet-stream/.test(m.content_type) && (m.bytes ?? 0) > 10_000 : null, detail: `${m.content_type ?? '?'} · ${m.bytes ?? '?'} bytes` });
  items.push({ key: 'video_track', ok: m.tracks ? m.tracks.video : null, detail: 'listed in container (decode not verified)' });
  const needAudio = !!(e.voiceover || e.music || e.sfx.length);
  items.push({ key: 'audio_track', ok: m.tracks ? (needAudio ? m.tracks.audio : true) : null, detail: 'listed in container — does not prove audible or correct voiceover' });
  const reqTexts = [...e.overlays.map((o) => o.text), ...(e.endcard ? [e.endcard.cta] : [])].filter(Boolean);
  items.push({ key: 'required_texts', ok: reqTexts.length === 0 || e.overlays.every((o) => o.end <= total + 0.05) && (!e.endcard || e.endcard.duration <= total), detail: `${reqTexts.length} texts in render payload, timed inside the cut (on-screen legibility not verified)` });
  if (e.subtitles && e.voiceover) {
    const s = e.subtitles.segments;
    const inVo = s.every((x) => x.start >= e.voiceover!.start - 0.1 && x.end <= e.voiceover!.start + e.voiceover!.duration + 0.1);
    items.push({ key: 'subtitle_timing', ok: inVo && e.subtitles.from_voiceover_url === e.voiceover.url, detail: `${s.length} segments within the voiceover span` });
  }
  const unknown = items.filter((i) => i.ok === null).map((i) => i.key);
  return { revision, passed: items.every((i) => i.ok === true), unknown, items, checked_at: new Date().toISOString() };
}

/** Cost documentation per step. Internal = provider cost to the platform; user = current price rule (unchanged). */
export function costDoc(kind: 'voiceover' | 'music' | 'sfx' | 'subtitles' | 'export', p: Row = {}) {
  switch (kind) {
    case 'voiceover': return { provider: 'ElevenLabs TTS', internal: 'unknown (character-based, not metered in code)', user_price: 'no wallet charge today', chars: String(p.text ?? '').length };
    case 'subtitles': return { provider: 'ElevenLabs Scribe STT', internal: 'unknown (per audio minute, not metered in code)', user_price: 'no wallet charge today' };
    case 'music': {
      const table: Record<string, string> = { 'stable-audio-25': '0.55 USD flat', 'minimax-15': '0.30 USD flat', 'elevenlabs-music-v2': '0.023 USD/s', 'lyria-3-pro': '0.42 USD flat' };
      return { provider: `Replicate · ${p.tier ?? 'default'}`, internal: table[p.tier] ?? 'see generate-music-track engine table', user_price: 'wallet charge by generate-music-track (existing rule)' };
    }
    case 'sfx': return { provider: 'ElevenLabs Sound Generation', internal: 'unknown', user_price: '5 credits per clip (existing generate-scene-sfx rule)' };
    case 'export': return { provider: 'AWS Remotion Lambda', internal: 'unknown (Lambda GB-seconds + S3, not metered per render)', user_price: 'free since v428' };
  }
}

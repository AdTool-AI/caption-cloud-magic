/**
 * Post-production requirements (pure). Phase B decides only visual readiness;
 * voiceover, music/SFX, brand text, CTA and subtitles are recorded here so the
 * composition phase can consume them without reconstructing creative intent.
 */

export type AudioDecision = 'native_useful' | 'separate_sound_design' | 'silent_until_composition';
export type VoiceoverSource = 'native_model_verified' | 'deferred_tts_phase_c';

export interface PostProduction {
  visual_client_ready: boolean;
  composite_text_later: boolean;
  overlay_text: string[];
  brand_name_overlay: string | null;
  cta_text: string | null;
  subtitles_required: boolean;
  audio_required: boolean;
  audio_decision: AudioDecision;
  native_audio_preferred: boolean;
  voiceover_required: boolean;
  voiceover_language: string | null;
  voiceover_script: string | null;
  voiceover_source: VoiceoverSource | null;
  music_direction: string | null;
  sfx_direction: string | null;
}

/** Models whose native German speech has been verified. None so far. */
export const NATIVE_GERMAN_SPEECH_VERIFIED = new Set<string>();

interface VideoScript {
  cta?: string;
  voiceover?: string;
  on_screen_text?: string[];
  music_direction?: string;
  sound_direction?: string;
}

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/** Picks the sound-direction parts that match what happens in the shot. */
export function sfxForShot(soundDirection: string | undefined, description: string): string | null {
  if (!soundDirection) return null;
  const parts = soundDirection.split(/[,;]/).map((p) => p.trim()).filter(Boolean);
  const d = description.toLowerCase();
  const keys: Record<string, string[]> = {
    sizzle: ['sizzl', 'pan', 'sucuk', 'oil'], crack: ['egg', 'crack'], pour: ['pour', 'coffee', 'drink'],
    ambience: [], bite: ['bite', 'eat'],
  };
  const hits = parts.filter((p) => {
    const pl = p.toLowerCase();
    return Object.entries(keys).some(([k, words]) => pl.includes(k) && words.some((w) => d.includes(w)));
  });
  const ambience = parts.find((p) => /ambien/i.test(p));
  return [...hits, ...(ambience && !hits.includes(ambience) ? [ambience] : [])].join(', ') || null;
}

/**
 * Deterministic text assignment: the CTA goes on the last shot together with the
 * brand name; remaining on-screen lines go to the earlier shots in order.
 */
export function overlayForShot(script: VideoScript, shotIndex: number, shotCount: number, ctaFallback?: string | null): { overlay: string[]; cta: string | null; brand: boolean } {
  const cta = script.cta ?? ctaFallback ?? null;
  const lines = (script.on_screen_text ?? []).filter((l) => !cta || norm(l) !== norm(cta));
  const isLast = shotIndex === shotCount;
  if (isLast) return { overlay: [], cta, brand: true };
  const line = lines[shotIndex - 1];
  return { overlay: line ? [line] : [], cta: null, brand: false };
}

export function buildPostProduction(input: {
  script: VideoScript | null;
  ctaFallback?: string | null;
  company: string;
  shot: { shot_index: number; description: string; on_screen_text?: string | null; client_ready?: boolean | null };
  shotCount: number;
  model: string;
  textFailure: boolean;
}): PostProduction {
  const script = input.script ?? {};
  const { overlay, cta, brand } = overlayForShot(script, input.shot.shot_index, input.shotCount, input.ctaFallback);
  const shotText = input.shot.on_screen_text?.trim();
  const overlayText = [...overlay];
  if (shotText && !overlayText.some((t) => norm(t) === norm(shotText)) && (!cta || norm(shotText) !== norm(cta))) overlayText.push(shotText);
  const voiceover = script.voiceover?.trim() || null;
  const voiceoverRequired = !!voiceover;
  const nativeGerman = NATIVE_GERMAN_SPEECH_VERIFIED.has(input.model);
  const sfx = sfxForShot(script.sound_direction, input.shot.description);
  // Native model audio is never assumed suitable: with a voiceover and a music bed
  // planned, shot sound comes from separate sound design (or stays silent).
  const audioDecision: AudioDecision = voiceoverRequired || script.music_direction
    ? (sfx && !/^soft caf/i.test(sfx) ? 'separate_sound_design' : 'silent_until_composition')
    : 'separate_sound_design';
  return {
    visual_client_ready: !!input.shot.client_ready,
    composite_text_later: overlayText.length > 0 || !!cta || brand || input.textFailure,
    overlay_text: overlayText,
    brand_name_overlay: brand ? input.company : null,
    cta_text: cta,
    subtitles_required: voiceoverRequired,
    audio_required: voiceoverRequired || !!script.music_direction || !!sfx,
    audio_decision: audioDecision,
    native_audio_preferred: false,
    voiceover_required: voiceoverRequired,
    voiceover_language: voiceoverRequired ? 'de' : null,
    voiceover_script: voiceover,
    voiceover_source: voiceoverRequired ? (nativeGerman ? 'native_model_verified' : 'deferred_tts_phase_c') : null,
    music_direction: script.music_direction ?? null,
    sfx_direction: sfx,
  };
}

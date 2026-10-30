/** Lyrics-free MiniMax structure: section tags only, no sung words. */
export const INSTRUMENTAL_STRUCTURE = '[Intro]\n[Inst]\n[Inst]\n[Outro]';

/** Pure request validation; returns an error code or null. */
export function lyricsRequirementError(requiresLyrics: boolean, mode: string | undefined, lyrics: string | undefined): string | null {
  if (mode === 'instrumental') return null;
  if (requiresLyrics && (!lyrics || lyrics.trim().length < 10)) return 'MISSING_LYRICS';
  return null;
}

/** Pure: MiniMax input for instrumental mode (saved prompt = style direction). */
export function minimaxInstrumentalInput(prompt: string): { lyrics: string; prompt: string } {
  return { lyrics: INSTRUMENTAL_STRUCTURE, prompt: `${prompt.trim()}. instrumental, no vocals. Studio production quality`.slice(0, 300) };
}


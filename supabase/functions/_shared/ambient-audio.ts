/**
 * v418 — Hybrid ambience for lip-sync scenes.
 *
 * A lip-sync scene normally renders a completely silent plate: the studio
 * owns every sound (voiceover, SFX, music). The hybrid mode relaxes exactly
 * one thing — the video model may produce ambience and foley — while the
 * spoken voice still comes from the studio track.
 *
 * Three rules keep that from turning into a double-voice mess:
 *
 *  1. The prompt forbids speech (English, like every model-facing prompt).
 *  2. After the render, `runAmbientSpeechGate` transcribes the plate. Any
 *     recognizable speech (or any failure of the gate itself) re-mutes the
 *     scene — fail-closed, never a hard render error.
 *  3. The ambience bed is mixed in at the very END (mux stage), underneath
 *     the voice and level-capped. It is never handed to the lip-sync model,
 *     which must only ever see the plate video plus our voiceover.
 */

/** Prompt suffix that bans any spoken word in the generated plate. */
export const AMBIENT_NO_SPEECH_PROMPT =
  "Audio: ambient sound and foley only — room tone, environment, movement and " +
  "object sounds. Absolutely no speech, no dialogue, no voices, no singing, " +
  "no narration, no whispering, no crowd chatter, no lyrics.";

/** Mix level of the ambience bed underneath the studio voice. */
export const AMBIENT_BED_VOLUME = 0.18;

/** Hard cap for the gate download — larger plates are re-muted, not analysed. */
const GATE_MAX_BYTES = 24 * 1024 * 1024;

export type AmbientGateResult = {
  /** True only when the plate is provably free of speech. */
  allowed: boolean;
  reason:
    | "no_speech"
    | "speech_detected"
    | "too_large"
    | "fetch_failed"
    | "stt_failed"
    | "not_configured";
  transcript?: string;
};

/** True when the scene keeps a native ambience bed under a studio voice. */
export function isAmbientAudioRow(row: { audio_source?: string | null } | null | undefined): boolean {
  return String(row?.audio_source ?? "") === "ambient";
}

/**
 * Reads the gate verdict previously stored on the scene's `audio_plan`.
 * Anything other than an explicit pass means: play the scene muted.
 */
export function ambientBedAllowed(audioPlan: unknown): boolean {
  const gate = (audioPlan as any)?.ambientGate;
  return !!gate && gate.status === "passed";
}

/**
 * Transcribes the plate's audio track and only allows the ambience bed when
 * the transcript is empty. Fail-closed: every error path returns
 * `allowed: false`.
 */
export async function runAmbientSpeechGate(clipUrl: string): Promise<AmbientGateResult> {
  const base = Deno.env.get("AMBIENT_TRANSCRIPTION_BASE_URL")?.replace(/\/+$/, "");
  const apiKey = Deno.env.get("AMBIENT_TRANSCRIPTION_API_KEY");
  const model = Deno.env.get("AMBIENT_TRANSCRIPTION_MODEL");
  if (!base || !apiKey || !model) return { allowed: false, reason: "not_configured" };
  try {
    const endpoint = new URL(base);
    const host = endpoint.hostname.toLowerCase();
    if (endpoint.protocol !== "https:" || endpoint.username || endpoint.password || endpoint.search || endpoint.hash ||
        ["lovable.dev", "lovable.app", "lovableproject.com", "supabase.co"].some(domain => host === domain || host.endsWith("." + domain))) {
      return { allowed: false, reason: "not_configured" };
    }
  } catch { return { allowed: false, reason: "not_configured" }; }

  let bytes: Uint8Array;
  try {
    const res = await fetch(clipUrl, { redirect: "error", signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return { allowed: false, reason: "fetch_failed" };
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.byteLength > GATE_MAX_BYTES) return { allowed: false, reason: "too_large" };
    bytes = buf;
  } catch {
    return { allowed: false, reason: "fetch_failed" };
  }

  try {
    const form = new FormData();
    // The transcription endpoint reads the audio track out of an MP4
    // container directly, so no ffmpeg step is needed in the edge runtime.
    form.append("file", new Blob([bytes], { type: "video/mp4" }), "plate.mp4");
    form.append("model", model);

    const res = await fetch(`${base}/audio/transcriptions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
      redirect: "error",
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      console.warn(`[ambient-gate] transcription failed ${res.status}`);
      return { allowed: false, reason: "stt_failed" };
    }
    const json = await res.json().catch(() => null);
    // A successful HTTP response without a transcript is not proof of silence.
    if (!json || typeof (json as any).text !== "string") return { allowed: false, reason: "stt_failed" };
    const transcript = (json as { text: string }).text.trim();
    // Transcribers happily hallucinate a stray token on pure room tone, so a
    // couple of characters are not treated as speech — two real words are.
    const words = transcript.split(/\s+/).filter((w) => /\p{L}{2,}/u.test(w));
    if (words.length >= 2) {
      return { allowed: false, reason: "speech_detected", transcript: transcript.slice(0, 300) };
    }
    return { allowed: true, reason: "no_speech", transcript: transcript.slice(0, 300) };
  } catch {
    console.warn("[ambient-gate] transcription unavailable");
    return { allowed: false, reason: "stt_failed" };
  }
}

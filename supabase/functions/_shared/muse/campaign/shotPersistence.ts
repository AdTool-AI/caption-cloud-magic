/**
 * Pure planning for saving shots without data loss.
 *
 * Matching: an incoming shot carrying an existing shot `id` (same video) keeps
 * that row; only shots without an id fall back to the free row with the same
 * shot_index. Re-ordering therefore never attaches a shot's routing to another
 * scene. Unmatched existing shots are archived (never deleted), and archived
 * shots are excluded from active routing and the cut-duration sum.
 */

export type AudioSource = 'studio' | 'provider' | 'ambient' | 'model_speech';

export interface ShotPlanFields {
  id?: string | null;
  start_s: number;
  end_s: number;
  purpose: string;
  shot_type: string;
  subject_emphasis: string;
  description: string;
  on_screen_text: string | null;
  voiceover: string | null;
  asset_id: string | null;
  required_resolution?: string | null;
  audio_source?: AudioSource | string | null;
}

export interface RoutingInputs extends ShotPlanFields {
  english_prompt?: string | null;
  negative_constraints?: unknown;
  aspect_ratio?: string | null;
  reference_asset_ids?: string[] | null;
}

export interface ExistingShot extends RoutingInputs {
  id: string;
  shot_index: number;
  routing_fingerprint?: string | null;
  selected_model?: string | null;
  attempt_count?: number | null;
  current_generation_id?: string | null;
  archived_at?: string | null;
}

/** True when the video model itself must produce speech/sound for this shot. */
export function modelMakesAudio(audio: unknown): boolean {
  return audio === 'provider' || audio === 'ambient' || audio === 'model_speech';
}

/**
 * Fields that change routing. A separately produced voiceover (studio audio)
 * is excluded; when the model generates speech or native audio, the audio
 * requirements (spoken text, audio source) are part of the fingerprint.
 */
export function routingFingerprint(s: RoutingInputs): string {
  const audio = modelMakesAudio(s.audio_source);
  const neg = s.negative_constraints == null ? null
    : Array.isArray(s.negative_constraints) ? [...(s.negative_constraints as unknown[])].map(String).sort() : String(s.negative_constraints);
  const refs = [s.asset_id ?? null, ...((s.reference_asset_ids ?? []).map(String).sort())];
  const key = JSON.stringify([
    Number(s.start_s), Number(s.end_s), String(s.purpose ?? ''), String(s.shot_type ?? ''),
    String(s.subject_emphasis ?? ''), String(s.description ?? '').trim(), s.on_screen_text ?? null, refs,
    String(s.english_prompt ?? '').trim() || null, neg, s.required_resolution ?? null, s.aspect_ratio ?? null,
    audio ? String(s.audio_source) : 'studio', audio ? (s.voiceover ?? null) : null,
  ]);
  // FNV-1a 32-bit — deterministic, sync, enough to detect edits.
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}

export interface ShotSavePlan {
  updates: Array<{ id: string; fields: ShotPlanFields & { shot_index: number }; stale: boolean; matched_by: 'id' | 'index' }>;
  inserts: Array<ShotPlanFields & { shot_index: number }>;
  /** Existing shots no longer in the plan — archived, never deleted. */
  archive: string[];
}

export function planShotSave(existing: ExistingShot[], incoming: ShotPlanFields[]): ShotSavePlan {
  const byId = new Map(existing.map((e) => [e.id, e]));
  const sorted = [...incoming].sort((a, b) => a.start_s - b.start_s);
  const claimed = new Set<string>();
  // Pass 1: explicit ids win.
  const match: Array<{ prev: ExistingShot; by: 'id' | 'index' } | null> = sorted.map((s) => {
    const prev = s.id ? byId.get(s.id) : undefined;
    if (prev && !claimed.has(prev.id)) { claimed.add(prev.id); return { prev, by: 'id' }; }
    return null;
  });
  // Pass 2: shots without id fall back to a still-free row at the same index.
  const activeByIndex = new Map(existing.filter((e) => !e.archived_at).map((e) => [e.shot_index, e]));
  sorted.forEach((s, i) => {
    if (match[i] || s.id) return;
    const prev = activeByIndex.get(i + 1);
    if (prev && !claimed.has(prev.id)) { claimed.add(prev.id); match[i] = { prev, by: 'index' }; }
  });

  const plan: ShotSavePlan = { updates: [], inserts: [], archive: [] };
  sorted.forEach((s, i) => {
    const { id: _ignored, ...rest } = s;
    const fields = { ...rest, shot_index: i + 1 };
    const m = match[i];
    if (!m) { plan.inserts.push(fields); return; }
    const prev = m.prev;
    const before = prev.routing_fingerprint ?? routingFingerprint(prev);
    // Prompt/negatives/aspect stay as stored on the row unless the plan sets them.
    const after = routingFingerprint({ ...prev, ...fields });
    const stale = !!prev.selected_model && (before !== after || !!prev.archived_at);
    plan.updates.push({ id: prev.id, fields, stale, matched_by: m.by });
  });
  for (const e of existing) if (!claimed.has(e.id) && !e.archived_at) plan.archive.push(e.id);
  return plan;
}

/** Sum of cut seconds over active (non-archived) shots only. */
export function activeCutSeconds(shots: Array<{ start_s: number; end_s: number; archived_at?: string | null }>): number {
  return shots.filter((s) => !s.archived_at).reduce((t, s) => t + (Number(s.end_s) - Number(s.start_s)), 0);
}

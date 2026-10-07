/**
 * Pure planning for saving shots without data loss.
 *
 * Existing shots are matched by stable key (shot_index within the video) and
 * updated in place, so their id, routing (model, duration, resolution) and
 * cost estimate survive a re-save. Only shots whose routing-relevant fields
 * changed are marked routing_stale.
 */

export interface ShotPlanFields {
  start_s: number;
  end_s: number;
  purpose: string;
  shot_type: string;
  subject_emphasis: string;
  description: string;
  on_screen_text: string | null;
  voiceover: string | null;
  asset_id: string | null;
}

export interface ExistingShot extends ShotPlanFields {
  id: string;
  shot_index: number;
  routing_fingerprint?: string | null;
  selected_model?: string | null;
  attempt_count?: number | null;
  current_generation_id?: string | null;
}

/** Fields that change routing (voiceover only changes post-production). */
export function routingFingerprint(s: Omit<ShotPlanFields, 'voiceover'> & { voiceover?: unknown }): string {
  const key = JSON.stringify([
    Number(s.start_s), Number(s.end_s), String(s.purpose ?? ''), String(s.shot_type ?? ''),
    String(s.subject_emphasis ?? ''), String(s.description ?? '').trim(), s.on_screen_text ?? null, s.asset_id ?? null,
  ]);
  // FNV-1a 32-bit — deterministic, sync, enough to detect edits.
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}

export interface ShotSavePlan {
  updates: Array<{ id: string; fields: ShotPlanFields & { shot_index: number }; stale: boolean }>;
  inserts: Array<ShotPlanFields & { shot_index: number }>;
  /** Surplus shots with no attempt/generation — safe to remove. */
  deletes: string[];
  /** Surplus shots that already have attempts — kept, never deleted. */
  kept: string[];
}

export function planShotSave(existing: ExistingShot[], incoming: ShotPlanFields[]): ShotSavePlan {
  const byIndex = new Map(existing.map((e) => [e.shot_index, e]));
  const sorted = [...incoming].sort((a, b) => a.start_s - b.start_s);
  const plan: ShotSavePlan = { updates: [], inserts: [], deletes: [], kept: [] };
  sorted.forEach((s, i) => {
    const shot_index = i + 1;
    const prev = byIndex.get(shot_index);
    const fields = { ...s, shot_index };
    if (!prev) { plan.inserts.push(fields); return; }
    const before = prev.routing_fingerprint ?? routingFingerprint(prev);
    const stale = !!prev.selected_model && before !== routingFingerprint(s);
    plan.updates.push({ id: prev.id, fields, stale });
  });
  for (const e of existing) {
    if (e.shot_index <= sorted.length) continue;
    if ((e.attempt_count ?? 0) > 0 || e.current_generation_id) plan.kept.push(e.id);
    else plan.deletes.push(e.id);
  }
  return plan;
}

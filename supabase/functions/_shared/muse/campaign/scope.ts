/**
 * Pure helpers for campaign budget scoping (optional video_ids).
 * No I/O so they can be unit-tested and reused unchanged off-Lovable.
 */

export interface ScopableShot {
  id: string;
  video_id: string;
  campaign_id?: string;
  selected_model?: string;
  duration_s?: number | string;
  resolution?: string;
  estimated_cost?: number | string;
}

export interface ScopeEntry {
  shot_id: string;
  video_id: string;
  model?: string;
  duration_s: number;
  resolution?: string;
  price: number;
}

export type ScopeResult<T> =
  | { ok: true; videoIds: string[] | null; shots: T[] }
  | { ok: false; code: 'INVALID_ARGUMENT'; error: string };

/** video_ids omitted/null → full campaign (unchanged behavior). */
export function scopeShotsToVideos<T extends ScopableShot>(shots: T[], videoIds: unknown): ScopeResult<T> {
  if (videoIds === undefined || videoIds === null) return { ok: true, videoIds: null, shots };
  if (!Array.isArray(videoIds) || videoIds.length === 0 || videoIds.some((v) => typeof v !== 'string')) {
    return { ok: false, code: 'INVALID_ARGUMENT', error: 'video_ids must be a non-empty list of video IDs.' };
  }
  const ids = [...new Set(videoIds as string[])];
  const known = new Set(shots.map((s) => s.video_id));
  const unknown = ids.filter((v) => !known.has(v));
  if (unknown.length) {
    return { ok: false, code: 'INVALID_ARGUMENT', error: `Unknown or unrouted video IDs for this campaign: ${unknown.join(', ')}` };
  }
  return { ok: true, videoIds: ids, shots: shots.filter((s) => ids.includes(s.video_id)) };
}

export function buildScope(shots: ScopableShot[]): ScopeEntry[] {
  return shots.map((s) => ({
    shot_id: s.id, video_id: s.video_id, model: s.selected_model,
    duration_s: Number(s.duration_s), resolution: s.resolution, price: Number(s.estimated_cost),
  }));
}

export function budgetTotals(scope: ScopeEntry[], retryBudgetPerShot: number) {
  const r2 = (n: number) => Math.round(n * 100) / 100;
  return {
    estimatedTotal: r2(scope.reduce((sum, s) => sum + s.price, 0)),
    maxTotal: r2(scope.reduce((sum, s) => sum + s.price * (1 + retryBudgetPerShot), 0)),
  };
}

/** Shot IDs an approval is allowed to dispatch — never more than its persisted scope. */
export function approvedShotIds(scope: unknown): Set<string> {
  return new Set(Array.isArray(scope) ? scope.map((s: { shot_id?: string }) => s?.shot_id).filter((x): x is string => typeof x === 'string') : []);
}

/** Keep only shots that are in the approval scope AND belong to the approval's campaign. */
export function filterDispatchable<T extends ScopableShot>(approval: { scope: unknown; campaign_id: string }, shots: T[]): T[] {
  const ids = approvedShotIds(approval.scope);
  return shots.filter((s) => ids.has(s.id) && (s.campaign_id === undefined || s.campaign_id === approval.campaign_id));
}

export type StartCheck = { ok: true } | { ok: false; code: 'APPROVAL_REQUIRED' | 'APPROVAL_EXPIRED'; error: string };

/** Approval usability for start_campaign_production (same rules as before, extracted). */
export function checkApprovalStartable(
  approval: { status: string; start_expires_at: string; execution_expires_at: string },
  now: number,
): StartCheck {
  if (approval.status === 'pending') return { ok: false, code: 'APPROVAL_REQUIRED', error: 'The user has not confirmed this campaign budget yet.' };
  if (approval.status !== 'approved' && approval.status !== 'started') {
    return { ok: false, code: 'APPROVAL_REQUIRED', error: `Budget approval is ${approval.status} and cannot be used.` };
  }
  if (approval.status === 'approved' && now > new Date(approval.start_expires_at).getTime()) {
    return { ok: false, code: 'APPROVAL_EXPIRED', error: 'The start window of this budget approval has expired. Ask for a new estimate.' };
  }
  if (now > new Date(approval.execution_expires_at).getTime()) {
    return { ok: false, code: 'APPROVAL_EXPIRED', error: 'The execution window of this budget approval has expired.' };
  }
  return { ok: true };
}

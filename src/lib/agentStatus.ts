/**
 * Pure helpers for the AdTool Agent UI: turn association, shot/campaign status
 * derived from real jobs, and money formatting in the stored currency.
 * No I/O — everything here is unit-tested.
 */

export type ShotStatusKey =
  | "planned"
  | "awaiting_approval"
  | "queued"
  | "generating"
  | "checking"
  | "qa_unavailable"
  | "visual_ready"
  | "needs_changes"
  | "interrupted"
  | "failed"
  | "unknown";

export interface ShotLike {
  id: string;
  status?: string | null;
  current_generation_id?: string | null;
  retry_plan?: unknown;
}
export interface GenerationLike {
  id: string;
  status?: string | null;
  created_at?: string | null;
}

/** A generation that has not finished after this long is treated as interrupted. */
export const STALE_GENERATION_MS = 60 * 60 * 1000;

export function deriveShotStatus(
  shot: ShotLike,
  generation: GenerationLike | undefined,
  inPendingApproval: boolean,
  now = Date.now(),
): ShotStatusKey {
  const s = String(shot.status ?? "");
  if (s === "client_ready") return "visual_ready";
  if (s === "qa_failed") return "qa_unavailable";
  if (s === "qa" || s === "qa_pending") return "checking";
  if (s === "failed") return "failed";
  if (s === "needs_retry") return inPendingApproval ? "awaiting_approval" : "needs_changes";
  if (s === "generating") {
    if (!generation) return "unknown";
    const g = String(generation.status ?? "");
    if (g === "completed") return "checking";
    if (g === "failed" || g === "cancelled") return "failed";
    const started = generation.created_at ? new Date(generation.created_at).getTime() : NaN;
    if (Number.isFinite(started) && now - started > STALE_GENERATION_MS) return "interrupted";
    if (g === "pending" || g === "queued") return "queued";
    if (g === "processing" || g === "running" || g === "starting") return "generating";
    return "unknown";
  }
  if (inPendingApproval) return "awaiting_approval";
  if (!s || s === "planned" || s === "routed") return "planned";
  return "unknown";
}

export type CampaignActivityKey =
  | "planning"
  | "awaiting_approval"
  | "running"
  | "checking"
  | "needs_changes"
  | "visuals_ready"
  | "attention";

/** Campaign-level state is derived only from shot states, never from the approval row's status. */
export function deriveCampaignActivity(statuses: ShotStatusKey[], hasPendingApproval: boolean): CampaignActivityKey {
  if (statuses.some((s) => s === "queued" || s === "generating")) return "running";
  if (statuses.some((s) => s === "checking")) return "checking";
  if (hasPendingApproval) return "awaiting_approval";
  if (statuses.some((s) => s === "failed" || s === "interrupted" || s === "unknown" || s === "qa_unavailable")) return "attention";
  if (statuses.some((s) => s === "needs_changes")) return "needs_changes";
  if (statuses.length > 0 && statuses.every((s) => s === "visual_ready")) return "visuals_ready";
  return "planning";
}

export interface Timed {
  createdAt?: string;
}

/**
 * Assigns each item to the user turn it belongs to: the latest user message
 * created at or before the item. Items older than every user message go to
 * turn -1. Returns a map: user message index -> items.
 */
export function groupByTurn<T>(
  userTimes: string[],
  items: T[],
  timeOf: (item: T) => string | undefined,
): Map<number, T[]> {
  const ts = userTimes.map((t) => new Date(t).getTime());
  const out = new Map<number, T[]>();
  for (const item of items) {
    const at = new Date(timeOf(item) ?? 0).getTime();
    let turn = -1;
    for (let i = 0; i < ts.length; i++) if (ts[i] <= at) turn = i;
    const list = out.get(turn) ?? [];
    list.push(item);
    out.set(turn, list);
  }
  return out;
}

/** An approval is actionable only while pending and inside its start window. */
export function isApprovalActionable(state: string, expiresAt: string | undefined, now = Date.now()): boolean {
  if (state !== "pending") return false;
  if (!expiresAt) return false;
  const t = new Date(expiresAt).getTime();
  return Number.isFinite(t) && t > now;
}

/** Formats an amount in the currency of the stored financial record. Never converts. */
export function formatMoney(amount: number | null | undefined, currency: string | null | undefined): string {
  const n = Number(amount ?? 0);
  const c = (currency ?? "").trim().toUpperCase();
  return c ? `${n.toFixed(2)} ${c}` : n.toFixed(2);
}

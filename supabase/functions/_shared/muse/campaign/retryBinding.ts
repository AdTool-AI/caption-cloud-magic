/**
 * Retry approvals bound to exactly one shot attempt.
 *
 * A retry approval authorises ONE attempt of ONE shot with ONE exact provider
 * request (model, provider function, mode, duration, resolution, aspect ratio,
 * prompt, negative prompt, reference files) and ONE retry-plan version, in one
 * currency, up to one immutable cost limit. Anything else needs a new approval.
 *
 * Pure: no I/O. The provider body sent by production.ts is built here too, so
 * tests can assert the exact values that reach the provider.
 */

// deno-lint-ignore no-explicit-any
type Any = any;

export interface RetryRequest {
  model: string;
  provider: string; // edge function that executes the generation
  mode: string; // t2v | i2v
  duration_s: number;
  resolution: string;
  aspect_ratio: string;
  prompt: string;
  negative_prompt: string | null;
  input_asset_id: string | null;
  reference_urls: string[];
}

export interface RetryBinding {
  campaign_id: string;
  shot_id: string;
  attempt_no: number;
  plan_prepared_at: string;
  plan_fingerprint: string;
  request: RetryRequest;
  currency: string;
  max_cost: number;
  estimated_cost: number;
  pricing_version: string;
}

/** Deterministic JSON: object keys sorted recursively. */
export function canonicalJson(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v ?? null);
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(',')}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o).sort().filter((k) => o[k] !== undefined).map((k) => `${JSON.stringify(k)}:${canonicalJson(o[k])}`).join(',')}}`;
}

export async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Builds the exact provider request a prepared retry plan would send. */
export function buildRetryRequest(
  shot: Any,
  provider: string,
  referenceUrls: string[] = [],
): RetryRequest | null {
  const plan = shot?.retry_plan;
  const proposed = plan?.proposed;
  if (!plan || !proposed?.model || !shot.retry_prompt) return null;
  return {
    model: String(proposed.model),
    provider,
    mode: String(proposed.mode ?? 't2v'),
    duration_s: Number(proposed.duration_s ?? shot.duration_s),
    resolution: String(proposed.resolution ?? shot.resolution ?? '720p'),
    aspect_ratio: String(shot.aspect_ratio ?? '9:16'),
    prompt: String(shot.retry_prompt),
    negative_prompt: plan.negative_constraints ? String(plan.negative_constraints) : null,
    input_asset_id: proposed.mode === 'i2v' ? (proposed.input_asset_id ?? null) : null,
    reference_urls: [...referenceUrls].sort(),
  };
}

/** Fingerprint of the bound plan version + exact request. Any change → different value. */
export async function planFingerprint(shot: Any, request: RetryRequest): Promise<string> {
  return await sha256Hex(canonicalJson({ prepared_at: shot?.retry_plan?.prepared_at ?? null, version: shot?.retry_plan?.version ?? null, request }));
}

/** The exact body the generate-* function receives. */
export function toProviderBody(r: RetryRequest): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: r.model,
    prompt: r.prompt,
    duration: r.duration_s,
    aspectRatio: r.aspect_ratio,
    resolution: r.resolution,
  };
  if (r.negative_prompt) body.negativePrompt = r.negative_prompt;
  if (r.mode === 'i2v' && r.reference_urls[0]) body.startImageUrl = r.reference_urls[0];
  return body;
}

export type BindingRejection =
  | 'UNBOUND_APPROVAL'
  | 'APPROVAL_NOT_APPROVED'
  | 'APPROVAL_CONSUMED'
  | 'APPROVAL_EXPIRED'
  | 'WRONG_CAMPAIGN'
  | 'WRONG_SHOT'
  | 'WRONG_ATTEMPT'
  | 'PLAN_CHANGED'
  | 'REQUEST_CHANGED'
  | 'CURRENCY_CHANGED'
  | 'PRICE_CHANGED'
  | 'COST_OVER_LIMIT';

export interface BindingCheckInput {
  approval: Any;
  campaignId: string;
  shotId: string;
  attemptNo: number;
  request: RetryRequest;
  fingerprint: string;
  currency: string;
  cost: number;
  pricingVersion: string;
  now?: number;
}

/** Validates that a retry approval covers exactly this attempt. Fail-closed. */
export function checkRetryBinding(i: BindingCheckInput): { ok: true } | { ok: false; code: BindingRejection; field?: string } {
  const a = i.approval;
  const b = a?.retry_binding as RetryBinding | null | undefined;
  if (!a || a.kind !== 'retry' || !b || typeof b !== 'object' || !b.shot_id || !b.plan_fingerprint) return { ok: false, code: 'UNBOUND_APPROVAL' };
  if (a.consumed_at || a.status === 'started') return { ok: false, code: 'APPROVAL_CONSUMED' };
  if (a.status !== 'approved') return { ok: false, code: 'APPROVAL_NOT_APPROVED' };
  const now = i.now ?? Date.now();
  const startBy = new Date(a.start_expires_at ?? 0).getTime();
  if (!Number.isFinite(startBy) || now > startBy) return { ok: false, code: 'APPROVAL_EXPIRED' };
  if (a.campaign_id !== i.campaignId || b.campaign_id !== i.campaignId) return { ok: false, code: 'WRONG_CAMPAIGN' };
  if (b.shot_id !== i.shotId) return { ok: false, code: 'WRONG_SHOT' };
  if (Number(b.attempt_no) !== i.attemptNo) return { ok: false, code: 'WRONG_ATTEMPT' };
  if (b.pricing_version !== i.pricingVersion) return { ok: false, code: 'PRICE_CHANGED' };
  if (String(b.currency).toUpperCase() !== String(i.currency).toUpperCase()) return { ok: false, code: 'CURRENCY_CHANGED' };
  for (const k of Object.keys(i.request) as (keyof RetryRequest)[]) {
    if (canonicalJson(b.request?.[k]) !== canonicalJson(i.request[k])) return { ok: false, code: 'REQUEST_CHANGED', field: k };
  }
  if (b.plan_fingerprint !== i.fingerprint) return { ok: false, code: 'PLAN_CHANGED' };
  const limit = Number(a.max_total);
  if (!(Number(b.max_cost) === limit) || !(i.cost > 0) || i.cost > limit) return { ok: false, code: 'COST_OVER_LIMIT' };
  return { ok: true };
}

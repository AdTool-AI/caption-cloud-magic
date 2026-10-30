/**
 * Narrow planning-only edits:
 * - update_campaign_video_metadata: patch whitelisted copy fields of ONE video.
 * - override_campaign_shot_routing: user-approved manual model choice for ONE
 *   planning-state shot, capability-checked and priced through the same
 *   canonical account-pricing path as automatic routing.
 *
 * Never touches approvals, reservations, ledger, wallet or generation. Every
 * change appends one row to campaign_planning_audit (append-only table).
 */

import type { ToolContext, ToolResult } from '../toolRuntime.ts';
import { getMuseModel } from '../videoModelCatalog.ts';
import { resolveCostPerSecond, CATALOG_VERSION } from '../../videoPricingCatalog.ts';
import { resolveAccountDiscountFactor, resolveWalletCurrency } from '../../accountVideoPricing.ts';
import { planningEstimate } from './routing.ts';
import { approvedShotIds } from './scope.ts';
import { routingFingerprint } from './shotPersistence.ts';

// deno-lint-ignore no-explicit-any
type Args = any;
// deno-lint-ignore no-explicit-any
type Row = Record<string, any>;
const err = (code: string, error: string, extra: Row = {}): ToolResult => ({ output: { error, code, ...extra } });

export const VIDEO_METADATA_FIELDS = ['commercial_angle', 'hook_text', 'main_message', 'hero_subject', 'cta', 'rationale', 'visual_style'] as const;
/** Columns that exist on campaign_videos. commercial_angle is a campaign-level column today, so it is rejected here (never silently mapped). */
const VIDEO_COLUMNS = new Set(['hook_text', 'main_message', 'hero_subject', 'cta', 'rationale', 'visual_style']);

export interface PricingDeps {
  currency: (ctx: ToolContext) => Promise<'EUR' | 'USD'>;
  discount: (ctx: ToolContext) => Promise<number>;
}
export const defaultPricingDeps: PricingDeps = {
  currency: async (ctx) => (await resolveWalletCurrency(ctx.admin, ctx.userId)) ?? 'EUR',
  discount: (ctx) => resolveAccountDiscountFactor(ctx.admin, ctx.userId),
};

async function ownedCampaign(ctx: ToolContext, id: unknown) {
  if (typeof id !== 'string' || !id) return null;
  const { data } = await ctx.admin.from('agent_campaigns').select('id, user_id').eq('id', id).eq('user_id', ctx.userId).maybeSingle();
  return data as Row | null;
}

async function appendAudit(ctx: ToolContext, row: Row): Promise<string | null> {
  const { error } = await ctx.admin.from('campaign_planning_audit').insert({ ...row, user_id: ctx.userId });
  return error ? String(error.message ?? error) : null;
}

// ---------------------------------------------------------------------------
// update_campaign_video_metadata
// ---------------------------------------------------------------------------

export async function updateCampaignVideoMetadata(ctx: ToolContext, a: Args): Promise<ToolResult> {
  const c = await ownedCampaign(ctx, a?.campaign_id);
  if (!c) return err('NOT_FOUND', 'Campaign not found.');
  if (typeof a?.video_id !== 'string') return err('INVALID', 'video_id is required.');
  const fields = a?.fields;
  if (!fields || typeof fields !== 'object' || Array.isArray(fields)) return err('INVALID', 'fields must be an object.');
  const keys = Object.keys(fields);
  if (!keys.length) return err('INVALID', 'No fields to update.');
  const unknown = keys.filter((k) => !(VIDEO_METADATA_FIELDS as readonly string[]).includes(k));
  if (unknown.length) return err('FIELD_NOT_ALLOWED', `Not allowed: ${unknown.join(', ')}.`, { allowed: VIDEO_METADATA_FIELDS });
  const patch: Row = {};
  for (const k of keys) {
    const v = fields[k];
    if (typeof v !== 'string' || !v.trim() || v.length > 600) return err('INVALID', `${k} must be a non-empty string (max 600 chars).`);
    const col = k;
    if (!VIDEO_COLUMNS.has(col)) return err('FIELD_NOT_ALLOWED', `${k} is not part of the video schema.`);
    patch[col] = v.trim();
  }
  const { data: video } = await ctx.admin.from('campaign_videos').select('*')
    .eq('id', a.video_id).eq('campaign_id', c.id).eq('user_id', ctx.userId).maybeSingle();
  if (!video) return err('NOT_FOUND', 'Video not found in this campaign.');
  const before: Row = {};
  for (const col of Object.keys(patch)) before[col] = video[col] ?? null;
  const auditErr = await appendAudit(ctx, { campaign_id: c.id, video_id: video.id, kind: 'video_metadata_patch', before, after: patch, reason: typeof a.reason === 'string' ? a.reason : null, user_confirmed: a.user_approved === true });
  if (auditErr) return err('AUDIT_FAILED', `Audit write failed: ${auditErr}`);
  const { error } = await ctx.admin.from('campaign_videos').update(patch).eq('id', video.id).eq('campaign_id', c.id).eq('user_id', ctx.userId);
  if (error) return err('UPDATE_FAILED', String(error.message ?? error));
  return { output: { campaign_id: c.id, video_id: video.id, updated: patch, previous: before, note: 'Only this video changed. Scripts, shots, generation state and other videos are untouched. No approval or charge.' } };
}

// ---------------------------------------------------------------------------
// override_campaign_shot_routing
// ---------------------------------------------------------------------------

export interface OverrideCheckInput {
  model: string;
  mode: string;
  duration: number;
  resolution: string | null;
  aspect: string;
  requiredResolution: string | null;
}

/** Pure capability check against the integrated catalog. Returns the resolved resolution + pricingId. */
export function checkOverrideCapability(i: OverrideCheckInput):
  | { ok: true; resolution: string; pricingId: string; displayName: string; provider: string }
  | { ok: false; code: string; error: string } {
  const m = getMuseModel(i.model);
  if (!m) return { ok: false, code: 'MODEL_NOT_INTEGRATED', error: `${i.model} is not in the integrated model catalog.` };
  const spec = m.modes[i.mode];
  if (!spec) return { ok: false, code: 'MODE_UNSUPPORTED', error: `${m.displayName} does not support ${i.mode}.` };
  if (!spec.durations.includes(i.duration)) return { ok: false, code: 'DURATION_UNSUPPORTED', error: `${m.displayName} ${i.mode} has no ${i.duration}s clip (allowed: ${spec.durations.join(', ')}).` };
  if (!spec.aspectRatios.includes(i.aspect)) return { ok: false, code: 'ASPECT_UNSUPPORTED', error: `${m.displayName} does not support ${i.aspect}.` };
  const priced = spec.resolutions.filter((r) => r.pricingId);
  const wanted = i.resolution ?? i.requiredResolution;
  if (i.requiredResolution && wanted !== i.requiredResolution) return { ok: false, code: 'RESOLUTION_UNSUPPORTED', error: `Shot requires ${i.requiredResolution}.` };
  const res = wanted ? priced.find((r) => r.label === wanted) : priced[0];
  if (!res) return { ok: false, code: 'RESOLUTION_UNSUPPORTED', error: `${m.displayName} has no priced ${wanted ?? 'resolution'} for ${i.mode}.` };
  return { ok: true, resolution: res.label, pricingId: res.pricingId!, displayName: m.displayName, provider: m.provider };
}

export async function overrideCampaignShotRouting(ctx: ToolContext, a: Args, deps: PricingDeps = defaultPricingDeps): Promise<ToolResult> {
  if (a?.user_approved !== true) return err('USER_APPROVAL_REQUIRED', 'user_approved: true is required (the user must have explicitly chosen this model).');
  const reason = typeof a?.override_reason === 'string' ? a.override_reason.trim() : '';
  if (!reason) return err('REASON_REQUIRED', 'override_reason is required.');
  if (typeof a?.model !== 'string' || !a.model) return err('INVALID', 'model is required.');
  const c = await ownedCampaign(ctx, a?.campaign_id);
  if (!c) return err('NOT_FOUND', 'Campaign not found.');
  const { data: shot } = await ctx.admin.from('campaign_shots').select('*')
    .eq('id', a.shot_id).eq('campaign_id', c.id).maybeSingle();
  if (!shot || shot.video_id !== a.video_id) return err('NOT_FOUND', 'Shot not found in this campaign/video.');
  if (shot.user_id && shot.user_id !== ctx.userId) return err('NOT_FOUND', 'Shot not found.');
  if (shot.archived_at) return err('ARCHIVED', 'Shot is archived.');

  // Planning-state only.
  if (shot.status && !['planned', 'quoted'].includes(shot.status)) return err('NOT_PLANNING_STATE', `Shot status is ${shot.status}.`);
  if (shot.current_generation_id) return err('HAS_GENERATION', 'Shot already has a generation.');
  const { data: attempts } = await ctx.admin.from('campaign_shot_attempts').select('id').eq('shot_id', shot.id).limit(1);
  if ((attempts ?? []).length) return err('HAS_ATTEMPT', 'Shot already has a generation attempt.');
  const { data: approvals } = await ctx.admin.from('campaign_budget_approvals').select('id, status, scope, retry_binding')
    .eq('campaign_id', c.id).in('status', ['pending', 'approved', 'started', 'running']);
  const blocking = (approvals ?? []).find((x: Row) => approvedShotIds(x.scope).has(shot.id) || x.retry_binding?.shot_id === shot.id);
  if (blocking) return err('IN_BUDGET_APPROVAL', `Shot is in budget approval ${blocking.id} (${blocking.status}).`);

  const mode = String(shot.generation_mode ?? 't2v');
  const aspect = String(shot.aspect_ratio ?? '9:16');
  const duration = Number(shot.generation_duration_s ?? shot.duration_s ?? Math.ceil(Number(shot.end_s) - Number(shot.start_s)));
  const cap = checkOverrideCapability({
    model: a.model, mode, duration, aspect,
    resolution: typeof a.resolution === 'string' ? a.resolution : null,
    requiredResolution: shot.required_resolution ?? null,
  });
  if (!cap.ok) return err(cap.code, cap.error);

  // Same canonical account-pricing path as route_campaign_shots. Client prices are ignored.
  const currency = await deps.currency(ctx);
  const list = resolveCostPerSecond(cap.pricingId, currency);
  if (list == null) return err('NO_CANONICAL_PRICE', `No canonical price for ${cap.pricingId}.`);
  const discount = await deps.discount(ctx);
  const est = planningEstimate(list, duration, discount);

  const prevRationale = (shot.routing_rationale ?? null) as Row | null;
  const automatic = prevRationale?.source === 'manual_override' ? prevRationale.automatic ?? null : prevRationale;
  const now = new Date().toISOString();
  const override = {
    model: a.model, display_name: cap.displayName, provider: cap.provider, mode, generation_duration_s: duration,
    resolution: cap.resolution, aspect_ratio: aspect, pricing_id: cap.pricingId, currency,
    list_price_per_second: Math.round(list * 100) / 100, discount_factor: discount, estimated_cost: est,
    pricing_version: CATALOG_VERSION, reason, user_confirmed: true, overridden_at: now,
    previous: { model: shot.selected_model ?? null, resolution: shot.resolution ?? null, estimated_cost: shot.estimated_cost ?? null },
  };
  const cut = Number(shot.end_s) - Number(shot.start_s);
  const rationale = {
    source: 'manual_override', chosen: a.model, reason: `User-approved override: ${reason}`,
    cut_duration_s: cut, generation_duration_s: duration, billed_seconds: duration, currency,
    estimate_kind: 'non_binding_planning_estimate', override, automatic,
  };
  const auditErr = await appendAudit(ctx, {
    campaign_id: c.id, video_id: shot.video_id, shot_id: shot.id, kind: 'shot_routing_override',
    before: { selected_model: shot.selected_model ?? null, resolution: shot.resolution ?? null, duration_s: shot.duration_s ?? null, estimated_cost: shot.estimated_cost ?? null, routing_rationale: prevRationale },
    after: override, reason, user_confirmed: true,
  });
  if (auditErr) return err('AUDIT_FAILED', `Audit write failed: ${auditErr}`);

  const fp = routingFingerprint({ ...shot, aspect_ratio: aspect });
  const { error } = await ctx.admin.from('campaign_shots').update({
    selected_model: a.model, resolution: cap.resolution, duration_s: duration, generation_duration_s: duration,
    cut_duration_s: cut, aspect_ratio: aspect, generation_mode: mode, estimated_cost: est,
    routing_rationale: rationale, routing_override: override, routing_fingerprint: fp, routing_stale: false, status: 'quoted',
  }).eq('id', shot.id).eq('campaign_id', c.id);
  if (error) return err('UPDATE_FAILED', String(error.message ?? error));
  return { output: { shot_id: shot.id, shot_index: shot.shot_index, model: a.model, resolution: cap.resolution, generation_duration_s: duration, estimated_cost: est, currency, previous: override.previous, note: 'Planning data only — no approval, reservation, charge or generation.' } };
}

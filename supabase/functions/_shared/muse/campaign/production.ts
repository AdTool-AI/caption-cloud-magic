/**
 * Phase B campaign production: shot routing, campaign budget, generation
 * dispatch, per-shot QA and controlled retries.
 *
 * Money rules:
 * - Prices come only from the canonical videoPricingCatalog.
 * - Every euro moves through campaign_spend_ledger rows (reserve/charge/
 * release/refund) with deterministic idempotency keys; the video wallet stays
 * the financial source of truth (the generate-* functions charge it).
 * - Paid execution (start_campaign_production, retry_shot) is foreground-only
 * for Muse; the durable worker may execute a prepared retry only when the
 * approval is auto_retry_within_budget.
 */

import type { ToolContext, ToolResult } from '../toolRuntime.ts';
import { getMuseModel } from '../videoModelCatalog.ts';
import { resolveCostPerSecond, CATALOG_VERSION } from '../../videoPricingCatalog.ts';
import { resolveAccountDiscountFactor, resolveWalletCurrency } from '../../accountVideoPricing.ts';
import {
  assessRisk, blendedQuality, buildShotPrompt, categorizeShot, negativeConstraints, routeShot, staticPrior,
  type ModelQaStatsRow, type RouteCandidate, type ShotInput,
} from './routing.ts';

// deno-lint-ignore no-explicit-any
type Args = any;
const err = (code: string, error: string, extra: Record<string, unknown> = {}): ToolResult => ({ output: { error, code, ...extra } });

const RESOLUTION_DEFAULT = '720p';
const ASPECT_DEFAULT = '9:16';

async function loadCampaign(ctx: ToolContext, id?: string) {
  let q = ctx.admin.from('agent_campaigns').select('*').eq('user_id', ctx.userId);
  q = id ? q.eq('id', id) : q.eq('conversation_id', ctx.conversationId).order('created_at', { ascending: false }).limit(1);
  const { data } = await q.maybeSingle();
  return data as Record<string, any> | null;
}

async function accountPricePerSecond(ctx: ToolContext, pricingId: string, currency: 'EUR' | 'USD'): Promise<number | null> {
  const list = resolveCostPerSecond(pricingId, currency);
  if (list == null) return null;
  const discount = await resolveAccountDiscountFactor(ctx.admin, ctx.userId);
  return Math.round(Math.round(list * 100) / 100 * discount * 100) / 100;
}

async function loadStats(ctx: ToolContext): Promise<Map<string, ModelQaStatsRow>> {
  const { data } = await ctx.admin.from('model_qa_stats').select('*');
  const map = new Map<string, ModelQaStatsRow>();
  for (const r of data ?? []) map.set(`${r.model}|${r.content_category}|${r.generation_mode}`, r as ModelQaStatsRow);
  return map;
}

// ---------------------------------------------------------------------------
// route_campaign_shots
// ---------------------------------------------------------------------------

export async function routeCampaignShots(ctx: ToolContext, a: Args): Promise<ToolResult> {
  const c = await loadCampaign(ctx, a.campaign_id);
  if (!c) return err('NOT_FOUND', 'Campaign not found.');
  const { data: videos } = await ctx.admin.from('campaign_videos').select('*').eq('campaign_id', c.id).order('video_index');
  if (!videos?.length) return err('PREREQUISITE', 'Plan the campaign videos first (Phase A).');
  const wanted = new Set(Array.isArray(a.video_ids) ? a.video_ids : videos.map((v: { id: string }) => v.id));
  const { data: shots } = await ctx.admin.from('campaign_shots').select('*').eq('campaign_id', c.id).order('shot_index');
  const { data: assets } = await ctx.admin.from('campaign_assets').select('id, reuse_status, url').eq('campaign_id', c.id);
  const assetById = new Map((assets ?? []).map((x: { id: string; reuse_status: string; url: string }) => [x.id, x]));
  const currency = (await resolveWalletCurrency(ctx.admin, ctx.userId)) ?? 'EUR';
  const stats = await loadStats(ctx);
  const aspect = String(a.aspect_ratio ?? ASPECT_DEFAULT);

  const routed: Record<string, unknown>[] = [];
  const skipped: Record<string, unknown>[] = [];

  for (const v of videos) {
    if (!wanted.has(v.id)) continue;
    const vShots = (shots ?? []).filter((s: { video_id: string }) => s.video_id === v.id);
    const neighborModels: string[] = [];
    for (const s of vShots) {
      if (s.status && !['planned', 'quoted'].includes(s.status)) { skipped.push({ shot_id: s.id, reason: `status ${s.status}` }); continue; }
      const asset = s.asset_id ? assetById.get(s.asset_id) : null;
      // reference_only assets may guide the prompt but are never sent as a first frame.
      const mode: 't2v' | 'i2v' = asset && asset.reuse_status === 'reuse_ok' ? 'i2v' : 't2v';
      const risk = assessRisk(s);
      const category = categorizeShot(s);
      const candidates = routeShot(s as ShotInput, category, risk, {
        aspectRatio: aspect,
        mode,
        pricePerSecond: (pid) => {
          const list = resolveCostPerSecond(pid, currency);
          return list == null ? null : Math.round(list * 100) / 100;
        },
        stats,
        neighborModels,
      });
      if (!candidates.length) { skipped.push({ shot_id: s.id, reason: `No model supports ${mode} ${aspect} for ${Math.ceil(s.end_s - s.start_s)}s at the required quality tier.` }); continue; }
      const best = candidates[0];
      neighborModels.push(best.model);
      const prompt = buildShotPrompt(s as ShotInput, { company: c.company_name, visualStyle: v.visual_style });
      const discount = await resolveAccountDiscountFactor(ctx.admin, ctx.userId);
      const est = best.estimated_cost == null ? null : Math.round(best.estimated_cost * discount * 100) / 100;
      await ctx.admin.from('campaign_shots').update({
        content_category: category,
        generation_mode: mode,
        input_asset_id: mode === 'i2v' ? s.asset_id : null,
        english_prompt: prompt,
        negative_constraints: negativeConstraints(risk),
        selected_model: best.model,
        resolution: best.resolution,
        duration_s: best.duration,
        aspect_ratio: aspect,
        routing_rationale: {
          candidates: candidates.slice(0, 5),
          chosen: best.model,
          reason: `Best total score for ${category}/${mode} at risk tier ${best.quality_tier}; confidence ${best.confidence}.`,
          confidence: best.confidence,
        },
        estimated_cost: est,
        status: 'quoted',
        motion_complexity: risk.motion_complexity,
        human_anatomy_risk: risk.human_anatomy_risk,
        physics_risk: risk.physics_risk,
        identity_consistency_requirement: risk.identity_consistency_requirement,
        text_requirement: risk.text_requirement,
        reference_strength: risk.reference_strength,
      }).eq('id', s.id);
      routed.push({
        shot_id: s.id, video_index: v.video_index, shot_index: s.shot_index, category, mode, model: best.model,
        resolution: best.resolution, duration_s: best.duration, estimated_cost: est, confidence: best.confidence, risk,
      });
    }
  }
  return { output: { campaign_id: c.id, routed, skipped, next: 'estimate_campaign_budget' } };
}

// ---------------------------------------------------------------------------
// estimate_campaign_budget
// ---------------------------------------------------------------------------

export async function estimateCampaignBudget(ctx: ToolContext, a: Args): Promise<ToolResult> {
  const c = await loadCampaign(ctx, a.campaign_id);
  if (!c) return err('NOT_FOUND', 'Campaign not found.');
  const { data: shots } = await ctx.admin
    .from('campaign_shots').select('id, video_id, shot_index, selected_model, duration_s, resolution, estimated_cost, status')
    .eq('campaign_id', c.id).eq('status', 'quoted').order('shot_index');
  if (!shots?.length) return err('PREREQUISITE', 'Call route_campaign_shots first.');

  // Optional video scoping: the approval scope (shot IDs) is what production
  // dispatches, so a scoped approval can never start other videos.
  let scopedShots = shots as Args[];
  let videoIds: string[] | null = null;
  if (a.video_ids !== undefined && a.video_ids !== null) {
    if (!Array.isArray(a.video_ids) || a.video_ids.length === 0 || a.video_ids.some((v: unknown) => typeof v !== 'string')) {
      return err('INVALID_ARGUMENT', 'video_ids must be a non-empty list of video IDs.');
    }
    videoIds = [...new Set(a.video_ids as string[])];
    const known = new Set(shots.map((s: Args) => s.video_id));
    const unknown = videoIds.filter((v) => !known.has(v));
    if (unknown.length) return err('INVALID_ARGUMENT', `Unknown or unrouted video IDs for this campaign: ${unknown.join(', ')}`);
    scopedShots = shots.filter((s: Args) => videoIds!.includes(s.video_id));
  }

  const retryBudget = Math.max(0, Math.min(2, Number(a.retry_budget_per_shot ?? 1)));
  const retryMode = a.retry_mode === 'auto_retry_within_budget' ? 'auto_retry_within_budget' : 'manual_retry';
  const scope = scopedShots.map((s: Args) => ({
    shot_id: s.id, video_id: s.video_id, model: s.selected_model, duration_s: Number(s.duration_s), resolution: s.resolution, price: Number(s.estimated_cost),
  }));
  if (scope.some((s) => !Number.isFinite(s.price) || s.price <= 0)) {
    return err('PRICING_UNAVAILABLE', 'At least one shot has no canonical price. Re-run routing.');
  }
  const estimatedTotal = Math.round(scope.reduce((sum, s) => sum + s.price, 0) * 100) / 100;
  const maxTotal = Math.round(scope.reduce((sum, s) => sum + s.price * (1 + retryBudget), 0) * 100) / 100;

  const { data: wallet } = await ctx.admin.from('ai_video_wallets').select('balance_euros, currency').eq('user_id', ctx.userId).maybeSingle();
  const now = Date.now();
  const { data: approval, error } = await ctx.admin.from('campaign_budget_approvals').insert({
    campaign_id: c.id,
    user_id: ctx.userId,
    conversation_id: ctx.conversationId,
    scope,
    estimated_total: estimatedTotal,
    max_total: maxTotal,
    retry_budget_per_shot: retryBudget,
    retry_mode: retryMode,
    status: 'pending',
    pricing_version: CATALOG_VERSION,
    start_expires_at: new Date(now + 30 * 60_000).toISOString(),
    execution_expires_at: new Date(now + 7 * 24 * 60 * 60_000).toISOString(),
  }).select('id, start_expires_at, execution_expires_at').single();
  if (error || !approval) return err('DB_ERROR', error?.message ?? 'Could not create the budget approval.');

  return {
    output: {
      campaign_approval_required: true,
      campaign_approval_id: approval.id,
      campaign_id: c.id,
      video_ids: videoIds,
      shots: scope,
      estimated_total: estimatedTotal,
      max_total: maxTotal,
      retry_budget_per_shot: retryBudget,
      retry_mode: retryMode,
      currency: wallet?.currency ?? 'EUR',
      wallet_balance: wallet ? Number(wallet.balance_euros) : null,
      sufficient_credits: wallet ? Number(wallet.balance_euros) >= estimatedTotal : false,
      start_expires_at: approval.start_expires_at,
      execution_expires_at: approval.execution_expires_at,
      pricing_version: CATALOG_VERSION,
      next_step: 'STOP. Show this campaign budget to the user. The user must press Confirm in the AdTool UI. start_campaign_production will be refused until then.',
    },
  };
}

// ---------------------------------------------------------------------------
// Budget approval loading / validation
// ---------------------------------------------------------------------------

async function loadBudgetApproval(ctx: ToolContext, id: unknown) {
  if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data } = await ctx.admin.from('campaign_budget_approvals').select('*').eq('id', id).eq('user_id', ctx.userId).maybeSingle();
  return data as Record<string, any> | null;
}

async function validateApprovalForDispatch(ctx: ToolContext, approval: Record<string, any>, shot: Record<string, any>): Promise<{ ok: true; price: number } | { ok: false; result: ToolResult }> {
  if (approval.pricing_version !== CATALOG_VERSION) {
    return { ok: false, result: err('PRICE_CHANGED', 'Prices changed since this budget was approved. Ask for a new estimate.') };
  }
  const scope = (approval.scope as Args[]).find((s) => s.shot_id === shot.id);
  if (!scope) return { ok: false, result: err('NOT_IN_SCOPE', 'This shot is not part of the approved budget.') };
  if (scope.model !== shot.selected_model || Number(scope.duration_s) !== Number(shot.duration_s) || scope.resolution !== shot.resolution) {
    return { ok: false, result: err('SCOPE_MISMATCH', 'The routed model/duration/resolution changed since approval. Re-estimate the budget.') };
  }
  return { ok: true, price: Number(scope.price) };
}

// ---------------------------------------------------------------------------
// Dispatch one shot through the existing generate-* function
// ---------------------------------------------------------------------------

async function dispatchShot(
  ctx: ToolContext,
  approval: Record<string, any>,
  shot: Record<string, any>,
  attemptNo: number,
  opts: { prompt: string; model?: string; internalUserId?: string },
): Promise<ToolResult> {
  const modelId = opts.model ?? shot.selected_model;
  const spec = getMuseModel(modelId);
  if (!spec) return err('UNKNOWN_MODEL', `Unknown model "${modelId}".`);

  const key = (kind: string) => `${kind}:${approval.id}:${shot.id}:${attemptNo}`;
  const reserved = await ctx.admin.rpc('reserve_campaign_spend', {
    _approval_id: approval.id, _shot_id: shot.id, _amount: Number(shot.estimated_cost), _key: key('reserve'),
  });
  if (reserved.error) return err('BUDGET_ERROR', reserved.error.message);
  if (reserved.data !== true) {
    return err('BUDGET_EXHAUSTED', 'The approved campaign budget is exhausted. Ask the user to approve more budget.', { max_total: approval.max_total });
  }

  const body: Record<string, unknown> = {
    model: modelId,
    prompt: opts.prompt,
    duration: Number(shot.duration_s),
    aspectRatio: shot.aspect_ratio ?? ASPECT_DEFAULT,
    resolution: shot.resolution ?? RESOLUTION_DEFAULT,
  };
  if (shot.negative_constraints) body.negativePrompt = shot.negative_constraints;
  if (shot.generation_mode === 'i2v' && shot.input_asset_id) {
    const { data: asset } = await ctx.admin.from('campaign_assets').select('url, reuse_status').eq('id', shot.input_asset_id).maybeSingle();
    if (asset?.reuse_status === 'reuse_ok') body.startImageUrl = asset.url;
  }

  const res = await fetch(`${ctx.supabaseUrl}/functions/v1/${spec.edgeFunction}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${ctx.userJwt}`,
      apikey: ctx.anonKey,
      'Content-Type': 'application/json',
      ...(opts.internalUserId ? { 'x-agent-user-id': opts.internalUserId } : {}),
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  // deno-lint-ignore no-explicit-any
  let parsed: any = {};
  try { parsed = JSON.parse(text); } catch { parsed = { raw: text.slice(0, 400) }; }

  if (!res.ok) {
    // Release the reservation — nothing was dispatched.
    await ctx.admin.rpc('campaign_ledger_entry', {
      _approval_id: approval.id, _shot_id: shot.id, _generation_id: null, _entry_type: 'release',
      _amount: Number(shot.estimated_cost), _key: key('release'),
    });
    return err(parsed.code ?? 'GENERATION_FAILED', parsed.error ?? `Generation failed (HTTP ${res.status}).`, { status: res.status });
  }

  const generationId = parsed.generationId ?? parsed.generation_id ?? parsed.id ?? null;
  await ctx.admin.rpc('campaign_ledger_entry', {
    _approval_id: approval.id, _shot_id: shot.id, _generation_id: generationId, _entry_type: 'charge',
    _amount: Number(shot.estimated_cost), _key: key('charge'),
  });
  await ctx.admin.from('campaign_shot_attempts').upsert({
    shot_id: shot.id, campaign_id: approval.campaign_id, user_id: ctx.userId,
    attempt_no: attemptNo, generation_id: generationId, model: modelId, prompt: opts.prompt,
    cost_charged: Number(shot.estimated_cost),
  }, { onConflict: 'shot_id,attempt_no' });
  await ctx.admin.from('campaign_shots').update({
    status: 'generating', current_generation_id: generationId, attempt_count: attemptNo,
  }).eq('id', shot.id);
  // Durable async task: the resume worker picks this up when the render finishes.
  await ctx.admin.from('agent_tasks').upsert({
    conversation_id: ctx.conversationId, user_id: ctx.userId, generation_id: generationId,
    approval_id: null, status: 'waiting_for_generation', intent: `campaign shot ${shot.id}: ${String(opts.prompt).slice(0, 1800)}`,
  }, { onConflict: 'generation_id', ignoreDuplicates: true });

  return {
    output: { started: true, shot_id: shot.id, generation_id: generationId, model: modelId, charged_estimate: Number(shot.estimated_cost), attempt_no: attemptNo },
    generationId: generationId ?? undefined,
    estimatedCost: Number(shot.estimated_cost),
  };
}

// ---------------------------------------------------------------------------
// start_campaign_production (paid, foreground only)
// ---------------------------------------------------------------------------

export async function startCampaignProduction(ctx: ToolContext, a: Args): Promise<ToolResult> {
  const approval = await loadBudgetApproval(ctx, a.approval_id);
  if (!approval) return err('APPROVAL_REQUIRED', 'No valid campaign budget approval. Call estimate_campaign_budget and wait for the user to confirm.');
  if (approval.status === 'pending') return err('APPROVAL_REQUIRED', 'The user has not confirmed this campaign budget yet.');
  if (approval.status !== 'approved' && approval.status !== 'started') return err('APPROVAL_REQUIRED', `Budget approval is ${approval.status} and cannot be used.`);
  const now = Date.now();
  if (approval.status === 'approved') {
    if (now > new Date(approval.start_expires_at).getTime()) {
      return err('APPROVAL_EXPIRED', 'The start window of this budget approval has expired. Ask for a new estimate.');
    }
    const { data: started } = await ctx.admin.from('campaign_budget_approvals')
      .update({ status: 'started', started_at: new Date().toISOString() })
      .eq('id', approval.id).eq('status', 'approved').select('id');
    if (!started?.length) return err('APPROVAL_REQUIRED', 'The approval was already used or expired.');
    approval.status = 'started';
  }
  if (now > new Date(approval.execution_expires_at).getTime()) {
    return err('APPROVAL_EXPIRED', 'The execution window of this budget approval has expired.');
  }

  const scopeIds = (approval.scope as Args[]).map((s) => s.shot_id);
  const { data: shots } = await ctx.admin.from('campaign_shots').select('*').in('id', scopeIds).eq('campaign_id', approval.campaign_id).eq('user_id', ctx.userId);
  const results: Record<string, unknown>[] = [];
  for (const shot of shots ?? []) {
    if (shot.status !== 'quoted') { results.push({ shot_id: shot.id, skipped: true, status: shot.status }); continue; }
    const check = await validateApprovalForDispatch(ctx, approval, shot);
    if (!check.ok) { results.push({ shot_id: shot.id, ...(check.result.output as object) }); continue; }
    const r = await dispatchShot(ctx, approval, shot, 1, { prompt: shot.english_prompt });
    results.push({ shot_id: shot.id, ...r.output });
    if (r.output?.error) break; // fail fast: never burn budget after a dispatch error
  }
  const startedCount = results.filter((r) => r.started).length;
  if (startedCount > 0) {
    await ctx.admin.from('agent_campaigns').update({ stage: 'generating' }).eq('id', approval.campaign_id);
  }
  return { output: { approval_id: approval.id, results, started: startedCount } };
}

// ---------------------------------------------------------------------------
// review_shot (full-video QA, free for the wallet)
// ---------------------------------------------------------------------------

const ISSUE_CLASSES = ['anatomy', 'faces', 'hands', 'food_logic', 'physics', 'text', 'flicker', 'morphing', 'prompt_miss', 'audio'];

function classifyIssues(qa: Record<string, any>): Record<string, number> {
  const text = JSON.stringify(qa?.issues ?? qa?.timestamped_issues ?? qa ?? '').toLowerCase();
  const counts: Record<string, number> = {};
  const add = (cls: string, ...words: string[]) => { if (words.some((w) => text.includes(w))) counts[cls] = (counts[cls] ?? 0) + 1; };
  add('hands', 'hand', 'finger');
  add('faces', 'face', 'mouth', 'teeth', 'eyes');
  add('anatomy', 'anatomy', 'limb', 'arm', 'leg');
  add('food_logic', 'food', 'coffee', 'pour', 'croissant', 'drink');
  add('physics', 'physics', 'float', 'disappear', 'teleport', 'impossible');
  add('text', 'text', 'letter', 'spelling', 'typo');
  add('flicker', 'flicker');
  add('morphing', 'morph', 'warp');
  add('prompt_miss', 'off-prompt', 'wrong subject', 'not show');
  add('audio', 'audio', 'sound', 'lip-sync', 'lipsync');
  return counts;
}

export async function reviewShot(ctx: ToolContext, a: Args): Promise<ToolResult> {
  const { data: shot } = await ctx.admin.from('campaign_shots').select('*').eq('id', a.shot_id).eq('user_id', ctx.userId).maybeSingle();
  if (!shot) return err('NOT_FOUND', 'Shot not found.');
  if (!shot.current_generation_id) return err('PREREQUISITE', 'This shot has no generation yet.');

  // QA at most once per attempt: claim the shot into qa state atomically.
  const { data: claimed } = await ctx.admin.from('campaign_shots')
    .update({ status: 'qa' }).eq('id', shot.id).in('status', ['generating']).select('id');
  if (!claimed?.length) {
    return { output: { shot_id: shot.id, status: shot.status, client_ready: shot.client_ready, note: 'QA already done or shot not ready.' } };
  }

  const res = await fetch(`${ctx.supabaseUrl}/functions/v1/agent-video-qa`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${ctx.userJwt}`,
      apikey: ctx.anonKey,
      'Content-Type': 'application/json',
      ...(ctx.internalAuthUserId ? { 'x-agent-user-id': ctx.internalAuthUserId } : {}),
    },
    body: JSON.stringify({
      generation_id: shot.current_generation_id,
      intent: `Advertising shot for ${shot.english_prompt ?? shot.description}. Purpose: ${shot.purpose}.`,
    }),
  });
  // deno-lint-ignore no-explicit-any
  let qa: any = {};
  try { qa = await res.json(); } catch { qa = {}; }
  if (!res.ok) {
    await ctx.admin.from('campaign_shots').update({ status: 'generating' }).eq('id', shot.id); // allow one re-review
    return err(qa.code ?? 'QA_UNAVAILABLE', qa.error ?? `Video QA failed (HTTP ${res.status}).`);
  }

  const verdict = String(qa.verdict ?? qa.analysis?.verdict ?? 'needs_work');
  const scores = qa.scores ?? qa.analysis?.scores ?? null;
  const overall = Number(scores?.overall ?? scores?.prompt_adherence ?? qa.overall_score ?? 0);
  const issues = classifyIssues(qa);
  // Hard fail: physically absurd content is never client-ready.
  const absurd = issues.physics > 0 && /absurd|impossible|onto|nonsensical/i.test(JSON.stringify(qa.issues ?? ''));
  const clientReady = !absurd && (verdict === 'acceptable' || verdict === 'client_ready' || (overall >= 7 && issues.anatomy + issues.hands + issues.faces === 0));

  await ctx.admin.from('campaign_shot_attempts')
    .update({ qa_verdict: verdict, qa_scores: scores, qa_issues: issues, client_ready: clientReady, failure_class: clientReady ? null : Object.keys(issues)[0] ?? 'quality' })
    .eq('shot_id', shot.id).eq('generation_id', shot.current_generation_id);
  await ctx.admin.from('campaign_shots').update({
    status: clientReady ? 'client_ready' : 'needs_retry',
    client_ready: clientReady,
    qa_summary: { verdict, overall, issues, checked_at: new Date().toISOString() },
  }).eq('id', shot.id);
  // Atomic stats increment (no read-modify-write).
  await ctx.admin.rpc('increment_model_qa_stats', {
    _model: shot.selected_model, _category: shot.content_category ?? 'product', _mode: shot.generation_mode ?? 't2v',
    _client_ready: clientReady, _score: overall, _issues: issues,
  });

  return {
    output: {
      shot_id: shot.id, verdict, client_ready: clientReady, overall_score: overall, issue_classes: issues,
      qa: { scores, issues: qa.issues ?? qa.timestamped_issues ?? null },
      next: clientReady ? 'Shot is client-ready.' : 'Call prepare_shot_retry to plan an improved attempt within the approved budget.',
    },
  };
}

// ---------------------------------------------------------------------------
// prepare_shot_retry (free; never dispatches)
// ---------------------------------------------------------------------------

export async function prepareShotRetry(ctx: ToolContext, a: Args): Promise<ToolResult> {
  const { data: shot } = await ctx.admin.from('campaign_shots').select('*').eq('id', a.shot_id).eq('user_id', ctx.userId).maybeSingle();
  if (!shot) return err('NOT_FOUND', 'Shot not found.');
  if (shot.status !== 'needs_retry') return err('INVALID_STATE', `Shot is ${shot.status}, not needs_retry.`);
  const { data: approval } = await ctx.admin.from('campaign_budget_approvals')
    .select('*').eq('campaign_id', shot.campaign_id).in('status', ['approved', 'started'])
    .order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (!approval) return err('APPROVAL_REQUIRED', 'No active campaign budget approval.');
  if (Number(shot.attempt_count) >= 1 + Number(approval.retry_budget_per_shot)) {
    return err('RETRY_CAP', 'The approved retry allowance for this shot is used up. The user can accept the shot or approve more budget.');
  }

  // Next-ranked model from the stored routing candidates, else same model with a revised prompt.
  const candidates = (shot.routing_rationale?.candidates ?? []) as RouteCandidate[];
  const currentIdx = candidates.findIndex((c) => c.model === shot.selected_model);
  const next = candidates[currentIdx + 1] ?? null;
  const retryModel = next && next.quality_tier >= (candidates[currentIdx]?.quality_tier ?? 1) ? next.model : shot.selected_model;
  const issues = Object.keys(shot.qa_summary?.issues ?? {});
  const retryPrompt = [
    shot.english_prompt,
    issues.length ? `Avoid: ${issues.join(', ')} artifacts.` : '',
    'Keep the subject stable and physically plausible throughout.',
  ].filter(Boolean).join(' ');

  await ctx.admin.from('campaign_shots').update({
    retry_prompt: retryPrompt, retry_model: retryModel,
    retry_reason: `QA verdict ${shot.qa_summary?.verdict ?? 'needs_work'}: ${issues.join(', ') || 'quality'}`,
    retry_prepared_at: new Date().toISOString(),
  }).eq('id', shot.id);

  return {
    output: {
      shot_id: shot.id, retry_prepared: true, retry_model: retryModel, model_changed: retryModel !== shot.selected_model,
      retry_prompt: retryPrompt, reason: issues,
      retry_mode: approval.retry_mode,
      note: approval.retry_mode === 'auto_retry_within_budget'
        ? 'The production worker will execute this retry automatically within the approved budget.'
        : 'Ask the user to confirm, then call retry_shot in the foreground.',
    },
  };
}

// ---------------------------------------------------------------------------
// retry_shot (paid). Foreground for manual_retry; worker for auto mode.
// ---------------------------------------------------------------------------

export async function retryShot(ctx: ToolContext, a: Args, opts: { fromWorker?: boolean } = {}): Promise<ToolResult> {
  const { data: shot } = await ctx.admin.from('campaign_shots').select('*').eq('id', a.shot_id).eq('user_id', ctx.userId).maybeSingle();
  if (!shot) return err('NOT_FOUND', 'Shot not found.');
  const { data: approval } = await ctx.admin.from('campaign_budget_approvals')
    .select('*').eq('campaign_id', shot.campaign_id).in('status', ['approved', 'started'])
    .order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (!approval) return err('APPROVAL_REQUIRED', 'No active campaign budget approval.');
  if (opts.fromWorker && approval.retry_mode !== 'auto_retry_within_budget') {
    return err('TOOL_NOT_ALLOWED', 'Automatic retry is not approved for this campaign (manual_retry).');
  }
  if (shot.status !== 'needs_retry' || !shot.retry_prompt) return err('INVALID_STATE', 'No prepared retry for this shot. Call prepare_shot_retry first.');
  if (Date.now() > new Date(approval.execution_expires_at).getTime()) return err('APPROVAL_EXPIRED', 'The execution window has expired.');
  if (shot.retry_model === shot.selected_model && shot.retry_prompt === shot.english_prompt) {
    return err('IDENTICAL_RETRY', 'An identical re-run is refused; the retry must change the prompt or the model.');
  }
  const check = await validateApprovalForDispatch(ctx, approval, shot);
  if (!check.ok) return check.result;

  const attemptNo = Number(shot.attempt_count) + 1;
  const patched = { ...shot, selected_model: shot.retry_model };
  const r = await dispatchShot(ctx, approval, patched, attemptNo, { prompt: shot.retry_prompt, model: shot.retry_model, internalUserId: opts.fromWorker ? ctx.userId : undefined });
  if (!r.output?.error) {
    await ctx.admin.from('campaign_shots').update({ selected_model: shot.retry_model, english_prompt: shot.retry_prompt }).eq('id', shot.id);
  }
  return r;
}

// ---------------------------------------------------------------------------
// get_campaign_production_status (free)
// ---------------------------------------------------------------------------

export async function productionStatus(ctx: ToolContext, a: Args): Promise<ToolResult> {
  const c = await loadCampaign(ctx, a.campaign_id);
  if (!c) return err('NOT_FOUND', 'Campaign not found.');
  const [shots, approvals, ledger] = await Promise.all([
    ctx.admin.from('campaign_shots').select('id, video_id, shot_index, status, selected_model, estimated_cost, client_ready, attempt_count, qa_summary, current_generation_id').eq('campaign_id', c.id).order('shot_index'),
    ctx.admin.from('campaign_budget_approvals').select('id, status, estimated_total, max_total, spent_total, retry_mode, retry_budget_per_shot, start_expires_at, execution_expires_at').eq('campaign_id', c.id).order('created_at', { ascending: false }).limit(3),
    ctx.admin.from('campaign_spend_ledger').select('entry_type, amount, shot_id, created_at').order('created_at', { ascending: false }).limit(50),
  ]);
  const byStatus: Record<string, number> = {};
  for (const s of shots.data ?? []) byStatus[s.status] = (byStatus[s.status] ?? 0) + 1;
  return {
    output: {
      campaign_id: c.id, stage: c.stage,
      shots_total: shots.data?.length ?? 0, by_status: byStatus,
      shots: shots.data, approvals: approvals.data, recent_ledger: ledger.data,
    },
  };
}

// ---------------------------------------------------------------------------
// Worker entry: execute an eligible prepared retry (auto_retry_within_budget)
// ---------------------------------------------------------------------------

// deno-lint-ignore no-explicit-any
export async function executeEligibleAutoRetries(admin: any, opts: { supabaseUrl: string; serviceKey: string; anonKey: string; limit?: number }): Promise<number> {
  const { data: shots } = await admin
    .from('campaign_shots')
    .select('id, campaign_id, user_id')
    .eq('status', 'needs_retry')
    .not('retry_prompt', 'is', null)
    .limit(opts.limit ?? 3);
  let executed = 0;
  for (const s of shots ?? []) {
    const { data: approval } = await admin.from('campaign_budget_approvals')
      .select('id, retry_mode, status').eq('campaign_id', s.campaign_id)
      .eq('retry_mode', 'auto_retry_within_budget').in('status', ['approved', 'started'])
      .gt('execution_expires_at', new Date().toISOString())
      .order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (!approval) continue;
    // Claim the shot so two workers never retry the same shot.
    const { data: claimed } = await admin.from('campaign_shots')
      .update({ status: 'generating' }).eq('id', s.id).eq('status', 'needs_retry').select('id');
    if (!claimed?.length) continue;
    const ctx: ToolContext = {
      userId: s.user_id, conversationId: '', admin, userJwt: opts.serviceKey,
      supabaseUrl: opts.supabaseUrl, anonKey: opts.anonKey,
      museConfig: { apiKey: '', baseUrl: '', model: '', maxToolIterations: 0, maxRegenerations: 0, maxTurnSpend: 0 },
      regenerationsUsed: 0, maxRegenerations: 0, maxTurnSpend: 0, spentThisTurn: 0,
      internalAuthUserId: s.user_id,
    };
    // Restore needs_retry so retryShot's state check passes after the claim.
    await admin.from('campaign_shots').update({ status: 'needs_retry' }).eq('id', s.id);
    const r = await retryShot(ctx, { shot_id: s.id }, { fromWorker: true });
    if (r.output?.started) executed += 1;
    else await admin.from('campaign_shots').update({ status: 'needs_retry' }).eq('id', s.id).eq('status', 'generating');
  }
  return executed;
}

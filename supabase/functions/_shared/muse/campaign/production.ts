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
import { approvedShotIds, budgetTotals, buildScope, filterDispatchable, scopeShotsToVideos } from './scope.ts';
import { runShotQa } from './shotQa.ts';
import { budgetFit, materialChanges, planRetry, predictImprovement } from './retryPlan.ts';
import { buildPostProduction } from './postProduction.ts';
import { buildRetryRequest, checkRetryBinding, planFingerprint, toProviderBody, type RetryBinding, type RetryRequest } from './retryBinding.ts';

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
  const scoped = scopeShotsToVideos(shots as Args[], a.video_ids);
  if (!scoped.ok) return err(scoped.code, scoped.error);
  const videoIds = scoped.videoIds;
  const scopedShots = scoped.shots;

  const retryBudget = Math.max(0, Math.min(2, Number(a.retry_budget_per_shot ?? 1)));
  const retryMode = a.retry_mode === 'auto_retry_within_budget' ? 'auto_retry_within_budget' : 'manual_retry';
  const scope = buildScope(scopedShots);
  if (scope.some((s) => !Number.isFinite(s.price) || s.price <= 0)) {
    return err('PRICING_UNAVAILABLE', 'At least one shot has no canonical price. Re-run routing.');
  }
  const { estimatedTotal, maxTotal } = budgetTotals(scope, retryBudget);

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
  opts: { prompt: string; model?: string; internalUserId?: string; body?: Record<string, unknown> },
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

  const body: Record<string, unknown> = opts.body ? { ...opts.body } : {
    model: modelId,
    prompt: opts.prompt,
    duration: Number(shot.duration_s),
    aspectRatio: shot.aspect_ratio ?? ASPECT_DEFAULT,
    resolution: shot.resolution ?? RESOLUTION_DEFAULT,
  };
  if (!opts.body && shot.negative_constraints) body.negativePrompt = shot.negative_constraints;
  if (!opts.body && shot.generation_mode === 'i2v' && shot.input_asset_id) {
    const { data: asset } = await ctx.admin.from('campaign_assets').select('url, reuse_status').eq('id', shot.input_asset_id).maybeSingle();
    if (asset?.reuse_status === 'reuse_ok') body.startImageUrl = asset.url;
  }

  const res = await (ctx.fetchImpl ?? fetch)(`${ctx.supabaseUrl}/functions/v1/${spec.edgeFunction}`, {
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
  if (approval.kind === 'retry') return err('WRONG_APPROVAL_KIND', 'A retry approval cannot start campaign production. Use retry_shot.');
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

  const scopeIds = [...approvedShotIds(approval.scope)];
  const { data: shots } = await ctx.admin.from('campaign_shots').select('*').in('id', scopeIds).eq('campaign_id', approval.campaign_id).eq('user_id', ctx.userId);
  const results: Record<string, unknown>[] = [];
  for (const shot of filterDispatchable(approval as { scope: unknown; campaign_id: string }, (shots ?? []) as Args[])) {
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

export async function reviewShot(ctx: ToolContext, a: Args): Promise<ToolResult> {
  const { data: shot } = await ctx.admin.from('campaign_shots').select('*').eq('id', a.shot_id).eq('user_id', ctx.userId).maybeSingle();
  if (!shot) return err('NOT_FOUND', 'Shot not found.');
  if (!shot.current_generation_id) return err('PREREQUISITE', 'This shot has no generation yet.');

  const out = await runShotQa(ctx.admin, {
    supabaseUrl: ctx.supabaseUrl, jwt: ctx.userJwt, anonKey: ctx.anonKey, internalAuthUserId: ctx.internalAuthUserId,
  }, shot.id);
  if (out.state === 'not_claimed') {
    return { output: { shot_id: shot.id, status: shot.status, client_ready: shot.client_ready, qa_summary: shot.qa_summary, note: 'QA already done, running, or the video is not finished yet.' } };
  }
  if (out.state !== 'final') {
    return err('QA_UNAVAILABLE', `The video is finished; the review is ${out.state === 'qa_pending' ? 'pending and will be retried automatically' : 'failed after several attempts'}. (${out.error})`);
  }
  const p = out.parsed;
  return {
    output: {
      shot_id: shot.id, verdict: p.verdict, client_ready: p.clientReady, overall_score: p.overall, issue_classes: p.issues,
      qa: { scores: p.scores, issues: p.rawIssues },
      next: p.clientReady ? 'Shot is client-ready.' : 'Call prepare_shot_retry to plan an improved attempt within the approved budget.',
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
    .select('*').eq('campaign_id', shot.campaign_id).eq('kind', 'production').in('status', ['approved', 'started'])
    .order('created_at', { ascending: false }).limit(20)
    .then((r: Args) => ({ data: (r.data ?? []).find((ap: Args) => approvedShotIds(ap.scope).has(shot.id)) ?? null }));
  if (!approval) return err('APPROVAL_REQUIRED', 'No active campaign budget approval.');

  const [{ data: campaign }, { data: video }, { data: siblings }, { data: ledger }] = await Promise.all([
    ctx.admin.from('agent_campaigns').select('company_name').eq('id', shot.campaign_id).maybeSingle(),
    ctx.admin.from('campaign_videos').select('id, script, cta, visual_style').eq('id', shot.video_id).maybeSingle(),
    ctx.admin.from('campaign_shots').select('id, selected_model').eq('video_id', shot.video_id),
    ctx.admin.from('campaign_spend_ledger').select('entry_type, amount').eq('approval_id', approval.id),
  ]);
  const linkedAssetId = shot.input_asset_id ?? shot.asset_id ?? null;
  const { data: linkedAsset } = linkedAssetId
    ? await ctx.admin.from('campaign_assets').select('id, reuse_status').eq('id', linkedAssetId).maybeSingle()
    : { data: null };
  const currency = (await resolveWalletCurrency(ctx.admin, ctx.userId)) ?? 'EUR';
  const discount = await resolveAccountDiscountFactor(ctx.admin, ctx.userId);
  const stats = await loadStats(ctx);

  const plan = planRetry({
    shot: {
      ...shot,
      risk: {
        motion_complexity: Number(shot.motion_complexity ?? 0), human_anatomy_risk: Number(shot.human_anatomy_risk ?? 0),
        physics_risk: Number(shot.physics_risk ?? 0), identity_consistency_requirement: Number(shot.identity_consistency_requirement ?? 0),
        text_requirement: Number(shot.text_requirement ?? 0), reference_strength: Number(shot.reference_strength ?? 1),
      },
      category: shot.content_category ?? categorizeShot(shot),
      visual_style: video?.visual_style ?? null,
    },
    linkedAsset: linkedAsset ?? null,
    stats,
    pricePerSecond: (pid) => {
      const list = resolveCostPerSecond(pid, currency);
      return list == null ? null : Math.round(list * 100) / 100;
    },
    neighborModels: [],
  });
  if (!plan.best) return err('NO_MODEL', 'No certified model supports this shot at the required quality tier.');
  const best = plan.best;
  const retryCost = best.estimated_cost == null ? null : Math.round(best.estimated_cost * discount * 100) / 100;
  if (retryCost == null || retryCost <= 0) return err('PRICING_UNAVAILABLE', `No canonical price for ${best.model} ${best.resolution}.`);

  const change = materialChanges(
    { model: shot.selected_model, mode: shot.generation_mode, asset: shot.input_asset_id ?? null, duration: Number(shot.duration_s), motion_plan: plan.rewrite.previous_motion_plan },
    { model: best.model, mode: plan.mode, asset: plan.mode === 'i2v' ? plan.asset?.id ?? shot.input_asset_id ?? null : null, duration: best.duration,
      motion_plan: plan.rewrite.motion_plan, subject_reduced: plan.rewrite.subject_reduced, structural_rules: plan.rewrite.structural_rules },
  );
  if (!change.material) return err('TRIVIAL_RETRY', 'The proposed retry only rewords the prompt; nothing material changes. Nothing was stored.');

  const sum = (t: string) => (ledger ?? []).filter((l: Args) => l.entry_type === t).reduce((x: number, l: Args) => x + Number(l.amount), 0);
  const spent = sum('charge') - sum('refund');
  const outstanding = Math.max(0, sum('reserve') - sum('charge') - sum('release'));
  const scopeEntry = (approval.scope as Args[]).find((x) => x.shot_id === shot.id) ?? null;
  const fit = budgetFit({
    originalCost: Number(scopeEntry?.price ?? shot.estimated_cost ?? 0), retryCost,
    maxTotal: Number(approval.max_total), spent, outstanding,
    attempts: Number(shot.attempt_count), retryBudgetPerShot: Number(approval.retry_budget_per_shot),
    scope: scopeEntry, proposed: { model: best.model, duration: best.duration, resolution: best.resolution },
  });
  const improvement = predictImprovement({
    classes: plan.classes, rewrite: plan.rewrite, changed: change.changed,
    oldModel: shot.selected_model, newModel: best.model, category: shot.content_category ?? 'product', mode: plan.mode, stats,
  });
  const post = buildPostProduction({
    script: video?.script ?? null, ctaFallback: video?.cta ?? null, company: campaign?.company_name ?? '',
    shot, shotCount: (siblings ?? []).length || 1, model: best.model, textFailure: !!plan.classes.text_branding,
  });

  const retryPlan = {
    version: 1,
    prepared_at: new Date().toISOString(),
    original: { model: shot.selected_model, mode: shot.generation_mode, duration_s: Number(shot.duration_s), resolution: shot.resolution, prompt: shot.english_prompt, negative: shot.negative_constraints, qa_overall: shot.qa_summary?.overall ?? null },
    failure_classes: plan.classes,
    raised_risk: plan.risk,
    proposed: { model: best.model, model_name: best.displayName, mode: plan.mode, duration_s: best.duration, resolution: best.resolution, input_asset_id: plan.mode === 'i2v' ? plan.asset?.id ?? shot.input_asset_id ?? null : null, mode_note: plan.modeNote },
    model_changed: best.model !== shot.selected_model,
    ranking: plan.ranked.slice(0, 4).map((c) => ({ model: c.model, total: c.scores.total, quality: c.scores.quality, confidence: c.confidence, cost: c.estimated_cost })),
    revised_prompt: plan.rewrite.prompt,
    negative_constraints: plan.rewrite.negative,
    motion_plan: { before: plan.rewrite.previous_motion_plan, after: plan.rewrite.motion_plan },
    material_changes: change.changed,
    cost: { ...fit, currency, pricing_version: CATALOG_VERSION },
    predicted_improvement: improvement,
    post_production: post,
  };

  await ctx.admin.from('campaign_shots').update({
    retry_prompt: plan.rewrite.prompt, retry_model: best.model,
    retry_reason: `QA ${shot.qa_summary?.overall ?? '?'}/10 — ${Object.keys(plan.classes).join(', ')}; changes: ${change.changed.join(', ')}`,
    retry_prepared_at: retryPlan.prepared_at,
    retry_plan: retryPlan,
    post_production: post,
  }).eq('id', shot.id);
  // Video-level requirements: written once, never overwritten by later retries.
  await ctx.admin.from('campaign_videos').update({
    post_production: {
      voiceover_required: post.voiceover_required, voiceover_language: post.voiceover_language, voiceover_script: post.voiceover_script,
      voiceover_source: post.voiceover_source, music_direction: post.music_direction, cta_text: video?.script?.cta ?? video?.cta ?? null,
      brand_name_overlay: campaign?.company_name ?? null, overlay_text: video?.script?.on_screen_text ?? [], subtitles_required: post.subtitles_required,
    },
  }).eq('id', shot.video_id).is('post_production', null);

  return {
    output: {
      shot_id: shot.id, retry_prepared: true, ...retryPlan,
      retry_mode: approval.retry_mode,
      note: fit.requires_new_approval
        ? `Prepared only. ${fit.note} Nothing was started or charged.`
        : approval.retry_mode === 'auto_retry_within_budget'
          ? 'The production worker will execute this retry automatically within the approved budget.'
          : 'Ask the user to confirm, then call retry_shot in the foreground.',
    },
  };
}

// ---------------------------------------------------------------------------
// retry_shot (paid). Foreground for manual_retry; worker for auto mode.
// ---------------------------------------------------------------------------

async function referenceUrlsFor(ctx: ToolContext, shot: Args): Promise<string[]> {
  const p = shot?.retry_plan?.proposed;
  if (p?.mode !== 'i2v' || !p?.input_asset_id) return [];
  const { data: asset } = await ctx.admin.from('campaign_assets').select('url, reuse_status').eq('id', p.input_asset_id).maybeSingle();
  return asset?.reuse_status === 'reuse_ok' && asset.url ? [String(asset.url)] : [];
}

/** Exact request + plan fingerprint + cost for the shot's NEXT attempt, from the stored retry plan. */
async function currentRetryTarget(ctx: ToolContext, shot: Args): Promise<
  | { ok: true; request: RetryRequest; fingerprint: string; attemptNo: number; cost: number; currency: string }
  | { ok: false; result: ToolResult }
> {
  if (shot.status !== 'needs_retry' || !shot.retry_prompt || !shot.retry_plan?.proposed) {
    return { ok: false, result: err('INVALID_STATE', 'No prepared retry for this shot. Call prepare_shot_retry first.') };
  }
  const spec = getMuseModel(String(shot.retry_plan.proposed.model));
  if (!spec) return { ok: false, result: err('UNKNOWN_MODEL', `Unknown model "${shot.retry_plan.proposed.model}".`) };
  const request = buildRetryRequest(shot, spec.edgeFunction, await referenceUrlsFor(ctx, shot));
  if (!request) return { ok: false, result: err('INVALID_STATE', 'The stored retry plan is incomplete.') };
  if (request.model === shot.selected_model && request.prompt === shot.english_prompt) {
    return { ok: false, result: err('IDENTICAL_RETRY', 'An identical re-run is refused; the retry must change the prompt or the model.') };
  }
  const cost = Number(shot.retry_plan?.cost?.retry_cost);
  if (!(cost > 0)) return { ok: false, result: err('PRICING_UNAVAILABLE', 'The retry plan has no canonical cost.') };
  const currency = (await resolveWalletCurrency(ctx.admin, ctx.userId)) ?? '';
  if (!currency) return { ok: false, result: err('WALLET_CURRENCY_UNKNOWN', 'The wallet currency could not be determined.') };
  return { ok: true, request, fingerprint: await planFingerprint(shot, request), attemptNo: Number(shot.attempt_count) + 1, cost, currency };
}

// ---------------------------------------------------------------------------
// request_retry_approval (free): ONE pending approval bound to one shot attempt
// ---------------------------------------------------------------------------

export async function requestShotRetryApproval(ctx: ToolContext, a: Args): Promise<ToolResult> {
  const { data: shot } = await ctx.admin.from('campaign_shots').select('*').eq('id', a.shot_id).eq('user_id', ctx.userId).maybeSingle();
  if (!shot) return err('NOT_FOUND', 'Shot not found.');
  const t = await currentRetryTarget(ctx, shot);
  if (!t.ok) return t.result;
  if (String(shot.retry_plan?.cost?.pricing_version ?? '') !== CATALOG_VERSION) {
    return err('PRICE_CHANGED', 'Prices changed since this retry was planned. Run prepare_shot_retry again.');
  }
  const binding: RetryBinding = {
    campaign_id: shot.campaign_id, shot_id: shot.id, attempt_no: t.attemptNo,
    plan_prepared_at: String(shot.retry_plan.prepared_at), plan_fingerprint: t.fingerprint,
    request: t.request, currency: t.currency, max_cost: t.cost, estimated_cost: t.cost, pricing_version: CATALOG_VERSION,
  };
  const now = Date.now();
  const { data: approval, error } = await ctx.admin.from('campaign_budget_approvals').insert({
    campaign_id: shot.campaign_id, user_id: ctx.userId, conversation_id: ctx.conversationId || null,
    kind: 'retry', retry_binding: binding,
    scope: [{ shot_id: shot.id, model: t.request.model, duration_s: t.request.duration_s, resolution: t.request.resolution, price: t.cost }],
    estimated_total: t.cost, max_total: t.cost, retry_budget_per_shot: 0, retry_mode: 'manual_retry', status: 'pending',
    pricing_version: CATALOG_VERSION,
    start_expires_at: new Date(now + 30 * 60_000).toISOString(),
    execution_expires_at: new Date(now + 24 * 60 * 60_000).toISOString(),
  }).select('id, start_expires_at, execution_expires_at').single();
  if (error || !approval) return err('DB_ERROR', error?.message ?? 'Could not create the retry approval.');
  return {
    output: {
      campaign_approval_required: true, kind: 'retry', campaign_approval_id: approval.id, campaign_id: shot.campaign_id,
      shot_id: shot.id, attempt_no: t.attemptNo, model: t.request.model, provider: t.request.provider,
      duration_s: t.request.duration_s, resolution: t.request.resolution, mode: t.request.mode,
      shots: [{ shot_id: shot.id, model: t.request.model, duration_s: t.request.duration_s, resolution: t.request.resolution, price: t.cost }],
      estimated_total: t.cost, max_total: t.cost, retry_budget_per_shot: 0, retry_mode: 'manual_retry', currency: t.currency,
      start_expires_at: approval.start_expires_at, execution_expires_at: approval.execution_expires_at,
      next_step: 'STOP. Show this single-shot retry approval to the user. retry_shot is refused until the user confirms it in the UI.',
    },
  };
}

// ---------------------------------------------------------------------------
// retry_shot (paid, foreground only): needs a retry approval bound to exactly
// this campaign, shot, attempt, request and plan version. Consumed atomically.
// ---------------------------------------------------------------------------

export async function retryShot(ctx: ToolContext, a: Args, opts: { fromWorker?: boolean } = {}): Promise<ToolResult> {
  const { data: shot } = await ctx.admin.from('campaign_shots').select('*').eq('id', a.shot_id).eq('user_id', ctx.userId).maybeSingle();
  if (!shot) return err('NOT_FOUND', 'Shot not found.');
  if (opts.fromWorker) return err('TOOL_NOT_ALLOWED', 'Retries need a single-shot retry approval confirmed in the foreground.');
  const t = await currentRetryTarget(ctx, shot);
  if (!t.ok) return t.result;

  let approval: Args = null;
  if (a.approval_id) approval = await loadBudgetApproval(ctx, a.approval_id);
  else {
    const { data } = await ctx.admin.from('campaign_budget_approvals').select('*')
      .eq('campaign_id', shot.campaign_id).eq('user_id', ctx.userId).eq('kind', 'retry')
      .order('created_at', { ascending: false }).limit(20);
    approval = (data ?? []).find((ap: Args) => ap.retry_binding?.shot_id === shot.id) ?? null;
  }
  if (!approval) {
    return err('UNBOUND_APPROVAL', 'No confirmed retry approval for exactly this shot attempt. Earlier campaign approvals do not cover new attempts. Call request_retry_approval and wait for the user to confirm.');
  }
  const check = checkRetryBinding({
    approval, campaignId: shot.campaign_id, shotId: shot.id, attemptNo: t.attemptNo, request: t.request,
    fingerprint: t.fingerprint, currency: t.currency, cost: t.cost, pricingVersion: CATALOG_VERSION,
  });
  if (!check.ok) {
    return err(check.code, `This retry approval does not cover the current attempt (${check.code}${check.field ? `: ${check.field}` : ''}). A new approval is required.`);
  }
  // Atomic single use: two parallel starts can never both pass.
  const { data: consumed, error: consumeErr } = await ctx.admin.rpc('consume_retry_approval', {
    _approval_id: approval.id, _user_id: ctx.userId, _shot_id: shot.id, _attempt_no: t.attemptNo, _plan_fingerprint: t.fingerprint,
  });
  if (consumeErr) return err('DB_ERROR', consumeErr.message);
  if (consumed !== true) return err('APPROVAL_CONSUMED', 'This retry approval was already used or is no longer valid.');

  const patched = { ...shot, selected_model: t.request.model, estimated_cost: t.cost };
  const r = await dispatchShot(ctx, { ...approval, status: 'started' }, patched, t.attemptNo, {
    prompt: t.request.prompt, model: t.request.model, body: toProviderBody(t.request),
  });
  if (!r.output?.error) {
    await ctx.admin.from('campaign_shots').update({ selected_model: t.request.model, english_prompt: t.request.prompt }).eq('id', shot.id);
  }
  return r;
}

// ---------------------------------------------------------------------------
// get_campaign_production_status (free)
// ---------------------------------------------------------------------------

export async function productionStatus(ctx: ToolContext, a: Args): Promise<ToolResult> {
  const c = await loadCampaign(ctx, a.campaign_id);
  if (!c) return err('NOT_FOUND', 'Campaign not found.');
  // Ledger rows carry no campaign id; scope them to this campaign's shots.
  const { data: shotIdRows } = await ctx.admin.from('campaign_shots').select('id').eq('campaign_id', c.id);
  const shotIds = (shotIdRows ?? []).map((r: { id: string }) => r.id);
  const [shots, approvals, ledger] = await Promise.all([
    ctx.admin.from('campaign_shots').select('id, video_id, shot_index, status, selected_model, estimated_cost, client_ready, attempt_count, qa_summary, current_generation_id, retry_plan').eq('campaign_id', c.id).order('shot_index'),
    ctx.admin.from('campaign_budget_approvals').select('id, kind, status, estimated_total, max_total, spent_total, retry_mode, retry_budget_per_shot, start_expires_at, execution_expires_at, retry_binding').eq('campaign_id', c.id).order('created_at', { ascending: false }).limit(5),
    ctx.admin.from('campaign_spend_ledger').select('entry_type, amount, shot_id, approval_id, created_at').in('shot_id', shotIds.length ? shotIds : ['00000000-0000-0000-0000-000000000000']).order('created_at', { ascending: false }).limit(50),
  ]);
  const { data: wallet } = await ctx.admin.from('ai_video_wallets').select('currency').eq('user_id', ctx.userId).maybeSingle();
  const byStatus: Record<string, number> = {};
  for (const s of shots.data ?? []) byStatus[s.status] = (byStatus[s.status] ?? 0) + 1;
  return {
    output: {
      campaign_id: c.id, stage: c.stage,
      shots_total: shots.data?.length ?? 0, by_status: byStatus,
      shots: shots.data, approvals: approvals.data, recent_ledger: ledger.data,
      currency: wallet?.currency ?? null, // campaign amounts are in the funding wallet's currency
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

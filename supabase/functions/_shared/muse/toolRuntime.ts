/**
 * Execution layer for the Muse tools.
 *
 * Every tool is a thin, ownership-scoped wrapper around infrastructure that
 * already exists in AdTool. No provider integration, no pricing table and no
 * wallet arithmetic is duplicated here: generation goes through the existing
 * `generate-*-video` Edge Functions, which own capability gating, the canonical
 * pricing catalog and the wallet RPCs.
 */

import { MUSE_VIDEO_MODELS, getMuseModel } from './videoModelCatalog.ts';
import { resolveCostPerSecond } from '../videoPricingCatalog.ts';
import { resolveAccountDiscountFactor, resolveWalletCurrency } from '../accountVideoPricing.ts';
import { createMuseResponse } from './museClient.ts';
import type { MuseConfig } from './config.ts';
import { executeCampaignTool } from './campaign/runtime.ts';

export interface ToolContext {
  userId: string;
  conversationId: string;
  /** Service-role client — used for reads and for recording agent operations. */
  // deno-lint-ignore no-explicit-any
  admin: any;
  /** The caller's JWT — forwarded so generation runs as the real user. */
  userJwt: string;
  supabaseUrl: string;
  anonKey: string;
  museConfig: MuseConfig;
  /** How many regenerations have already run in this conversation. */
  regenerationsUsed: number;
  maxRegenerations: number;
  maxTurnSpend: number;
  spentThisTurn: number;
  /** Set only by the background resume worker (service key + user id header). */
  internalAuthUserId?: string;
}

export interface ToolResult {
  // deno-lint-ignore no-explicit-any
  output: any;
  generationId?: string;
  estimatedCost?: number;
  estimatedCostCurrency?: string;
}

const RESOLUTION_DEFAULT = '720p';

// ---------------------------------------------------------------------------
// Pricing helpers — canonical catalog only, fail closed.
// ---------------------------------------------------------------------------

function resolvePricingId(modelId: string, resolution?: string): string | null {
  const spec = getMuseModel(modelId);
  if (!spec) return null;
  const wanted = (resolution ?? '').toLowerCase();
  for (const mode of Object.values(spec.modes)) {
    for (const res of mode.resolutions) {
      if (!res.pricingId) continue;
      if (!wanted || res.label.toLowerCase() === wanted) return res.pricingId;
    }
  }
  // Requested resolution unknown for this model → first priced resolution.
  for (const mode of Object.values(spec.modes)) {
    for (const res of mode.resolutions) if (res.pricingId) return res.pricingId;
  }
  return null;
}

async function priceGeneration(
  ctx: ToolContext,
  modelId: string,
  duration: number,
  resolution?: string,
): Promise<
  | { ok: true; total: number; perSecond: number; currency: 'EUR' | 'USD'; pricingId: string }
  | { ok: false; error: string; code: string }
> {
  const currency = await resolveWalletCurrency(ctx.admin, ctx.userId);
  if (!currency) {
    return { ok: false, code: 'WALLET_CURRENCY_UNKNOWN', error: 'The wallet currency could not be determined. Nothing was charged.' };
  }
  const pricingId = resolvePricingId(modelId, resolution);
  if (!pricingId) {
    return { ok: false, code: 'PRICING_UNAVAILABLE', error: `No canonical price exists for model "${modelId}".` };
  }
  const listPerSecond = resolveCostPerSecond(pricingId, currency);
  if (listPerSecond == null) {
    return { ok: false, code: 'PRICING_UNAVAILABLE', error: `No canonical price exists for "${pricingId}".` };
  }
  const discount = await resolveAccountDiscountFactor(ctx.admin, ctx.userId);
  const perSecond = Math.round(listPerSecond * 100) / 100;
  const total = Math.round(perSecond * duration * discount * 100) / 100;
  return { ok: true, total, perSecond, currency, pricingId };
}

async function walletBalance(ctx: ToolContext): Promise<{ balance: number; currency: string } | null> {
  const { data } = await ctx.admin
    .from('ai_video_wallets')
    .select('balance_euros, currency')
    .eq('user_id', ctx.userId)
    .maybeSingle();
  if (!data) return null;
  return { balance: Number(data.balance_euros ?? 0), currency: data.currency ?? 'EUR' };
}

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

async function getUserContext(ctx: ToolContext): Promise<ToolResult> {
  const [{ data: profile }, { data: brandKit }, { data: media }, wallet] = await Promise.all([
    ctx.admin.from('profiles').select('plan, brand_name, language').eq('id', ctx.userId).maybeSingle(),
    ctx.admin
      .from('brand_kits')
      .select('brand_name, industry, primary_color, secondary_color, accent_color, color_palette, mood, brand_tone, brand_values, target_audience, style_direction, keywords, website_url')
      .eq('user_id', ctx.userId)
      .eq('is_active', true)
      .is('archived_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    ctx.admin
      .from('media_library')
      .select('id, file_name, file_url, file_type, description, created_at')
      .eq('user_id', ctx.userId)
      .order('created_at', { ascending: false })
      .limit(10),
    walletBalance(ctx),
  ]);

  return {
    output: {
      plan: profile?.plan ?? 'free',
      language: profile?.language ?? null,
      brand_kit: brandKit ?? null,
      wallet: wallet ? { balance: wallet.balance, currency: wallet.currency } : null,
      recent_media: (media ?? []).map((m: Record<string, unknown>) => ({
        id: m.id,
        name: m.file_name,
        url: m.file_url,
        type: m.file_type,
        description: m.description,
      })),
    },
  };
}

async function getAvailableVideoModels(ctx: ToolContext, args: { family?: string }): Promise<ToolResult> {
  const currency = (await resolveWalletCurrency(ctx.admin, ctx.userId)) ?? 'EUR';
  const discount = await resolveAccountDiscountFactor(ctx.admin, ctx.userId);

  const models = MUSE_VIDEO_MODELS.filter((m) => !args.family || m.family === args.family).map((m) => {
    const modes = Object.entries(m.modes).map(([mode, spec]) => ({
      mode,
      durations: spec.durations,
      aspect_ratios: spec.aspectRatios,
      native_audio: spec.audio,
      inputs: Object.keys(spec.inputs ?? {}),
      resolutions: spec.resolutions.map((r) => {
        const list = r.pricingId ? resolveCostPerSecond(r.pricingId, currency) : null;
        return {
          label: r.label,
          price_per_second: list == null ? null : Math.round(Math.round(list * 100) / 100 * discount * 100) / 100,
        };
      }),
    }));
    return {
      id: m.id,
      name: m.displayName,
      provider: m.provider,
      family: m.family,
      tier: m.uiGroup,
      modes,
    };
  });

  return { output: { currency, discount_factor: discount, models } };
}

const APPROVAL_PENDING_MINUTES = 30;
const APPROVAL_VALID_MINUTES = 15;
const RETRY_WINDOW_MINUTES = 120;

function normRes(r?: string | null): string {
  return String(r ?? RESOLUTION_DEFAULT).trim().toLowerCase();
}

async function estimateVideoCost(
  ctx: ToolContext,
  args: { model: string; duration: number; resolution?: string; retry_budget?: number },
): Promise<ToolResult> {
  const spec = getMuseModel(args.model);
  if (!spec) return { output: { error: `Unknown model "${args.model}".`, code: 'UNKNOWN_MODEL' } };
  const duration = Number(args.duration);
  if (!Number.isFinite(duration) || duration <= 0 || duration > 60) {
    return { output: { error: 'Invalid duration.', code: 'INVALID_DURATION' } };
  }
  const priced = await priceGeneration(ctx, args.model, duration, args.resolution);
  if (!priced.ok) return { output: { error: priced.error, code: priced.code } };
  const wallet = await walletBalance(ctx);
  const retryBudget = Math.max(0, Math.min(ctx.maxRegenerations, Math.floor(Number(args.retry_budget ?? 0)) || 0));
  const maxTotal = Math.round(priced.total * (1 + retryBudget) * 100) / 100;
  const resolution = normRes(args.resolution);

  const { data: approval, error } = await ctx.admin
    .from('agent_generation_approvals')
    .insert({
      user_id: ctx.userId,
      conversation_id: ctx.conversationId,
      model: args.model,
      duration_seconds: duration,
      resolution,
      pricing_id: priced.pricingId,
      cost: priced.total,
      currency: priced.currency,
      retry_budget: retryBudget,
      max_total_cost: maxTotal,
      status: 'pending',
      expires_at: new Date(Date.now() + APPROVAL_PENDING_MINUTES * 60_000).toISOString(),
    })
    .select('id, expires_at')
    .single();
  if (error || !approval) {
    return { output: { error: 'Could not create the approval request. Nothing was charged.', code: 'APPROVAL_ERROR' } };
  }

  return {
    output: {
      approval_required: true,
      approval_id: approval.id,
      approval_status: 'pending',
      approval_expires_at: approval.expires_at,
      model: args.model,
      model_name: spec.displayName,
      duration,
      resolution,
      price_per_second: priced.perSecond,
      total_cost: priced.total,
      retry_budget: retryBudget,
      max_total_cost: maxTotal,
      currency: priced.currency,
      wallet_balance: wallet?.balance ?? null,
      sufficient_credits: wallet ? wallet.balance >= priced.total : false,
      next_step:
        'STOP. Show this quote to the user. The user must press Confirm in the AdTool UI. generate_video will be refused until then.',
    },
  };
}

// ---------------------------------------------------------------------------
// Approval gate — server-side, independent of the system prompt.
// ---------------------------------------------------------------------------

// deno-lint-ignore no-explicit-any
type ApprovalRow = any;

async function loadApproval(ctx: ToolContext, approvalId: unknown): Promise<ApprovalRow | null> {
  if (typeof approvalId !== 'string' || !/^[0-9a-f-]{36}$/i.test(approvalId)) return null;
  const { data } = await ctx.admin
    .from('agent_generation_approvals')
    .select('*')
    .eq('id', approvalId)
    .eq('user_id', ctx.userId)
    .eq('conversation_id', ctx.conversationId)
    .maybeSingle();
  return data ?? null;
}

function approvalRequired(reason: string, extra: Record<string, unknown> = {}) {
  return {
    output: {
      error: `${reason} Nothing was started and nothing was charged. Call estimate_video_cost and wait for the user to press Confirm.`,
      code: 'APPROVAL_REQUIRED',
      ...extra,
    },
  };
}

function paramsMatch(a: ApprovalRow, model: string, duration: number, resolution: string): boolean {
  return a.model === model && Number(a.duration_seconds) === Number(duration) && a.resolution === normRes(resolution);
}

/** Atomically consumes a fresh (approved, unexpired) approval. */
async function consumeFreshApproval(ctx: ToolContext, a: ApprovalRow): Promise<boolean> {
  const { data } = await ctx.admin
    .from('agent_generation_approvals')
    .update({ status: 'consumed', consumed_at: new Date().toISOString() })
    .eq('id', a.id)
    .eq('user_id', ctx.userId)
    .eq('status', 'approved')
    .gt('expires_at', new Date().toISOString())
    .select('id');
  return Array.isArray(data) && data.length === 1;
}

/** Atomically claims one retry from the approved retry budget. */
async function claimRetry(ctx: ToolContext, a: ApprovalRow): Promise<boolean> {
  const { data } = await ctx.admin
    .from('agent_generation_approvals')
    .update({ retries_used: Number(a.retries_used) + 1 })
    .eq('id', a.id)
    .eq('user_id', ctx.userId)
    .eq('status', 'consumed')
    .eq('retries_used', a.retries_used)
    .lt('retries_used', a.retry_budget)
    .select('id');
  return Array.isArray(data) && data.length === 1;
}

async function attachGeneration(ctx: ToolContext, approvalId: string, generationId: string) {
  const { data } = await ctx.admin
    .from('agent_generation_approvals')
    .select('generation_ids')
    .eq('id', approvalId)
    .maybeSingle();
  await ctx.admin
    .from('agent_generation_approvals')
    .update({ generation_ids: Array.from(new Set([...(data?.generation_ids ?? []), generationId])) })
    .eq('id', approvalId);
}

interface GenerateArgs {
  model: string;
  prompt: string;
  duration: number;
  aspect_ratio: string;
  resolution?: string;
  generate_audio?: boolean;
  start_image_url?: string;
  negative_prompt?: string;
  approval_id?: string;
}

type GateMode = { kind: 'fresh' } | { kind: 'retry' };

async function dispatchGeneration(
  ctx: ToolContext,
  args: GenerateArgs,
  gate: GateMode = { kind: 'fresh' },
): Promise<ToolResult> {
  const spec = getMuseModel(args.model);
  if (!spec) {
    return { output: { error: `Unknown model "${args.model}". Call get_available_video_models first.`, code: 'UNKNOWN_MODEL' } };
  }

  // --- Budget safeguards, BEFORE anything is dispatched -------------------
  const priced = await priceGeneration(ctx, args.model, args.duration, args.resolution);
  if (!priced.ok) return { output: { error: priced.error, code: priced.code } };

  // --- Hard approval gate ------------------------------------------------
  const approval = await loadApproval(ctx, args.approval_id);
  if (!approval) return approvalRequired('No valid approval_id for this generation.');
  if (!paramsMatch(approval, args.model, args.duration, args.resolution ?? RESOLUTION_DEFAULT)) {
    return approvalRequired('The approved model/duration/resolution do not match this request.', {
      approved: { model: approval.model, duration: Number(approval.duration_seconds), resolution: approval.resolution },
    });
  }
  if (Number(approval.cost) !== priced.total || approval.currency !== priced.currency) {
    return approvalRequired('The price changed since the user approved it.', {
      approved_cost: Number(approval.cost),
      current_cost: priced.total,
    });
  }
  if (gate.kind === 'fresh') {
    if (approval.status !== 'approved') {
      return approvalRequired(
        approval.status === 'pending' ? 'The user has not confirmed this cost yet.' : `Approval is ${approval.status} and cannot be reused.`,
      );
    }
    if (new Date(approval.expires_at).getTime() <= Date.now()) return approvalRequired('The approval has expired.');
  } else {
    if (approval.status !== 'consumed' || Number(approval.retries_used) >= Number(approval.retry_budget)) {
      return approvalRequired('No approved retry budget is left for this task.');
    }
    const windowEnd = new Date(approval.consumed_at ?? approval.approved_at).getTime() + RETRY_WINDOW_MINUTES * 60_000;
    if (Date.now() > windowEnd) return approvalRequired('The approved retry window has expired.');
  }

  const wallet = await walletBalance(ctx);
  if (!wallet) {
    return { output: { error: 'No AI video wallet found for this account.', code: 'NO_WALLET' } };
  }
  if (wallet.balance < priced.total) {
    return {
      output: {
        error: 'Insufficient credits — nothing was started and nothing was charged.',
        code: 'INSUFFICIENT_CREDITS',
        required: priced.total,
        available: wallet.balance,
        currency: priced.currency,
      },
      estimatedCost: priced.total,
      estimatedCostCurrency: priced.currency,
    };
  }
  if (ctx.spentThisTurn + priced.total > ctx.maxTurnSpend) {
    return {
      output: {
        error: `Agent spend limit for this task reached (${ctx.maxTurnSpend} ${priced.currency}). Ask the user to confirm and start again.`,
        code: 'AGENT_BUDGET_CAP',
        already_committed: ctx.spentThisTurn,
        requested: priced.total,
      },
      estimatedCost: priced.total,
      estimatedCostCurrency: priced.currency,
    };
  }

  // Claim the approval atomically right before dispatch (single use).
  const claimed = gate.kind === 'fresh' ? await consumeFreshApproval(ctx, approval) : await claimRetry(ctx, approval);
  if (!claimed) return approvalRequired('The approval was already used or expired.');

  // --- Dispatch through the existing generation Edge Function -------------
  const body: Record<string, unknown> = {
    model: args.model,
    prompt: args.prompt,
    duration: args.duration,
    aspectRatio: args.aspect_ratio,
    resolution: args.resolution ?? RESOLUTION_DEFAULT,
  };
  if (args.generate_audio != null) body.generateAudio = args.generate_audio;
  if (args.start_image_url) body.startImageUrl = args.start_image_url;
  if (args.negative_prompt) body.negativePrompt = args.negative_prompt;

  const res = await fetch(`${ctx.supabaseUrl}/functions/v1/${spec.edgeFunction}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${ctx.userJwt}`,
      apikey: ctx.anonKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  // deno-lint-ignore no-explicit-any
  let parsed: any = {};
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = { raw: text.slice(0, 400) };
  }

  if (!res.ok) {
    return {
      output: {
        error: parsed.error ?? `Generation failed (HTTP ${res.status}).`,
        code: parsed.code ?? 'GENERATION_FAILED',
        status: res.status,
      },
      estimatedCost: priced.total,
      estimatedCostCurrency: priced.currency,
    };
  }

  const generationId = parsed.generationId ?? parsed.generation_id ?? parsed.id ?? null;
  if (generationId) await attachGeneration(ctx, approval.id, generationId);
  return {
    output: {
      started: true,
      generation_id: generationId,
      model: args.model,
      duration: args.duration,
      charged_estimate: priced.total,
      currency: priced.currency,
      approval_id: approval.id,
      retries_remaining: Number(approval.retry_budget) - Number(approval.retries_used) - (gate.kind === 'retry' ? 1 : 0),
      status: parsed.status ?? 'processing',
    },
    generationId: generationId ?? undefined,
    estimatedCost: priced.total,
    estimatedCostCurrency: priced.currency,
  };
}

async function getVideoStatus(ctx: ToolContext, args: { generation_id: string }): Promise<ToolResult> {
  const { data, error } = await ctx.admin
    .from('ai_video_generations')
    .select('id, status, video_url, thumbnail_url, error_message, model, duration_seconds, created_at, completed_at')
    .eq('id', args.generation_id)
    .eq('user_id', ctx.userId)
    .maybeSingle();

  if (error || !data) {
    return { output: { error: 'No generation with that id belongs to this account.', code: 'NOT_FOUND' } };
  }
  return {
    output: {
      generation_id: data.id,
      status: data.status,
      video_url: data.video_url,
      thumbnail_url: data.thumbnail_url,
      error_message: data.error_message,
      model: data.model,
      duration: data.duration_seconds,
    },
  };
}

async function analyzeVideo(ctx: ToolContext, generationId: string, intent: string): Promise<ToolResult> {
  const res = await fetch(`${ctx.supabaseUrl}/functions/v1/agent-video-qa`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${ctx.userJwt}`,
      apikey: ctx.anonKey,
      'Content-Type': 'application/json',
      ...(ctx.internalAuthUserId ? { 'x-agent-user-id': ctx.internalAuthUserId } : {}),
    },
    body: JSON.stringify({ generation_id: generationId, intent }),
  });
  // deno-lint-ignore no-explicit-any
  let body: any = {};
  try {
    body = await res.json();
  } catch {
    body = {};
  }
  if (!res.ok) {
    return {
      output: {
        analysis_available: false,
        error: body.error ?? `Video QA failed (HTTP ${res.status}).`,
        code: body.code ?? 'QA_UNAVAILABLE',
      },
    };
  }
  return { output: body };
}

async function analyzeAsset(
  ctx: ToolContext,
  args: { asset_url?: string; intent: string; generation_id?: string },
): Promise<ToolResult> {
  const isVideo = !!args.generation_id || /\.(mp4|mov|webm|m4v)(\?|$)/i.test(args.asset_url ?? '');

  if (isVideo) {
    if (!args.generation_id) {
      return {
        output: {
          analysis_available: false,
          error: 'Full video QA needs the generation_id of an AdTool generation.',
          code: 'GENERATION_ID_REQUIRED',
        },
      };
    }
    return await analyzeVideo(ctx, args.generation_id, args.intent);
  }

  if (!args.asset_url) return { output: { error: 'asset_url or generation_id is required.', code: 'INVALID_ARGS' } };

  const response = await createMuseResponse(ctx.museConfig, {
    instructions:
      'You are a meticulous creative director reviewing an AI-generated image for paid social advertising. Be strict and concrete. Answer ONLY with JSON matching: {"verdict":"acceptable"|"needs_work"|"unusable","scores":{"prompt_adherence":0-10,"visual_quality":0-10,"realism":0-10,"consistency":0-10},"artifacts":[string],"text_errors":[string],"social_ad_suitability":string,"improvements":[string]}',
    input: [
      {
        role: 'user',
        content: [
          { type: 'input_text', text: `Intended result: ${args.intent}` },
          { type: 'input_image', image_url: args.asset_url },
        ],
      },
    ],
  });

  // deno-lint-ignore no-explicit-any
  let analysis: any = null;
  try {
    const match = response.outputText.match(/\{[\s\S]*\}/);
    analysis = match ? JSON.parse(match[0]) : null;
  } catch {
    analysis = null;
  }

  return {
    output: {
      analysis_available: true,
      analysis_scope: 'image',
      analysis: analysis ?? { raw: response.outputText },
    },
  };
}

async function regenerateVideo(
  ctx: ToolContext,
  args: {
    previous_generation_id: string;
    prompt: string;
    reason: string;
    approval_id: string;
    negative_prompt?: string;
    model?: string;
    duration?: number;
    aspect_ratio?: string;
    resolution?: string;
  },
): Promise<ToolResult> {
  if (ctx.regenerationsUsed >= ctx.maxRegenerations) {
    return {
      output: {
        error: `Automatic regeneration limit reached (${ctx.maxRegenerations}). Ask the user whether to try again.`,
        code: 'REGENERATION_CAP',
      },
    };
  }

  const { data: previous } = await ctx.admin
    .from('ai_video_generations')
    .select('id, model, duration_seconds, aspect_ratio, resolution')
    .eq('id', args.previous_generation_id)
    .eq('user_id', ctx.userId)
    .maybeSingle();

  if (!previous) {
    return { output: { error: 'No previous generation with that id belongs to this account.', code: 'NOT_FOUND' } };
  }

  const approval = await loadApproval(ctx, args.approval_id);
  if (!approval) return approvalRequired('No valid approval_id for this regeneration.');

  // A retry must belong to the approved task, unless the user approved a new quote.
  const gate: GateMode = approval.status === 'approved' ? { kind: 'fresh' } : { kind: 'retry' };
  if (gate.kind === 'retry' && !(approval.generation_ids ?? []).includes(previous.id)) {
    return approvalRequired('The previous generation is not covered by this approval.');
  }

  const result = await dispatchGeneration(
    ctx,
    {
      model: args.model ?? approval.model,
      prompt: args.prompt,
      duration: args.duration ?? Number(approval.duration_seconds),
      aspect_ratio: args.aspect_ratio ?? previous.aspect_ratio,
      resolution: args.resolution ?? approval.resolution,
      negative_prompt: args.negative_prompt,
      approval_id: approval.id,
    },
    gate,
  );

  return {
    ...result,
    output: { ...result.output, regeneration_of: args.previous_generation_id, reason: args.reason },
  };
}

// ---------------------------------------------------------------------------

export async function executeMuseTool(
  ctx: ToolContext,
  name: string,
  // deno-lint-ignore no-explicit-any
  args: any,
): Promise<ToolResult> {
  switch (name) {
    case 'get_user_context':
      return await getUserContext(ctx);
    case 'get_available_video_models':
      return await getAvailableVideoModels(ctx, args ?? {});
    case 'estimate_video_cost':
      return await estimateVideoCost(ctx, args);
    case 'generate_video':
      return await dispatchGeneration(ctx, args);
    case 'get_video_status':
      return await getVideoStatus(ctx, args);
    case 'analyze_asset':
      return await analyzeAsset(ctx, args);
    case 'regenerate_video':
      return await regenerateVideo(ctx, args);
    default: {
      const campaign = await executeCampaignTool(ctx, name, args);
      if (campaign) return campaign;
      return { output: { error: `Unknown tool "${name}".`, code: 'UNKNOWN_TOOL' } };
    }
  }
}

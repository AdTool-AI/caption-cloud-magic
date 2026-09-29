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

async function estimateVideoCost(
  ctx: ToolContext,
  args: { model: string; duration: number; resolution?: string },
): Promise<ToolResult> {
  const priced = await priceGeneration(ctx, args.model, args.duration, args.resolution);
  if (!priced.ok) return { output: { error: priced.error, code: priced.code } };
  const wallet = await walletBalance(ctx);
  return {
    output: {
      model: args.model,
      duration: args.duration,
      resolution: args.resolution ?? RESOLUTION_DEFAULT,
      price_per_second: priced.perSecond,
      total_cost: priced.total,
      currency: priced.currency,
      wallet_balance: wallet?.balance ?? null,
      sufficient_credits: wallet ? wallet.balance >= priced.total : false,
    },
    estimatedCost: priced.total,
    estimatedCostCurrency: priced.currency,
  };
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
}

async function dispatchGeneration(ctx: ToolContext, args: GenerateArgs): Promise<ToolResult> {
  const spec = getMuseModel(args.model);
  if (!spec) {
    return { output: { error: `Unknown model "${args.model}". Call get_available_video_models first.`, code: 'UNKNOWN_MODEL' } };
  }

  // --- Budget safeguards, BEFORE anything is dispatched -------------------
  const priced = await priceGeneration(ctx, args.model, args.duration, args.resolution);
  if (!priced.ok) return { output: { error: priced.error, code: priced.code } };

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
  return {
    output: {
      started: true,
      generation_id: generationId,
      model: args.model,
      duration: args.duration,
      charged_estimate: priced.total,
      currency: priced.currency,
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

async function analyzeAsset(
  ctx: ToolContext,
  args: { asset_url: string; intent: string; generation_id?: string },
): Promise<ToolResult> {
  let imageUrl = args.asset_url;

  // Videos cannot be sent as an image frame — use the stored thumbnail.
  if (/\.(mp4|mov|webm|m4v)(\?|$)/i.test(args.asset_url)) {
    let thumb: string | null = null;
    if (args.generation_id) {
      const { data } = await ctx.admin
        .from('ai_video_generations')
        .select('thumbnail_url')
        .eq('id', args.generation_id)
        .eq('user_id', ctx.userId)
        .maybeSingle();
      thumb = data?.thumbnail_url ?? null;
    }
    if (!thumb) {
      return {
        output: {
          analysis_available: false,
          reason: 'No still frame is available for this video yet, so it cannot be judged automatically. Ask the user to review it.',
        },
      };
    }
    imageUrl = thumb;
  }

  const response = await createMuseResponse(ctx.museConfig, {
    instructions:
      'You are a meticulous creative director reviewing an AI-generated asset for paid social advertising. Be strict and concrete. Answer ONLY with JSON matching: {"verdict":"acceptable"|"needs_work"|"unusable","scores":{"prompt_adherence":0-10,"visual_quality":0-10,"realism":0-10,"consistency":0-10},"artifacts":[string],"text_errors":[string],"social_ad_suitability":string,"improvements":[string]}',
    input: [
      {
        role: 'user',
        content: [
          { type: 'input_text', text: `Intended result: ${args.intent}` },
          { type: 'input_image', image_url: imageUrl },
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
      analysis: analysis ?? { raw: response.outputText },
      reviewed_frame: imageUrl,
    },
  };
}

async function regenerateVideo(
  ctx: ToolContext,
  args: {
    previous_generation_id: string;
    prompt: string;
    reason: string;
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

  const result = await dispatchGeneration(ctx, {
    model: args.model ?? previous.model,
    prompt: args.prompt,
    duration: args.duration ?? previous.duration_seconds,
    aspect_ratio: args.aspect_ratio ?? previous.aspect_ratio,
    resolution: args.resolution ?? previous.resolution,
  });

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
    default:
      return { output: { error: `Unknown tool "${name}".`, code: 'UNKNOWN_TOOL' } };
  }
}

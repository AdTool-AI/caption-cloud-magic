import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { appendWebhookToken } from "../_shared/webhook-auth.ts";
import { resolveRequestUser } from "../_shared/internalAuth.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import Replicate from "npm:replicate@0.25.2";
import { isQaMockRequest, qaMockResponse } from "../_shared/qaMock.ts"; // [qa-mock-injected]
import { gateVideoCapability, inferMode } from "../_shared/videoCapabilityGate.ts";
import {
  describePreflightViolation,
  preflightVideoRequest,
  type PreflightLocale,
} from "../_shared/videoRequestPreflight.ts";
import { trackAIGeneration, trackBusinessEvent } from "../_shared/telemetry.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS, PUT, DELETE, PATCH",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-qa-mock",
};

// Seedance 2.0 pricing is now sourced from the canonical catalog so the UI
// preview and the deducted amount can never diverge again.
import { resolveCostPerSecond } from "../_shared/videoPricingCatalog.ts";
import { resolveAccountCostPerSecond, pricingUnavailableResponse, resolveWalletCurrency } from "../_shared/accountVideoPricing.ts";

// Replicate model slug per tier
// Verified against https://replicate.com/bytedance (2026-07-21).
// `bytedance/seedance-2-mini` never existed (404) — the correct draft tier is
// seedance-1-lite. Standard/Pro now run on the real Seedance 2.0 family.
const REPLICATE_SLUG: Record<string, string> = {
  'seedance-mini':     'bytedance/seedance-1-lite',
  'seedance-standard': 'bytedance/seedance-2.0-fast',
  'seedance-pro':      'bytedance/seedance-2.0',
};

interface GenerateRequest {
  prompt: string;
  model: 'seedance-mini' | 'seedance-standard' | 'seedance-pro';
  duration: number; // 3-15 seconds
  aspectRatio: '16:9' | '9:16' | '1:1';
  // Image-to-Video
  startImageUrl?: string;
  /** seedance-1-lite (mini): last frame, requires startImageUrl. */
  endImageUrl?: string;
  /**
   * seedance-1-lite (mini): 480p or 720p. Other tiers render 720p.
   * Typed wide on purpose: an unsupported value must reach the capability gate
   * and be rejected with 400, never be rewritten to a supported tier.
   */
  resolution?: string;
  cameraFixed?: boolean;
  seed?: number;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Bond QA Agent: short-circuit on x-qa-mock header (no provider call, no credits)
  if (isQaMockRequest(req)) {
    return qaMockResponse({ corsHeaders, kind: "video" });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? ""
    );

    // Authenticate
    const user = await resolveRequestUser(req, supabaseClient);
    if (!user) throw new Error("Unauthorized");

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const body = await req.json() as GenerateRequest;
    const { prompt, model, duration: requestedDuration, aspectRatio, startImageUrl, endImageUrl } = body;

    const duration = Number(requestedDuration);
    // 'seedance-mini' maps to bytedance/seedance-1-lite — the only tier with 480p.
    const isLite = model === 'seedance-mini';

    // Capability gate — before wallet, before provider. Seedance 1 Lite's
    // 5/10 s enum is enforced, never snapped.
    const gate = await gateVideoCapability(
      supabaseAdmin,
      {
        modelId: model,
        // The REQUESTED tier, verbatim. No rewrite: seedance-mini + 1080p is a
        // 400 INVALID_MODEL_CAPABILITY, never a silent downgrade to 720p.
        resolution: body.resolution,
        mode: inferMode({ modelId: model, startImageUrl, endImageUrl }),
        durationSeconds: duration,
        aspectRatio,
      },
      corsHeaders,
    );
    if (gate.response) return gate.response;

    // Replicate rejects prompts over 4000 characters with a raw 422 — refuse
    // here, before wallet and provider.
    {
      const preLocale = ((req.headers.get("x-locale") ?? "en").slice(0, 2)) as PreflightLocale;
      const pre = preflightVideoRequest({
        modelId: model,
        prompt: String(prompt ?? ""),
        startImageUrl,
        endImageUrl,
      });
      if (!pre.ok && pre.violation) {
        return new Response(
          JSON.stringify({
            error: describePreflightViolation(pre.violation, preLocale, "Seedance"),
            code: pre.code,
            violation: pre.violation.kind,
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    const isImageToVideo = !!startImageUrl;
    const mode = isImageToVideo ? 'Image-to-Video' : 'Text-to-Video';
    console.log(`[generate-seedance-video] Mode: ${mode}`);

    // Get wallet currency
    const currency = await resolveWalletCurrency(supabaseAdmin, user.id);
    if (currency === null) return pricingUnavailableResponse(corsHeaders);

    // Calculate cost from the canonical shared catalog (single source of truth
    // shared with the frontend via /functions/v1/pricing-catalog).
    const costPerSecond = await resolveAccountCostPerSecond(
      supabaseAdmin, user.id, model, currency,
    );
    if (costPerSecond === null) return pricingUnavailableResponse(corsHeaders);
    const totalCost = duration * costPerSecond;
      // [legacy] Per-user video rate limit removed (single unlimited plan).

    // Check wallet balance
    const { data: wallet, error: walletError } = await supabaseAdmin
      .from('ai_video_wallets')
      .select('balance_euros, currency')
      .eq('user_id', user.id)
      .single();

    if (walletError || !wallet) {
      return new Response(
        JSON.stringify({ error: "No AI Video wallet found. Please purchase credits first.", code: "NO_WALLET", needsPurchase: true }),
        { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const currencySymbol = wallet.currency === 'USD' ? '$' : '€';
    if (wallet.balance_euros < totalCost) {
      await trackBusinessEvent('credit_insufficient', user.id, {
        provider: 'seedance', model, required: totalCost,
        available: wallet.balance_euros, currency: wallet.currency,
      }).catch(() => {});
      return new Response(
        JSON.stringify({
          error: `Insufficient credits. Need ${currencySymbol}${totalCost.toFixed(2)}, have ${currencySymbol}${wallet.balance_euros.toFixed(2)}`,
          code: "INSUFFICIENT_CREDITS", needsPurchase: true,
          required: totalCost, available: wallet.balance_euros, currency: wallet.currency
        }),
        { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[generate-seedance-video] Cost: ${currencySymbol}${totalCost.toFixed(2)}, Balance: ${currencySymbol}${wallet.balance_euros.toFixed(2)}`);

    // Create generation record
    // Gate-approved tier label — the gate already rejected anything else.
    const resolution = gate.resolutionLabel ?? body.resolution ?? '720p';
    const { data: generation, error: genError } = await supabaseAdmin
      .from('ai_video_generations')
      .insert({
        ...(gate.parityColumns ?? {}),
        user_id: user.id,
        prompt,
        model,
        duration_seconds: duration,
        aspect_ratio: aspectRatio,
        resolution,
        cost_per_second: costPerSecond,
        total_cost_euros: totalCost,
        status: 'pending',
        source_image_url: startImageUrl || null,
      })
      .select()
      .single();

    if (genError) throw genError;

    // Deduct credits
    const { data: newBalance, error: deductError } = await supabaseAdmin.rpc(
      'deduct_ai_video_credits',
      { p_user_id: user.id, p_amount: totalCost, p_generation_id: generation.id }
    );

    if (deductError || newBalance === null || newBalance === undefined) {
      console.error('[generate-seedance-video] Deduct credits error:', deductError);
      await supabaseAdmin
        .from('ai_video_generations')
        .update({ status: 'failed', error_message: 'Failed to deduct credits' })
        .eq('id', generation.id);
      throw new Error("Failed to deduct credits");
    }

    console.log(`[generate-seedance-video] Credits deducted. New balance: ${currencySymbol}${newBalance.toFixed(2)}`);

    // Initialize Replicate
    const REPLICATE_API_KEY = Deno.env.get('REPLICATE_API_KEY');
    if (!REPLICATE_API_KEY) throw new Error('REPLICATE_API_KEY not configured');

    const replicate = new Replicate({ auth: REPLICATE_API_KEY });

    // Webhook URL
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const webhookUrl = appendWebhookToken(`${SUPABASE_URL}/functions/v1/replicate-webhook`);

    // Build Seedance input — Seedance 2.0 supports 3–15s across all tiers.
    const replicateInput: Record<string, any> = {
      prompt,
      duration, // gate-approved
      aspect_ratio: aspectRatio,
      resolution,
    };

    // Image-to-Video
    if (startImageUrl) {
      replicateInput.image = startImageUrl;
      // Last-frame control exists on seedance-1-lite and requires a start image.
      if (isLite && endImageUrl) replicateInput.last_frame_image = endImageUrl;
    }
    if (isLite && body.cameraFixed) replicateInput.camera_fixed = true;
    if (typeof body.seed === 'number' && Number.isFinite(body.seed)) {
      replicateInput.seed = Math.max(0, Math.round(body.seed));
    }

    console.log(`[generate-seedance-video] Replicate input:`, JSON.stringify({
      ...replicateInput,
      prompt: prompt.substring(0, 100) + (prompt.length > 100 ? '...' : ''),
    }));

    try {
      const replicateSlug = REPLICATE_SLUG[model] || REPLICATE_SLUG['seedance-standard'];
      console.log(`[generate-seedance-video] Using Replicate model: ${replicateSlug}`);
      const prediction = await replicate.predictions.create({
        model: replicateSlug,
        input: replicateInput,
        webhook: webhookUrl,
        webhook_events_filter: ['start', 'completed']
      });

      console.log(`[generate-seedance-video] ✅ Prediction created: ${prediction.id}`);

      await supabaseAdmin
        .from('ai_video_generations')
        .update({
          status: 'processing',
          started_at: new Date().toISOString(),
          artlist_job_id: prediction.id,
        })
        .eq('id', generation.id);

      await trackAIGeneration('started', user.id, {
        provider: 'seedance', model, duration_s: duration,
        cost_eur: totalCost, aspect_ratio: aspectRatio, resolution,
        generation_id: generation.id,
      }).catch(() => {});

    } catch (replicateError: any) {
      console.error('[generate-seedance-video] ❌ Replicate Error:', replicateError);

      await supabaseAdmin
        .from('ai_video_generations')
        .update({
          status: 'failed',
          failed_at: new Date().toISOString(),
          error_message: `Replicate Error: ${replicateError.message || 'Unknown error'}`
        })
        .eq('id', generation.id);

      // Refund
      const { error: refundError } = await supabaseAdmin.rpc('refund_ai_video_credits', {
        p_user_id: user.id,
        p_amount_euros: totalCost,
        p_generation_id: generation.id
      });

      if (refundError) {
        console.error('[generate-seedance-video] Refund failed:', refundError);
      } else {
        console.log(`[generate-seedance-video] ✅ ${currencySymbol}${totalCost.toFixed(2)} refunded`);
      }

      if (replicateError?.response?.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit reached. Credits refunded. Please wait and try again.", code: "REPLICATE_RATE_LIMIT" }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ error: "Video generation failed. Credits refunded.", code: "REPLICATE_ERROR" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        generationId: generation.id,
        cost: totalCost,
        currency: wallet.currency,
        newBalance,
        status: 'processing'
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );

  } catch (error: any) {
    console.error("[generate-seedance-video] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});

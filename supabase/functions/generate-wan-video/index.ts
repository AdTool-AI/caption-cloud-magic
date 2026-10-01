import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { appendWebhookToken } from "../_shared/webhook-auth.ts";
import { resolveRequestUser } from "../_shared/internalAuth.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import Replicate from "npm:replicate@0.25.2";
import { isQaMockRequest, qaMockResponse } from "../_shared/qaMock.ts"; // [qa-mock-injected]
import { gateVideoCapability, inferMode } from "../_shared/videoCapabilityGate.ts";
import { trackAIGeneration, trackBusinessEvent } from "../_shared/telemetry.ts";
import { resolveAccountCostPerSecond, pricingUnavailableResponse, resolveWalletCurrency } from "../_shared/accountVideoPricing.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS, PUT, DELETE, PATCH",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-qa-mock",
};


// NOTE: there is deliberately NO second provider-slug map here. The concrete
// Replicate contract per (model x mode) lives in the canonical registry
// (supabase/functions/_shared/videoModelSpecs.ts) and is resolved by the
// capability gate via `resolveRouteIdentity`.

/** Resolution passed to Wan 2.7 (the 2.5/2.6 slugs ignore this input). */
const WAN_RESOLUTION: Record<string, string> = {
  'wan-2-7-standard': '720p',
  'wan-2-7-pro': '1080p',
};

// Wan 2.5 size mapping for T2V
const ASPECT_RATIO_TO_SIZE: Record<string, string> = {
  '16:9': '1280*720',
  '9:16': '720*1280',
  '1:1': '720*720',
};

interface GenerateRequest {
  prompt: string;
  model: 'wan-standard' | 'wan-pro' | 'wan-2-6-standard' | 'wan-2-6-pro' | 'wan-2-7-standard' | 'wan-2-7-pro';
  duration: number;
  aspectRatio: '16:9' | '9:16' | '1:1' | '4:3' | '3:4';
  startImageUrl?: string;
  /** Wan 2.7 i2v only: last frame (requires startImageUrl). */
  endImageUrl?: string;
  /** All Wan slugs accept these. */
  negativePrompt?: string;
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

    const user = await resolveRequestUser(req, supabaseClient);
    if (!user) throw new Error("Unauthorized");

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const body = await req.json() as GenerateRequest;
    const { prompt, model, duration: rawDuration, aspectRatio, startImageUrl, endImageUrl, negativePrompt, seed } = body;

    const isWan27 = model === 'wan-2-7-standard' || model === 'wan-2-7-pro';
    const isWan26 = model === 'wan-2-6-standard' || model === 'wan-2-6-pro';
    const duration = Number(rawDuration);

    // Canonical mode — one resolution, reused for the gate AND for dispatch.
    const generationMode = inferMode({ modelId: model, startImageUrl, endImageUrl });

    // Capability gate — before wallet, before provider. No nearest-value snap.
    const gate = await gateVideoCapability(
      supabaseAdmin,
      {
        modelId: model,
        resolution: WAN_RESOLUTION[model],
        mode: generationMode,
        durationSeconds: duration,
        aspectRatio,
      },
      corsHeaders,
    );
    if (gate.response) return gate.response;

    const isImageToVideo = !!startImageUrl;
    const mode = isImageToVideo ? 'Image-to-Video' : 'Text-to-Video';
    console.log(`[generate-wan-video] Mode: ${mode}, Duration: ${duration}s`);

    // Get wallet currency
    const currency = await resolveWalletCurrency(supabaseAdmin, user.id);
    if (currency === null) return pricingUnavailableResponse(corsHeaders);

    // Calculate cost
    // Canonical price from the shared catalog (same source as the UI preview,
    // including the account discount). There is no local fallback table any more.
    const costPerSecond = await resolveAccountCostPerSecond(
      supabaseAdmin, user.id, model, currency as "EUR" | "USD",
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
        provider: 'wan', model, required: totalCost,
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

    console.log(`[generate-wan-video] Cost: ${currencySymbol}${totalCost.toFixed(2)}, Balance: ${currencySymbol}${wallet.balance_euros.toFixed(2)}`);

    // Create generation record
    const resolution = WAN_RESOLUTION[model]
      ?? ((model === 'wan-pro' || model === 'wan-2-6-pro') ? '1080p' : '720p');
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
      console.error('[generate-wan-video] Deduct credits error:', deductError);
      await supabaseAdmin
        .from('ai_video_generations')
        .update({ status: 'failed', error_message: 'Failed to deduct credits' })
        .eq('id', generation.id);
      throw new Error("Failed to deduct credits");
    }

    console.log(`[generate-wan-video] Credits deducted. New balance: ${currencySymbol}${newBalance.toFixed(2)}`);

    // Initialize Replicate
    const REPLICATE_API_KEY = Deno.env.get('REPLICATE_API_KEY');
    if (!REPLICATE_API_KEY) throw new Error('REPLICATE_API_KEY not configured');

    const replicate = new Replicate({ auth: REPLICATE_API_KEY });

    // Webhook URL
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const webhookUrl = appendWebhookToken(`${SUPABASE_URL}/functions/v1/replicate-webhook`);

    // Provider contract = canonical route identity for the gate-resolved mode.
    // Never a second, independently inferred slug.
    const replicateModel = gate.routeIdentity?.providerModelSlug;
    if (!replicateModel) {
      throw new Error(`No canonical provider route for ${model}/${generationMode}`);
    }

    // Build input — Wan 2.5 uses different params than WaveSpeed
    const replicateInput: Record<string, any> = {
      prompt,
      duration,
    };

    // All Wan slugs (2.5/2.6/2.7, t2v + i2v) accept negative_prompt and seed.
    if (negativePrompt) replicateInput.negative_prompt = negativePrompt;
    if (typeof seed === 'number' && Number.isFinite(seed)) {
      replicateInput.seed = Math.min(2147483647, Math.max(0, Math.round(seed)));
    }

    if (isWan27) {
      // Wan 2.7 uses `resolution` (+ `aspect_ratio` on t2v), never `size`.
      replicateInput.resolution = resolution;
      if (isImageToVideo) {
        replicateInput.first_frame = startImageUrl;
        if (endImageUrl) replicateInput.last_frame = endImageUrl;
      } else {
        replicateInput.aspect_ratio = aspectRatio; // gate-approved
      }
    } else if (isImageToVideo) {
      replicateInput.image = startImageUrl;
      replicateInput.resolution = resolution; // I2V uses "resolution" param
    } else {
      replicateInput.size = ASPECT_RATIO_TO_SIZE[aspectRatio] || '1280*720'; // T2V uses "size" param
    }

    console.log(`[generate-wan-video] Using model: ${replicateModel}`);
    console.log(`[generate-wan-video] Replicate input:`, JSON.stringify({
      ...replicateInput,
      prompt: prompt.substring(0, 100) + (prompt.length > 100 ? '...' : ''),
    }));

    try {
      const prediction = await replicate.predictions.create({
        model: replicateModel,
        input: replicateInput,
        webhook: webhookUrl,
        webhook_events_filter: ['start', 'completed']
      });

      console.log(`[generate-wan-video] ✅ Prediction created: ${prediction.id}`);

      await supabaseAdmin
        .from('ai_video_generations')
        .update({
          status: 'processing',
          started_at: new Date().toISOString(),
          artlist_job_id: prediction.id,
        })
        .eq('id', generation.id);

      await trackAIGeneration('started', user.id, {
        provider: 'wan', model, duration_s: duration,
        cost_eur: totalCost, aspect_ratio: aspectRatio, resolution,
        generation_id: generation.id,
      }).catch(() => {});

    } catch (replicateError: any) {
      console.error('[generate-wan-video] ❌ Replicate Error:', replicateError);

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
        console.error('[generate-wan-video] Refund failed:', refundError);
      } else {
        console.log(`[generate-wan-video] ✅ ${currencySymbol}${totalCost.toFixed(2)} refunded`);
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
    console.error("[generate-wan-video] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});

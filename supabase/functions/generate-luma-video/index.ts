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


/** Replicate slug per model tier. */
const LUMA_SLUG: Record<string, string> = {
  'luma-standard':  'luma/ray-2-720p',
  'luma-pro':       'luma/ray-2-720p',
  'luma-ray32-5s':  'luma/ray-3.2',
  'luma-ray32-10s': 'luma/ray-3.2',
};

/** Ray 2 + Ray 3.2 `aspect_ratio` enum (Ray 3.2 has no 9:21). */
type LumaAspectRatio = '16:9' | '9:16' | '1:1' | '4:3' | '3:4' | '21:9' | '9:21';

interface GenerateRequest {
  prompt: string;
  model: 'luma-standard' | 'luma-pro' | 'luma-ray32-5s' | 'luma-ray32-10s';
  duration: number;
  aspectRatio: LumaAspectRatio;
  /** Ray 3.2 only: 540p | 720p | 1080p. Ray 2 is fixed 720p. */
  resolution?: '540p' | '720p' | '1080p';
  startImageUrl?: string;
  endImageUrl?: string;
  loop?: boolean;
  /** Ray 3.2 only: HDR pass (requires 720p/1080p, 5s, no loop). */
  hdr?: boolean;
  cameraConcept?: string;
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
    const { prompt, model, duration: rawDuration, aspectRatio, startImageUrl, endImageUrl, loop, hdr, cameraConcept } = body;

    const isRay32 = model === 'luma-ray32-5s' || model === 'luma-ray32-10s';
    // Ray 3.2 tiers are fixed-length by product definition (5 s / 10 s tier).
    const duration = isRay32 ? (model === 'luma-ray32-10s' ? 10 : 5) : Number(rawDuration);
    const requestedResolution = isRay32 ? (body.resolution ?? '720p') : '720p';

    // Capability gate — before wallet, before provider. No nearest-value snap.
    const gate = await gateVideoCapability(
      supabaseAdmin,
      {
        modelId: model,
        mode: inferMode({ modelId: model, startImageUrl, endImageUrl }),
        resolution: requestedResolution,
        durationSeconds: duration,
        aspectRatio,
      },
      corsHeaders,
    );
    if (gate.response) return gate.response;
    const resolution = gate.resolutionLabel ?? requestedResolution;

    const isImageToVideo = !!startImageUrl;
    const mode = isImageToVideo ? 'Image-to-Video' : 'Text-to-Video';
    console.log(`[generate-luma-video] Mode: ${mode}, Duration: ${duration}s, Resolution: ${resolution}`);

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
        provider: 'luma', model, required: totalCost,
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

    console.log(`[generate-luma-video] Cost: ${currencySymbol}${totalCost.toFixed(2)}, Balance: ${currencySymbol}${wallet.balance_euros.toFixed(2)}`);

    // Create generation record
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
      console.error('[generate-luma-video] Deduct credits error:', deductError);
      await supabaseAdmin
        .from('ai_video_generations')
        .update({ status: 'failed', error_message: 'Failed to deduct credits' })
        .eq('id', generation.id);
      throw new Error("Failed to deduct credits");
    }

    console.log(`[generate-luma-video] Credits deducted. New balance: ${currencySymbol}${newBalance.toFixed(2)}`);

    // Initialize Replicate
    const REPLICATE_API_KEY = Deno.env.get('REPLICATE_API_KEY');
    if (!REPLICATE_API_KEY) throw new Error('REPLICATE_API_KEY not configured');

    const replicate = new Replicate({ auth: REPLICATE_API_KEY });

    // Webhook URL
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const webhookUrl = appendWebhookToken(`${SUPABASE_URL}/functions/v1/replicate-webhook`);

    const lumaSlug = LUMA_SLUG[model] || 'luma/ray-2-720p';

    // Provider contract (Replicate schemas, verified 10.08.2026):
    //  luma/ray-2-720p : duration [5,9], 7 ratios, start/end image, loop, concepts, fixed 720p.
    //  luma/ray-3.2    : duration [5,10], resolution [540p,720p,1080p], 6 ratios
    //                    (ignored when an anchor frame is set), start/end image ONLY at 5 s,
    //                    loop NOT allowed with 10 s / hdr / end_image, hdr needs 720p+/5s/no loop,
    //                    no `concepts` field at all.
    const replicateInput: Record<string, any> = {
      prompt,
      duration,
      aspect_ratio: aspectRatio,
    };

    const anchorAllowed = !isRay32 || duration === 5;

    if (startImageUrl && anchorAllowed) {
      replicateInput.start_image = startImageUrl;
    }

    if (endImageUrl && anchorAllowed) {
      replicateInput.end_image = endImageUrl;
    }

    const loopAllowed = loop && (!isRay32 || (duration !== 10 && !hdr && !replicateInput.end_image));
    if (loopAllowed) {
      replicateInput.loop = true;
    }

    if (!isRay32 && cameraConcept && cameraConcept !== 'none') {
      // Camera concepts exist on Ray 2 only.
      replicateInput.concepts = [cameraConcept];
    }

    if (isRay32) {
      replicateInput.resolution = resolution;
      if (hdr && resolution !== '540p' && duration === 5 && !replicateInput.loop) {
        replicateInput.hdr = true;
      }
    }

    console.log(`[generate-luma-video] Using model: ${lumaSlug}`);
    console.log(`[generate-luma-video] Replicate input:`, JSON.stringify({
      ...replicateInput,
      prompt: prompt.substring(0, 100) + (prompt.length > 100 ? '...' : ''),
    }));

    try {
      const prediction = await replicate.predictions.create({
        model: lumaSlug as `${string}/${string}`,
        input: replicateInput,
        webhook: webhookUrl,
        webhook_events_filter: ['start', 'completed']
      });

      console.log(`[generate-luma-video] ✅ Prediction created: ${prediction.id}`);

      await supabaseAdmin
        .from('ai_video_generations')
        .update({
          status: 'processing',
          started_at: new Date().toISOString(),
          artlist_job_id: prediction.id,
        })
        .eq('id', generation.id);

      await trackAIGeneration('started', user.id, {
        provider: 'luma', model, duration_s: duration,
        cost_eur: totalCost, aspect_ratio: aspectRatio, resolution,
        generation_id: generation.id,
      }).catch(() => {});

    } catch (replicateError: any) {
      console.error('[generate-luma-video] ❌ Replicate Error:', replicateError);

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
        console.error('[generate-luma-video] Refund failed:', refundError);
      } else {
        console.log(`[generate-luma-video] ✅ ${currencySymbol}${totalCost.toFixed(2)} refunded`);
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
    console.error("[generate-luma-video] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});

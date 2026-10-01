import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { appendWebhookToken } from "../_shared/webhook-auth.ts";
import { resolveRequestUser } from "../_shared/internalAuth.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import Replicate from "npm:replicate@0.25.2";
import { resolveAccountCostPerSecond, pricingUnavailableResponse, resolveWalletCurrency } from "../_shared/accountVideoPricing.ts";
import { isQaMockRequest, qaMockResponse } from "../_shared/qaMock.ts"; // [qa-mock-injected]
import { gateVideoCapability, inferMode } from "../_shared/videoCapabilityGate.ts";
import { allowanceJobKey, claimIncludedAllowance, releaseIncludedAllowance } from "../_shared/included-allowance.ts";


const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS, PUT, DELETE, PATCH",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-qa-mock",
};


// Lightricks LTX 2.3 — text-to-video and image-to-video with native audio
const REPLICATE_MODELS: Record<string, string> = {
  'ltx-standard': 'lightricks/ltx-2.3-fast',
  'ltx-pro': 'lightricks/ltx-2.3-pro',
};

// Capability truth lives in _shared/videoModelSpecs.ts. No local clamping:
// an unsupported duration / aspect ratio / resolution is rejected with 400.


interface GenerateRequest {
  prompt: string;
  model: 'ltx-standard' | 'ltx-pro';
  duration: number;
  aspectRatio: '16:9' | '9:16' | '1:1';
  startImageUrl?: string;
  /** LTX 2.3 last frame (needs startImageUrl). */
  endImageUrl?: string;
  /** 1080p | 2k | 4k — durations > 10 s require 1080p. */
  resolution?: '1080p' | '2k' | '4k';
  cameraMotion?: string;
  generateAudio?: boolean;
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
    const { prompt, model, duration: rawDuration, aspectRatio, startImageUrl, generateAudio } = body;

    const duration = Number(rawDuration);
    const isImageToVideo = !!startImageUrl;
    const requestedResolution = body.resolution ?? '1080p';

    // Capability gate — runs BEFORE wallet lookup and BEFORE any provider call.
    const gate = await gateVideoCapability(
      supabaseAdmin,
      {
        modelId: model,
        mode: inferMode({ modelId: model, startImageUrl, endImageUrl: body.endImageUrl }),
        resolution: requestedResolution,
        durationSeconds: duration,
        aspectRatio,
      },
      corsHeaders,
    );
    if (gate.response) return gate.response;

    const mode = isImageToVideo ? 'Image-to-Video' : 'Text-to-Video';
    console.log(`[generate-ltx-video] Mode: ${mode}, Duration: ${duration}s, Model: ${model}`);


    // Wallet currency
    const currency = await resolveWalletCurrency(supabaseAdmin, user.id);
    if (currency === null) return pricingUnavailableResponse(corsHeaders);

    // Canonical price from the shared catalog (same source as the UI preview,
    // including the account discount). There is no local fallback table any more.
    const costPerSecond = await resolveAccountCostPerSecond(
      supabaseAdmin, user.id, model, currency as "EUR" | "USD",
    );
    if (costPerSecond === null) return pricingUnavailableResponse(corsHeaders);
    const listCost = duration * costPerSecond;
      // [legacy] Per-user video rate limit removed (single unlimited plan).

    // Monthly included usage: short fast videos (<= 5 s) are included with an
    // active subscription / Creator account. Claimed before any wallet work
    // and released again if the provider call fails.
    const includedEligible = model === 'ltx-standard' && duration <= 5;
    const jobKey = includedEligible
      ? await allowanceJobKey([
          (body as { requestId?: string }).requestId,
          user.id, model, duration, aspectRatio, prompt,
          (body as { requestId?: string }).requestId ? null : Math.floor(Date.now() / 60_000),
        ])
      : '';
    const included = includedEligible
      ? await claimIncludedAllowance(supabaseAdmin, user.id, 'fast_video', jobKey, Deno.env.get('STRIPE_SECRET_KEY'))
      : { claimed: false, duplicate: false, used: 0, limit: 0 };
    const totalCost = included.claimed ? 0 : listCost;
    const releaseIncluded = async () => {
      if (included.claimed) await releaseIncludedAllowance(supabaseAdmin, user.id, 'fast_video', jobKey);
    };

    // Wallet balance
    const { data: wallet } = await supabaseAdmin
      .from('ai_video_wallets')
      .select('balance_euros, currency')
      .eq('user_id', user.id)
      .single();

    if (!included.claimed) {
      if (!wallet) {
        return new Response(
          JSON.stringify({ error: "No AI Video wallet found. Please purchase credits first.", code: "NO_WALLET", needsPurchase: true }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (wallet.balance_euros < totalCost) {
        return new Response(
          JSON.stringify({
            error: `Insufficient credits. Need ${totalCost.toFixed(2)}, have ${wallet.balance_euros.toFixed(2)}`,
            code: "INSUFFICIENT_CREDITS", needsPurchase: true,
            required: totalCost, available: wallet.balance_euros, currency: wallet.currency
          }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    const currencySymbol = (wallet?.currency ?? currency) === 'USD' ? '$' : '€';

    // Create generation record
    const resolution = gate.resolutionLabel ?? requestedResolution;
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
        cost_per_second: included.claimed ? 0 : costPerSecond,
        total_cost_euros: totalCost,
        status: 'pending',
        source_image_url: startImageUrl || null,
      })
      .select()
      .single();

    if (genError) {
      await releaseIncluded();
      throw genError;
    }

    let newBalance: number | null = null;
    if (!included.claimed) {
      // Deduct credits
      const { data: balanceAfter, error: deductError } = await supabaseAdmin.rpc(
        'deduct_ai_video_credits',
        { p_user_id: user.id, p_amount: totalCost, p_generation_id: generation.id }
      );

      if (deductError || balanceAfter === null || balanceAfter === undefined) {
        console.error('[generate-ltx-video] Deduct credits error:', deductError);
        await supabaseAdmin
          .from('ai_video_generations')
          .update({ status: 'failed', error_message: 'Failed to deduct credits' })
          .eq('id', generation.id);
        throw new Error("Failed to deduct credits");
      }
      newBalance = balanceAfter;
      console.log(`[generate-ltx-video] Credits deducted. New balance: ${currencySymbol}${balanceAfter.toFixed(2)}`);
    } else {
      newBalance = wallet?.balance_euros ?? null;
      console.log(`[generate-ltx-video] Covered by included monthly allowance (${included.used}/${included.limit}).`);
    }


    // Replicate
    const REPLICATE_API_KEY = Deno.env.get('REPLICATE_API_KEY');
    if (!REPLICATE_API_KEY) throw new Error('REPLICATE_API_KEY not configured');
    const replicate = new Replicate({ auth: REPLICATE_API_KEY });

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const webhookUrl = appendWebhookToken(`${SUPABASE_URL}/functions/v1/replicate-webhook`);

    const replicateModel = REPLICATE_MODELS[model];
    // Gate-approved values only — no snapping, no fallback rewriting.
    const ratio = aspectRatio;
    const ltxResolution = (gate.resolutionLabel ?? requestedResolution).toLowerCase();

    const replicateInput: Record<string, any> = {
      prompt,
      duration,
      aspect_ratio: ratio,
      resolution: ltxResolution,
      generate_audio: generateAudio !== false,
    };

    if (isImageToVideo) {
      replicateInput.image = startImageUrl;
      if (body.endImageUrl) replicateInput.last_frame_image = body.endImageUrl;
    }
    if (body.cameraMotion) replicateInput.camera_motion = body.cameraMotion;

    console.log(`[generate-ltx-video] Using model: ${replicateModel}`);

    try {
      const prediction = await replicate.predictions.create({
        model: replicateModel,
        input: replicateInput,
        webhook: webhookUrl,
        webhook_events_filter: ['start', 'completed']
      });

      console.log(`[generate-ltx-video] ✅ Prediction created: ${prediction.id}`);

      await supabaseAdmin
        .from('ai_video_generations')
        .update({
          status: 'processing',
          started_at: new Date().toISOString(),
          artlist_job_id: prediction.id,
        })
        .eq('id', generation.id);

    } catch (replicateError: any) {
      console.error('[generate-ltx-video] ❌ Replicate Error:', replicateError);

      await supabaseAdmin
        .from('ai_video_generations')
        .update({
          status: 'failed',
          failed_at: new Date().toISOString(),
          error_message: `Replicate Error: ${replicateError.message || 'Unknown error'}`
        })
        .eq('id', generation.id);

      if (included.claimed) {
        // Included generation: give the monthly allowance back, no wallet move.
        await releaseIncluded();
        console.log('[generate-ltx-video] ✅ included allowance restored');
      } else {
        // Refund
        const { error: refundError } = await supabaseAdmin.rpc('refund_ai_video_credits', {
          p_user_id: user.id,
          p_amount_euros: totalCost,
          p_generation_id: generation.id
        });

        if (refundError) {
          console.error('[generate-ltx-video] Refund failed:', refundError);
        } else {
          console.log(`[generate-ltx-video] ✅ ${currencySymbol}${totalCost.toFixed(2)} refunded`);
        }
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
        currency: wallet?.currency ?? currency,
        included: included.claimed,
        includedUsed: included.claimed ? included.used : undefined,
        includedLimit: included.claimed ? included.limit : undefined,
        newBalance,
        status: 'processing'
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );


  } catch (error: any) {
    console.error("[generate-ltx-video] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});

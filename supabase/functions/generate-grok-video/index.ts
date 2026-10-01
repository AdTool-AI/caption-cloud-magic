import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { appendWebhookToken } from "../_shared/webhook-auth.ts";
import { resolveRequestUser } from "../_shared/internalAuth.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import Replicate from "npm:replicate@0.25.2";
import { isQaMockRequest, qaMockResponse } from "../_shared/qaMock.ts"; // [qa-mock-injected]
import { gateVideoCapability, inferMode } from "../_shared/videoCapabilityGate.ts";
import { tl, withLang } from "../_shared/i18n.ts";
import { resolveAccountCostPerSecond, pricingUnavailableResponse, resolveWalletCurrency } from "../_shared/accountVideoPricing.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS, PUT, DELETE, PATCH",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-qa-mock",
};


// xAI Grok Imagine — text-to-video and image-to-video with native audio
const REPLICATE_MODEL_SLUG = 'xai/grok-imagine-video';

// Provider aspect_ratio enum (plus "auto", which we never send).
// Aspect ratios are validated by the capability gate (videoModelSpecs.ts).

interface GenerateRequest {
  prompt: string;
  model: 'grok-imagine';
  duration: number;
  aspectRatio: '16:9' | '9:16' | '1:1' | '4:3' | '3:4' | '3:2' | '2:3';
  /** Provider supports 480p and 720p (no 1080p). */
  resolution?: '480p' | '720p';
  startImageUrl?: string;
  enableAudio?: boolean;
}

serve((req: Request) => withLang(req, () => (async (req) => {
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
    const { prompt, model, duration: rawDuration, aspectRatio, startImageUrl, enableAudio = true } = body;

    const duration = Number(rawDuration);
    const requestedResolution = body.resolution ?? '720p';

    // Capability gate — before wallet, before provider. No silent clamping.
    const gate = await gateVideoCapability(
      supabaseAdmin,
      {
        modelId: model,
        mode: inferMode({ modelId: model, startImageUrl }),
        resolution: requestedResolution,
        durationSeconds: duration,
        aspectRatio,
      },
      corsHeaders,
    );
    if (gate.response) return gate.response;
    const resolution = (gate.resolutionLabel ?? requestedResolution) as '480p' | '720p';

    const isImageToVideo = !!startImageUrl;
    console.log(`[generate-grok-video] Mode: ${isImageToVideo ? 'I2V' : 'T2V'}, Duration: ${duration}s, Audio: ${enableAudio}`);

    // Wallet currency
    const currency = await resolveWalletCurrency(supabaseAdmin, user.id);
    if (currency === null) return pricingUnavailableResponse(corsHeaders);

    // Canonical price from the shared catalog (same source as the UI preview,
    // including the account discount). There is no local fallback table any more.
    const costPerSecond = await resolveAccountCostPerSecond(
      supabaseAdmin, user.id, model, currency as "EUR" | "USD",
    );
    if (costPerSecond === null) return pricingUnavailableResponse(corsHeaders);
    const totalCost = duration * costPerSecond;
      // [legacy] Per-user video rate limit removed (single unlimited plan).

    // Wallet balance
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
      return new Response(
        JSON.stringify({
          error: `Insufficient credits. Need ${currencySymbol}${totalCost.toFixed(2)}, have ${currencySymbol}${wallet.balance_euros.toFixed(2)}`,
          code: "INSUFFICIENT_CREDITS", needsPurchase: true,
          required: totalCost, available: wallet.balance_euros, currency: wallet.currency
        }),
        { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

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
      console.error('[generate-grok-video] Deduct credits error:', deductError);
      await supabaseAdmin
        .from('ai_video_generations')
        .update({ status: 'failed', error_message: 'Failed to deduct credits' })
        .eq('id', generation.id);
      throw new Error("Failed to deduct credits");
    }

    // Replicate
    const REPLICATE_API_KEY = Deno.env.get('REPLICATE_API_KEY');
    if (!REPLICATE_API_KEY) throw new Error('REPLICATE_API_KEY not configured');
    const replicate = new Replicate({ auth: REPLICATE_API_KEY });

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const webhookUrl = appendWebhookToken(`${SUPABASE_URL}/functions/v1/replicate-webhook`);

    const ratio = aspectRatio; // gate-approved

    const replicateInput: Record<string, any> = {
      prompt,
      // Provider accepts 1-15 s.
      duration,
      aspect_ratio: ratio,
      resolution,
      generate_audio: enableAudio !== false,
    };

    if (isImageToVideo) {
      replicateInput.image = startImageUrl;
    }

    console.log(`[generate-grok-video] Using model: ${REPLICATE_MODEL_SLUG}`);

    try {
      const prediction = await replicate.predictions.create({
        model: REPLICATE_MODEL_SLUG,
        input: replicateInput,
        webhook: webhookUrl,
        webhook_events_filter: ['start', 'completed']
      });

      console.log(`[generate-grok-video] ✅ Prediction created: ${prediction.id}`);

      await supabaseAdmin
        .from('ai_video_generations')
        .update({
          status: 'processing',
          started_at: new Date().toISOString(),
          artlist_job_id: prediction.id,
        })
        .eq('id', generation.id);

    } catch (replicateError: any) {
      console.error('[generate-grok-video] ❌ Replicate Error:', replicateError);

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
        console.error('[generate-grok-video] Refund failed:', refundError);
      } else {
        console.log(`[generate-grok-video] ✅ ${currencySymbol}${totalCost.toFixed(2)} refunded`);
      }

      // If model not yet available on Replicate
      const errMsg = String(replicateError?.message || '').toLowerCase();
      if (errMsg.includes('not found') || errMsg.includes('does not exist')) {
        return new Response(
          JSON.stringify({
            error: tl({ de: "Grok Imagine ist auf Replicate noch nicht öffentlich verfügbar. Credits wurden zurückerstattet.", en: "Grok Imagine is not yet publicly available on Replicate. Credits have been refunded.", es: "Grok Imagine aún no está disponible públicamente en Replicate. Los créditos han sido reembolsados." }),
            code: "MODEL_UNAVAILABLE"
          }),
          { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (replicateError?.response?.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit reached. Credits refunded.", code: "REPLICATE_RATE_LIMIT" }),
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
    console.error("[generate-grok-video] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
})(req)));

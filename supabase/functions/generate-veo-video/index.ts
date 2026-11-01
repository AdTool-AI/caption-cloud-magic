import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { appendWebhookToken } from "../_shared/webhook-auth.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import Replicate from "npm:replicate@0.25.2";
import { resolveAccountCostPerSecond, pricingUnavailableResponse, resolveWalletCurrency } from "../_shared/accountVideoPricing.ts";
import { isQaMockRequest, qaMockResponse } from "../_shared/qaMock.ts"; // [qa-mock-injected]
import { gateVideoCapability, inferMode } from "../_shared/videoCapabilityGate.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS, PUT, DELETE, PATCH",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-qa-mock",
};

// Customer pricing comes exclusively from the canonical catalog (_shared/videoPricingCatalog.ts).
/** Provider-side capacity errors (Google Veo "code: 8" / RESOURCE_EXHAUSTED,
 *  Replicate 503 / "high load"). Transient and unrelated to our own load. */
function isProviderOverload(err: any): boolean {
  const status = err?.response?.status ?? err?.status;
  if (status === 503) return true;
  const msg = `${err?.message ?? ''} ${JSON.stringify(err?.detail ?? err?.response?.data ?? '')}`.toLowerCase();
  return msg.includes('high load')
    || msg.includes('resource_exhausted')
    || msg.includes('overloaded')
    || msg.includes('capacity')
    || /"?code"?\s*:\s*8\b/.test(msg);
}


const REPLICATE_MODELS: Record<string, string> = {
  'veo-3.1-lite-720p': 'google/veo-3.1-fast',
  'veo-3.1-lite-1080p': 'google/veo-3.1-fast',
  'veo-3.1-fast': 'google/veo-3.1-fast',
  'veo-3.1-pro': 'google/veo-3.1',
};

const MODEL_RESOLUTION: Record<string, '720p' | '1080p'> = {
  'veo-3.1-lite-720p': '720p',
  'veo-3.1-lite-1080p': '1080p',
  'veo-3.1-fast': '1080p',
  'veo-3.1-pro': '1080p',
};

type VeoModelId = 'veo-3.1-lite-720p' | 'veo-3.1-lite-1080p' | 'veo-3.1-fast' | 'veo-3.1-pro';

interface GenerateRequest {
  prompt: string;
  model: VeoModelId;
  duration: number;
  aspectRatio: '16:9' | '9:16';
  startImageUrl?: string;
  /** Veo 3.1 `last_frame`: end frame for interpolation (needs a start image). */
  endImageUrl?: string;
  /**
   * Veo 3.1 `reference_images`: 1–3 style/subject references.
   * Provider constraint: 16:9 + 8 s only, and `last_frame` is ignored when set.
   */
  referenceImageUrls?: string[];
  generateAudio?: boolean;
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

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fail before wallet, allowance or generation mutations when provider/callback setup is missing.
    const REPLICATE_API_KEY = Deno.env.get('REPLICATE_API_KEY');
    if (!REPLICATE_API_KEY) throw new Error('REPLICATE_API_KEY not configured');

    const replicate = new Replicate({ auth: REPLICATE_API_KEY });

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const webhookUrl = appendWebhookToken(`${SUPABASE_URL}/functions/v1/replicate-webhook`);

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const body = await req.json() as GenerateRequest & { spokenLanguage?: string; suppressDialogue?: boolean };
    const { prompt, model, duration: rawDuration, aspectRatio, startImageUrl, endImageUrl, referenceImageUrls, generateAudio = true, negativePrompt, seed } = body;
    const spokenLanguage = typeof body.spokenLanguage === 'string' ? body.spokenLanguage : undefined;
    const suppressDialogue = body.suppressDialogue === true;
    if (generateAudio && spokenLanguage) {
      console.log(`[generate-veo-video] spokenLanguage=${spokenLanguage} (prompt lock applied client-side)`);
    }
    if (generateAudio && suppressDialogue) {
      console.log(`[generate-veo-video] suppressDialogue=true — ambient-only fallback (provider TTS lang unsupported)`);
    }

    if (!prompt || !prompt.trim()) {
      return new Response(
        JSON.stringify({ error: "Prompt is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (!REPLICATE_MODELS[model]) {
      return new Response(
        JSON.stringify({ error: "Invalid model" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const duration = Number(rawDuration);

    // Capability gate — before wallet, before provider. Reference images on
    // Veo 3.1 are 16:9 / 8 s only; that is now a 400, not a silent rewrite.
    const gate = await gateVideoCapability(
      supabaseAdmin,
      {
        modelId: model,
        mode: inferMode({ modelId: model,
          startImageUrl,
          endImageUrl,
          referenceImageUrls: Array.isArray(referenceImageUrls) ? referenceImageUrls : null,
        }),
        resolution: MODEL_RESOLUTION[model] || '720p',
        durationSeconds: duration,
        aspectRatio,
      },
      corsHeaders,
    );
    if (gate.response) return gate.response;

    const isImageToVideo = !!startImageUrl;
    const mode = isImageToVideo ? 'Image-to-Video' : 'Text-to-Video';
    console.log(`[generate-veo-video] Mode: ${mode}, Duration: ${duration}s, Audio: ${generateAudio}`);

    // Wallet currency
    const currency = await resolveWalletCurrency(supabaseAdmin, user.id);
    if (currency === null) return pricingUnavailableResponse(corsHeaders);

    // Cost
    // Canonical price from the shared catalog (same source as the UI preview,
    // including the account discount). There is no local fallback table any more.
    const costPerSecond = await resolveAccountCostPerSecond(
      supabaseAdmin, user.id, model, currency as "EUR" | "USD",
    );
    if (costPerSecond === null) return pricingUnavailableResponse(corsHeaders);
    const totalCost = duration * costPerSecond;
      // [legacy] Per-user video rate limit removed (single unlimited plan).

    // Check wallet
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

    console.log(`[generate-veo-video] Cost: ${currencySymbol}${totalCost.toFixed(2)}, Balance: ${currencySymbol}${wallet.balance_euros.toFixed(2)}`);

    // Generation row
    const resolution = MODEL_RESOLUTION[model] || '720p';
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

    // Deduct
    const { data: newBalance, error: deductError } = await supabaseAdmin.rpc(
      'deduct_ai_video_credits',
      { p_user_id: user.id, p_amount: totalCost, p_generation_id: generation.id }
    );

    if (deductError || newBalance === null || newBalance === undefined) {
      console.error('[generate-veo-video] Deduct error:', deductError);
      await supabaseAdmin
        .from('ai_video_generations')
        .update({ status: 'failed', error_message: 'Failed to deduct credits' })
        .eq('id', generation.id);
      throw new Error("Failed to deduct credits");
    }

    console.log(`[generate-veo-video] Credits deducted. New balance: ${currencySymbol}${newBalance.toFixed(2)}`);

    // Replicate


    const replicateModel = REPLICATE_MODELS[model];

    const replicateInput: Record<string, any> = {
      prompt,
      duration,
      aspect_ratio: aspectRatio,
      generate_audio: generateAudio,
    };

    // Lite-Varianten: explizite Auflösung an Replicate übergeben (nur bei veo-3.1-fast Model)
    if (model === 'veo-3.1-lite-720p' || model === 'veo-3.1-lite-1080p') {
      replicateInput.resolution = MODEL_RESOLUTION[model];
    }

    if (negativePrompt && negativePrompt.trim()) {
      replicateInput.negative_prompt = negativePrompt.trim();
    }

    if (isImageToVideo) {
      replicateInput.image = startImageUrl;
    }

    if (typeof seed === 'number' && Number.isFinite(seed)) {
      replicateInput.seed = Math.trunc(seed);
    }

    // Provider contract (Replicate google/veo-3.1 schema, verified 10.08.2026):
    // `reference_images` accepts 1–3 URIs but ONLY at 16:9 + 8 s, and it makes
    // the provider ignore `last_frame`. So references win when both are sent.
    const refs = Array.isArray(referenceImageUrls)
      ? referenceImageUrls.filter((u) => typeof u === 'string' && u.trim()).slice(0, 3)
      : [];
    const refsAllowed = refs.length > 0 && aspectRatio === '16:9' && duration === 8;

    if (refsAllowed) {
      replicateInput.reference_images = refs;
    } else if (endImageUrl && isImageToVideo) {
      // `last_frame` interpolates from the start image to this end frame.
      replicateInput.last_frame = endImageUrl;
    }

    if (refs.length > 0 && !refsAllowed) {
      console.log('[generate-veo-video] reference_images dropped — provider allows them only at 16:9 / 8s');
    }


    console.log(`[generate-veo-video] Using model: ${replicateModel}`);
    console.log(`[generate-veo-video] Input:`, JSON.stringify({
      ...replicateInput,
      prompt: prompt.substring(0, 100) + (prompt.length > 100 ? '...' : ''),
    }));

    try {
      // Provider overload (Google Veo capacity, "code: 8" / RESOURCE_EXHAUSTED)
      // is transient and unrelated to our own traffic — retry a bounded number
      // of times before giving up. No extra deduction happens here.
      let prediction: any = null;
      let lastError: any = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          prediction = await replicate.predictions.create({
            model: replicateModel,
            input: replicateInput,
            webhook: webhookUrl,
            webhook_events_filter: ['start', 'completed']
          });
          break;
        } catch (err: any) {
          lastError = err;
          if (!isProviderOverload(err) || attempt === 2) throw err;
          const waitMs = 2000 * (attempt + 1);
          console.warn(`[generate-veo-video] provider overloaded — retry ${attempt + 1}/2 in ${waitMs}ms`);
          await new Promise((r) => setTimeout(r, waitMs));
        }
      }
      if (!prediction) throw lastError ?? new Error('Prediction creation failed');

      console.log(`[generate-veo-video] ✅ Prediction created: ${prediction.id}`);

      await supabaseAdmin
        .from('ai_video_generations')
        .update({
          status: 'processing',
          started_at: new Date().toISOString(),
          artlist_job_id: prediction.id,
        })
        .eq('id', generation.id);

    } catch (replicateError: any) {
      console.error('[generate-veo-video] ❌ Replicate Error:', replicateError);

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
        console.error('[generate-veo-video] Refund failed:', refundError);
      } else {
        console.log(`[generate-veo-video] ✅ ${currencySymbol}${totalCost.toFixed(2)} refunded`);
      }

      if (isProviderOverload(replicateError)) {
        return new Response(
          JSON.stringify({
            error: "The video provider is currently overloaded. Your credits were refunded — please try again in a few minutes.",
            code: "PROVIDER_OVERLOADED",
          }),
          { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
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
    console.error("[generate-veo-video] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});

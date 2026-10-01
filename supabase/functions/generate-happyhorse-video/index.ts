// generate-happyhorse-video — Alibaba HappyHorse 1.0 via Replicate
// Pattern: identical to generate-vidu-video (wallet → reserve → submit →
// background poll → rehost → refund-on-failure).
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { resolveRequestUser } from "../_shared/internalAuth.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import Replicate from "npm:replicate@0.25.2";
import { isQaMockRequest, qaMockResponse } from "../_shared/qaMock.ts"; // [qa-mock-injected]
import { gateVideoCapability, inferMode } from "../_shared/videoCapabilityGate.ts";
import { trackAIGeneration, trackBusinessEvent } from "../_shared/telemetry.ts";
import { sanitizeForHappyHorse, isGreenNetRejection } from "../_shared/happyhorse-green-net.ts";
import { resolveAccountCostPerSecond, pricingUnavailableResponse } from "../_shared/accountVideoPricing.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS, PUT, DELETE, PATCH",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-qa-mock",
};

type HappyHorseModel = "happyhorse-standard" | "happyhorse-pro";

const REPLICATE_MODEL = "alibaba/happyhorse-1.0";


const RESOLUTIONS: Record<HappyHorseModel, "720p" | "1080p"> = {
  "happyhorse-standard": "720p",
  "happyhorse-pro": "1080p",
};

const ALLOWED_ASPECTS = new Set(["16:9", "9:16", "1:1", "4:3", "3:4"]);
const MIN_DURATION = 3;
const MAX_DURATION = 15;

interface GenerateRequest {
  prompt?: string;
  model: HappyHorseModel;
  /** Optional first-frame image (I2V mode). When provided, aspectRatio is ignored. */
  image?: string;
  duration?: number;       // 3-15
  aspectRatio?: string;    // T2V only
  seed?: number;
}

async function rehostAndPersist(params: {
  predictionId: string;
  generationId: string;
  userId: string;
  totalCost: number;
  prompt: string;
  model: HappyHorseModel;
  aspectRatio: string;
  duration: number;
  resolution: "720p" | "1080p";
  replicate: Replicate;
}) {
  const {
    predictionId, generationId, userId, totalCost, prompt, model,
    aspectRatio, duration, resolution, replicate,
  } = params;
  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  const startedAt = Date.now();
  const MAX_POLL_MS = 8 * 60 * 1000;
  const POLL_INTERVAL_MS = 5000;

  try {
    while (Date.now() - startedAt < MAX_POLL_MS) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      const prediction = await replicate.predictions.get(predictionId);
      console.log(`[generate-happyhorse-video] Pred ${predictionId} status=${prediction.status}`);

      if (prediction.status === "succeeded") {
        const outputUrl = Array.isArray(prediction.output) ? prediction.output[0] : prediction.output;
        if (!outputUrl) throw new Error("HappyHorse succeeded but returned no output URL");

        let permanentUrl = outputUrl as string;
        try {
          const dl = await fetch(outputUrl as string);
          if (!dl.ok) throw new Error(`Download failed: ${dl.status}`);
          const buf = await dl.arrayBuffer();
          const fileName = `${userId}/${generationId}.mp4`;
          const { error: upErr } = await supabaseAdmin.storage
            .from("ai-videos")
            .upload(fileName, buf, { contentType: "video/mp4", upsert: true });
          if (upErr) throw upErr;
          const { data: { publicUrl } } = supabaseAdmin.storage.from("ai-videos").getPublicUrl(fileName);
          permanentUrl = publicUrl;
        } catch (storageErr) {
          console.error("[generate-happyhorse-video] Storage rehost failed, keeping Replicate URL:", storageErr);
        }

        await supabaseAdmin
          .from("ai_video_generations")
          .update({
            status: "completed",
            video_url: permanentUrl,
            completed_at: new Date().toISOString(),
            error_message: null,
          })
          .eq("id", generationId);

        // Mediathek-Eintrag wird zentral vom DB-Trigger auto_save_ai_video_to_library
        // erzeugt (idempotent). Kein zweiter Insert hier — sonst Duplikate.

        console.log(`[generate-happyhorse-video] ✅ Completed ${generationId}`);
        return;
      }

      if (prediction.status === "failed" || prediction.status === "canceled") {
        throw new Error(prediction.error?.toString() ?? `HappyHorse ${prediction.status}`);
      }
    }
    throw new Error(`HappyHorse prediction timed out after ${Math.round(MAX_POLL_MS / 1000)}s`);
  } catch (err: any) {
    const greenNetReject = isGreenNetRejection(err);
    const tag = greenNetReject ? "green_net_rejected" : "happyhorse_failed";
    console.error(`[generate-happyhorse-video] ❌ Failure (${tag}):`, err?.message ?? err);
    await supabaseAdmin
      .from("ai_video_generations")
      .update({
        status: "failed",
        failed_at: new Date().toISOString(),
        error_message: `[${tag}] ${err?.message ?? "HappyHorse generation failed"}`,
      })
      .eq("id", generationId);

    const { error: refundError } = await supabaseAdmin.rpc("refund_ai_video_credits", {
      p_user_id: userId,
      p_amount_euros: totalCost,
      p_generation_id: generationId,
    });
    if (refundError) {
      console.error("[generate-happyhorse-video] Refund failed:", refundError);
    } else {
      console.log(`[generate-happyhorse-video] ✅ Refunded €${totalCost.toFixed(2)}`);
    }
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Bond QA Agent: short-circuit on x-qa-mock header (no provider call, no credits)
  if (isQaMockRequest(req)) {
    return qaMockResponse({ corsHeaders, kind: "video" });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    );

    const authHeader = req.headers.get("Authorization");
    const user = await resolveRequestUser(req, supabaseClient);
    if (!user) throw new Error("Unauthorized");

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const body = (await req.json()) as GenerateRequest;
    const {
      prompt,
      model,
      image,
      duration = 5,
      aspectRatio = "16:9",
      seed,
    } = body;

    // Capability gate — before wallet, before provider.
    const gate = await gateVideoCapability(
      supabaseAdmin,
      {
        modelId: model,
        resolution: RESOLUTIONS[model],
        mode: inferMode({ modelId: model, startImageUrl: typeof image === "string" && image ? image : null }),
        durationSeconds: Number(duration),
        aspectRatio,
      },
      corsHeaders,
    );
    if (gate.response) return gate.response;

    const resolution = gate.resolutionLabel ?? RESOLUTIONS[model];
    if (!resolution) {
      return new Response(
        JSON.stringify({ error: `Unknown HappyHorse model: ${model}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Validation: prompt OR image required
    const hasImage = typeof image === "string" && image.length > 0;
    if (!hasImage && (!prompt || prompt.trim().length < 3)) {
      return new Response(
        JSON.stringify({ error: "Either an image (I2V) or a prompt (≥3 chars) is required." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (duration < MIN_DURATION || duration > MAX_DURATION) {
      return new Response(
        JSON.stringify({ error: `duration must be between ${MIN_DURATION} and ${MAX_DURATION} seconds.` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (!hasImage && !ALLOWED_ASPECTS.has(aspectRatio)) {
      return new Response(
        JSON.stringify({ error: `aspectRatio must be one of: ${[...ALLOWED_ASPECTS].join(", ")}.` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Canonical catalog price (identical to the UI preview, incl. account discount).
    // Prices must resolve in the WALLET currency — USD carries the FX uplift.
    const { data: walletCurrencyRow } = await supabaseAdmin
      .from("ai_video_wallets")
      .select("currency")
      .eq("user_id", user.id)
      .maybeSingle();
    const walletCurrency = walletCurrencyRow?.currency === 'USD' ? 'USD' : 'EUR';
    const effectiveCps = await resolveAccountCostPerSecond(
      supabaseAdmin, user.id, model, walletCurrency,
    );
    if (effectiveCps === null) return pricingUnavailableResponse(corsHeaders);
    const totalCost = +(effectiveCps * duration).toFixed(2);

    // Wallet check
    const { data: wallet, error: walletError } = await supabaseAdmin
      .from("ai_video_wallets")
      .select("balance_euros, currency")
      .eq("user_id", user.id)
      .single();
    if (walletError || !wallet) {
      return new Response(
        JSON.stringify({ error: "No AI Video wallet found.", code: "NO_WALLET", needsPurchase: true }),
        { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const sym = wallet.currency === "USD" ? "$" : "€";
    if (wallet.balance_euros < totalCost) {
      await trackBusinessEvent("credit_insufficient", user.id, {
        provider: "happyhorse", model, required: totalCost,
        available: wallet.balance_euros, currency: wallet.currency,
      }).catch(() => {});
      return new Response(
        JSON.stringify({
          error: `Insufficient credits. Need ${sym}${totalCost.toFixed(2)}, have ${sym}${wallet.balance_euros.toFixed(2)}`,
          code: "INSUFFICIENT_CREDITS",
          needsPurchase: true,
          required: totalCost,
          available: wallet.balance_euros,
          currency: wallet.currency,
        }),
        { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const rawPrompt = (prompt ?? "").trim();
    const greenNet = sanitizeForHappyHorse(rawPrompt);
    const finalPrompt = greenNet.clean;

    if (greenNet.emptied && !hasImage) {
      return new Response(
        JSON.stringify({
          error: "Prompt was emptied by HappyHorse content filter sanitizer. Please rephrase in English without late-night / device-screen / first-person monologue wording.",
          code: "prompt_emptied_by_filter",
          touched: greenNet.touched,
          suggested_fallback: "ai-hailuo",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (greenNet.touched.length > 0) {
      console.log("[generate-happyhorse-video] green-net sanitizer touched:", greenNet.touched);
    }

    // Create generation row
    const { data: generation, error: genError } = await supabaseAdmin
      .from("ai_video_generations")
      .insert({
        ...(gate.parityColumns ?? {}),
        user_id: user.id,
        prompt: finalPrompt,
        model,
        duration_seconds: duration,
        aspect_ratio: aspectRatio,
        resolution,
        cost_per_second: effectiveCps,
        total_cost_euros: totalCost,
        status: "pending",
        source_image_url: hasImage ? image : null,
      })
      .select()
      .single();
    if (genError) throw genError;

    // Deduct credits
    const { data: newBalance, error: deductError } = await supabaseAdmin.rpc(
      "deduct_ai_video_credits",
      { p_user_id: user.id, p_amount: totalCost, p_generation_id: generation.id },
    );
    if (deductError || newBalance === null || newBalance === undefined) {
      await supabaseAdmin
        .from("ai_video_generations")
        .update({ status: "failed", error_message: "Failed to deduct credits" })
        .eq("id", generation.id);
      throw new Error("Failed to deduct credits");
    }

    // Submit to Replicate
    const REPLICATE_API_KEY = Deno.env.get("REPLICATE_API_KEY") ?? Deno.env.get("REPLICATE_API_TOKEN");
    if (!REPLICATE_API_KEY) throw new Error("REPLICATE_API_KEY not configured");
    const replicate = new Replicate({ auth: REPLICATE_API_KEY });

    const hhInput: Record<string, unknown> = {
      prompt: finalPrompt,
      duration,
      resolution,
      seed: seed ?? Math.floor(Math.random() * 2_147_483_647),
    };
    if (hasImage) {
      hhInput.image = image;
      // aspect_ratio is ignored by the model when image is set, but harmless
    } else {
      hhInput.aspect_ratio = aspectRatio;
    }

    let prediction;
    try {
      prediction = await replicate.predictions.create({
        model: REPLICATE_MODEL,
        input: hhInput,
      });
    } catch (err: any) {
      const greenNetReject = isGreenNetRejection(err);
      const errorClass = greenNetReject ? "green_net_rejected" : "happyhorse_submit_failed";
      console.error(`[generate-happyhorse-video] ❌ Submit failed (${errorClass}):`, err?.message ?? err);
      await supabaseAdmin
        .from("ai_video_generations")
        .update({
          status: "failed",
          failed_at: new Date().toISOString(),
          error_message: `[${errorClass}] ${err?.message ?? "HappyHorse submit failed"}`,
        })
        .eq("id", generation.id);
      await supabaseAdmin.rpc("refund_ai_video_credits", {
        p_user_id: user.id,
        p_amount_euros: totalCost,
        p_generation_id: generation.id,
      });
      return new Response(
        JSON.stringify({
          error: greenNetReject
            ? "HappyHorse content filter (Green Net) rejected the prompt. Credits refunded. Try Hailuo as fallback."
            : "HappyHorse submission failed. Credits refunded.",
          code: greenNetReject ? "green_net_rejected" : "HAPPYHORSE_ERROR",
          suggested_fallback: greenNetReject ? "ai-hailuo" : undefined,
          touched: greenNetReject ? greenNet.touched : undefined,
          details: err?.message,
        }),
        { status: greenNetReject ? 422 : 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    await supabaseAdmin
      .from("ai_video_generations")
      .update({
        status: "processing",
        started_at: new Date().toISOString(),
        artlist_job_id: prediction.id,
      })
      .eq("id", generation.id);

    await trackAIGeneration("started", user.id, {
      provider: "happyhorse",
      model,
      duration_s: duration,
      cost_eur: totalCost,
      aspect_ratio: aspectRatio,
      resolution,
      generation_id: generation.id,
    }).catch(() => {});

    // @ts-ignore EdgeRuntime is provided by Supabase
    EdgeRuntime.waitUntil(
      rehostAndPersist({
        predictionId: prediction.id,
        generationId: generation.id,
        userId: user.id,
        totalCost,
        prompt: finalPrompt,
        model,
        aspectRatio,
        duration,
        resolution,
        replicate,
      }),
    );

    return new Response(
      JSON.stringify({
        success: true,
        generationId: generation.id,
        predictionId: prediction.id,
        cost: totalCost,
        currency: wallet.currency,
        newBalance,
        status: "processing",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
    );
  } catch (error: any) {
    console.error("[generate-happyhorse-video] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 },
    );
  }
});

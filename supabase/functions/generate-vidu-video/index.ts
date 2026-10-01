// generate-vidu-video — Vidu Q2 via Replicate (T2V / I2V / Reference2V)
// The Reference2V flavour is the differentiator: 1–7 reference images
// (character + product + location + style + props) blended into one 5s clip.
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { resolveRequestUser } from "../_shared/internalAuth.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import Replicate from "npm:replicate@0.25.2";
import { isQaMockRequest, qaMockResponse } from "../_shared/qaMock.ts"; // [qa-mock-injected]
import { gateVideoCapability, inferMode } from "../_shared/videoCapabilityGate.ts";
import { trackAIGeneration, trackBusinessEvent } from "../_shared/telemetry.ts";
import { resolveCostPerSecond } from "../_shared/videoPricingCatalog.ts";
import { pricingUnavailableResponse } from "../_shared/accountVideoPricing.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS, PUT, DELETE, PATCH",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-qa-mock",
};

type ViduModel = "vidu-q2-reference" | "vidu-q2-i2v" | "vidu-q2-t2v";


// NOTE: no hand-written provider-slug map here. The concrete Replicate
// contract per (model x mode) is canonical truth
// (supabase/functions/_shared/videoModelSpecs.ts) and is resolved by the
// capability gate via `resolveRouteIdentity`. Our q2-* identifiers (kept for
// backward compat across persisted runs) map onto the hosted q3 family;
// `vidu/q2-*` was retired by Replicate and returns 404.
// Native multi-reference does NOT exist on q3: the first image is sent as
// `start_image`, any further uploads are prompt-assistance only
// (buildReferenceSuffix) and are NOT provider reference inputs.

// Verified Replicate input schema for `vidu/q3-pro` / `vidu/q3-turbo` (11.08.2026):
//   duration 1–16 (default 5) · resolution 540p|720p|1080p ·
//   aspect_ratio 16:9|9:16|3:4|4:3|1:1 · start_image · end_image ·
//   audio (bool, default true) · seed. No negative_prompt, no reference array.
const MIN_DURATION = 1;
const MAX_DURATION = 16;
const DEFAULT_DURATION = 5;
const ALLOWED_ASPECTS = new Set(["16:9", "9:16", "1:1", "4:3", "3:4"]);
const ALLOWED_RESOLUTIONS = new Set(["540p", "720p", "1080p"]);
// Route truth (Replicate `vidu/q3-*`, 11.08.2026): exactly ONE image input
// (`start_image`, optionally paired with `end_image`). There is no reference
// array, so more than one uploaded reference is REJECTED instead of being
// folded into the prompt and billed as if it had been sent.
const MAX_REFERENCES = 1;
const VALID_ROLES = new Set(["character", "product", "location", "style", "prop"]);

interface GenerateRequest {
  prompt: string;
  model: ViduModel;
  aspectRatio?: string;
  /** Reference2V: 1–7 image URLs. I2V: first entry used as start image. */
  referenceImages?: string[];
  /** Parallel array — same length as referenceImages — drives prompt augmentation. */
  referenceRoles?: string[];
  /** I2V single start image (alternative to referenceImages[0]). */
  startImageUrl?: string;
  /** Optional end frame — Vidu Q3 interpolates start → end. */
  endImageUrl?: string;
  duration?: number;
  resolution?: string;
  /** Native audio track (Q3 only, default on). */
  audio?: boolean;
  seed?: number;
}

/** Build an English suffix that tells Vidu how to USE each reference image. */
function buildReferenceSuffix(roles: string[] | undefined, count: number): string {
  if (!roles || roles.length === 0 || count === 0) return "";
  const parts: string[] = [];
  roles.slice(0, count).forEach((role, idx) => {
    const n = idx + 1;
    switch (role) {
      case "character":
        parts.push(`featuring the character from image ${n}`);
        break;
      case "product":
        parts.push(`prominently showing the product from image ${n}`);
        break;
      case "location":
        parts.push(`set in the location from image ${n}`);
        break;
      case "style":
        parts.push(`in the visual style of image ${n}`);
        break;
      case "prop":
        parts.push(`incorporating the prop from image ${n}`);
        break;
    }
  });
  return parts.length > 0 ? `, ${parts.join(", ")}` : "";
}

async function rehostAndPersist(params: {
  predictionId: string;
  generationId: string;
  userId: string;
  totalCost: number;
  prompt: string;
  model: ViduModel;
  aspectRatio: string;
  replicate: Replicate;
}) {
  const { predictionId, generationId, userId, totalCost, prompt, model, aspectRatio, replicate } = params;
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
      console.log(`[generate-vidu-video] Pred ${predictionId} status=${prediction.status}`);

      if (prediction.status === "succeeded") {
        const outputUrl = Array.isArray(prediction.output) ? prediction.output[0] : prediction.output;
        if (!outputUrl) throw new Error("Vidu succeeded but returned no output URL");

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
          console.error("[generate-vidu-video] Storage rehost failed, keeping Replicate URL:", storageErr);
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

        console.log(`[generate-vidu-video] ✅ Completed ${generationId}`);
        return;
      }

      if (prediction.status === "failed" || prediction.status === "canceled") {
        throw new Error(prediction.error?.toString() ?? `Vidu ${prediction.status}`);
      }
    }
    throw new Error(`Vidu prediction timed out after ${Math.round(MAX_POLL_MS / 1000)}s`);
  } catch (err: any) {
    console.error(`[generate-vidu-video] ❌ Failure:`, err?.message ?? err);
    await supabaseAdmin
      .from("ai_video_generations")
      .update({
        status: "failed",
        failed_at: new Date().toISOString(),
        error_message: err?.message ?? "Vidu generation failed",
      })
      .eq("id", generationId);

    const { error: refundError } = await supabaseAdmin.rpc("refund_ai_video_credits", {
      p_user_id: userId,
      p_amount_euros: totalCost,
      p_generation_id: generationId,
    });
    if (refundError) {
      console.error("[generate-vidu-video] Refund failed:", refundError);
    } else {
      console.log(`[generate-vidu-video] ✅ Refunded €${totalCost.toFixed(2)}`);
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
      aspectRatio = "16:9",
      referenceImages = [],
      referenceRoles = [],
      startImageUrl,
      endImageUrl,
      duration: rawDuration,
      resolution: rawResolution,
      audio,
      seed,
    } = body;

    const duration = Number(rawDuration ?? DEFAULT_DURATION);
    const requestedResolution = String(rawResolution ?? "1080p");

    // Capability gate — before wallet, before provider. No clamping.
    const gate = await gateVideoCapability(
      supabaseAdmin,
      {
        modelId: model,
        // Route truth: q3-pro/q3-turbo accept exactly ONE image input
        // (`start_image`, optionally paired with `end_image`). Extra uploads are
        // AdTool prompt-assistance, never provider references — so the mode is
        // resolved from the image that is really sent, not from the upload count.
        mode: inferMode({ modelId: model,
          startImageUrl: startImageUrl ?? (Array.isArray(referenceImages) ? referenceImages[0] : undefined),
          endImageUrl,
        }),
        resolution: requestedResolution,
        durationSeconds: duration,
        aspectRatio,
      },
      corsHeaders,
    );
    if (gate.response) return gate.response;
    // Provider contract from canonical — never a second inferred slug.
    const replicateModel = gate.routeIdentity?.providerModelSlug;
    const resolution = gate.resolutionLabel ?? requestedResolution;
    // Price in the WALLET currency — USD carries the FX uplift (1 EUR ~ 1.15 USD).
    const { data: viduWalletCurrencyRow } = await supabaseAdmin
      .from("ai_video_wallets")
      .select("currency")
      .eq("user_id", user.id)
      .maybeSingle();
    const viduWalletCurrency = viduWalletCurrencyRow?.currency === 'USD' ? 'USD' : 'EUR';
    // Canonical catalog is the ONLY price source — no local fallback table.
    const effectivePerSecond = resolveCostPerSecond(model, viduWalletCurrency);
    if (effectivePerSecond == null) return pricingUnavailableResponse(corsHeaders);
    const totalCost = Number((effectivePerSecond * duration).toFixed(2));
    if (!replicateModel) {
      return new Response(JSON.stringify({ error: `Unknown Vidu model: ${model}` }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!prompt || prompt.trim().length < 3) {
      return new Response(JSON.stringify({ error: "Prompt is required (min 3 chars)." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!ALLOWED_ASPECTS.has(aspectRatio)) {
      return new Response(JSON.stringify({ error: "aspectRatio must be 16:9, 9:16, 1:1, 4:3 or 3:4." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Mode-specific validation
    if (model === "vidu-q2-reference") {
      if (!Array.isArray(referenceImages) || referenceImages.length < 1) {
        return new Response(JSON.stringify({
          error: "Reference2V requires at least 1 reference image.",
          code: "MISSING_REFERENCES",
        }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (referenceImages.length > MAX_REFERENCES) {
        return new Response(JSON.stringify({
          error:
            "Vidu Q3 accepts exactly one image (start frame, optionally with an end frame). " +
            "Additional reference images are NOT sent to the provider — please remove them.",
          code: "TOO_MANY_REFERENCES",
        }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      for (const role of referenceRoles) {
        if (role && !VALID_ROLES.has(role)) {
          return new Response(JSON.stringify({
            error: `Invalid reference role: ${role}`,
          }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
      }
    }
    if (model === "vidu-q2-i2v") {
      const startImg = startImageUrl ?? referenceImages[0];
      if (!startImg) {
        return new Response(JSON.stringify({
          error: "I2V requires a start image (startImageUrl or referenceImages[0]).",
          code: "MISSING_START_IMAGE",
        }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

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
      await trackBusinessEvent('credit_insufficient', user.id, {
        provider: 'vidu', model, required: totalCost,
        available: wallet.balance_euros, currency: wallet.currency,
      }).catch(() => {});
      return new Response(
        JSON.stringify({
          error: `Insufficient credits. Need ${sym}${totalCost.toFixed(2)}, have ${sym}${wallet.balance_euros.toFixed(2)}`,
          code: "INSUFFICIENT_CREDITS", needsPurchase: true,
          required: totalCost, available: wallet.balance_euros, currency: wallet.currency,
        }),
        { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
      // [legacy] Per-user video rate limit removed (single unlimited plan).

    // Augment prompt with reference roles for better consistency
    const refSuffix = model === "vidu-q2-reference"
      ? buildReferenceSuffix(referenceRoles, referenceImages.length)
      : "";
    const finalPrompt = `${prompt}${refSuffix}`.trim();

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
        cost_per_second: effectivePerSecond,
        total_cost_euros: totalCost,
        status: "pending",
        source_image_url: startImageUrl ?? referenceImages[0] ?? null,
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

    const viduInput: Record<string, unknown> = {
      prompt: finalPrompt,
      seed: seed ?? Math.floor(Math.random() * 1_000_000),
      aspect_ratio: aspectRatio,
      duration,
      resolution,
      audio: audio !== false,
    };

    if (model === "vidu-q2-reference") {
      // q3-pro accepts exactly one image; more than one is rejected above.
      const img = referenceImages[0];
      if (img) viduInput.start_image = img;
    } else if (model === "vidu-q2-i2v") {
      const img = startImageUrl ?? referenceImages[0];
      if (img) viduInput.start_image = img;
    }
    // End frame is supported by both q3-pro and q3-turbo (start-end interpolation).
    if (endImageUrl && model !== "vidu-q2-t2v") viduInput.end_image = endImageUrl;

    let prediction;
    try {
      prediction = await replicate.predictions.create({
        model: replicateModel,
        input: viduInput,
      });
    } catch (err: any) {
      console.error("[generate-vidu-video] ❌ Submit failed:", err);
      await supabaseAdmin
        .from("ai_video_generations")
        .update({
          status: "failed",
          failed_at: new Date().toISOString(),
          error_message: err?.message ?? "Vidu submit failed",
        })
        .eq("id", generation.id);
      await supabaseAdmin.rpc("refund_ai_video_credits", {
        p_user_id: user.id,
        p_amount_euros: totalCost,
        p_generation_id: generation.id,
      });
      return new Response(
        JSON.stringify({ error: "Vidu submission failed. Credits refunded.", code: "VIDU_ERROR", details: err?.message }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
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

    await trackAIGeneration('started', user.id, {
      provider: 'vidu', model, duration_s: duration,
      cost_eur: totalCost, aspect_ratio: aspectRatio, resolution,
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
    console.error("[generate-vidu-video] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 },
    );
  }
});

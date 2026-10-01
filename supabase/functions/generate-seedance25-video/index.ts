import { resolveRequestUser } from "../_shared/internalAuth.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { isQaMockRequest, qaMockResponse } from "../_shared/qaMock.ts";
import { gateVideoCapability, inferMode } from "../_shared/videoCapabilityGate.ts";
import { trackAIGeneration, trackBusinessEvent } from "../_shared/telemetry.ts";
import { resolveCostPerSecond } from "../_shared/videoPricingCatalog.ts";
import { resolvePricingId } from "../_shared/videoModelSpecs.ts";
import { resolveAccountCostPerSecond, pricingUnavailableResponse, resolveWalletCurrency } from "../_shared/accountVideoPricing.ts";
import { referenceBillableSeconds } from "../_shared/referenceVideoBilling.ts";
import {
  createSeedance25Task,
  getModelArkTask,
  storeModelArkVideo,
  MODELARK_JOB_PREFIX,
} from "../_shared/modelark.ts";
import {
  checkImageDimensions,
  describeImageViolation,
  describeProviderImageError,
  imageRequirementsFor,
  probeRemoteImageSize,
  type ImageLocale,
} from "../_shared/videoImageRequirements.ts";
import {
  describePreflightViolation,
  preflightVideoRequest,
  type PreflightLocale,
} from "../_shared/videoRequestPreflight.ts";
import {
  bindReferenceSlots,
  composeReferencePrompt,
  findDuplicateReferences,
  resolveRejectedReference,
  type BoundReferenceSlot,
} from "../_shared/referenceBinding.ts";


const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS, PUT, DELETE, PATCH",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-qa-mock",
};

const MODEL_ID = "seedance-2-5";
const MIN_DURATION = 4;
const MAX_DURATION = 30;

interface GenerateRequest {
  prompt: string;
  model?: string;
  /** 4–30 s, or -1 for the provider's smart duration. */
  duration: number;
  aspectRatio?: string;
  /** ModelArk supports 480p and 720p output for Seedance 2.5 — 1080p is rejected. */
  resolution?: "480p" | "720p";
  startImageUrl?: string;
  endImageUrl?: string;
  referenceImageUrls?: string[];
  /**
   * UI role per reference image, same order as `referenceImageUrls`
   * (character | product | location | style | prop). Turned into explicit
   * "@Image N is …" instructions server-side.
   */
  referenceRoles?: (string | null)[];
  /** Optional client content hashes, same order — duplicate detection only. */
  referenceHashes?: (string | null)[];
  /** Reference clips (role `reference_video`, max 10). */
  referenceVideoUrls?: string[];
  /** Single reference clip sent by the shared v2v UI. */
  referenceVideoUrl?: string;
  /**
   * Measured length in seconds of each reference clip, in the same order as
   * `referenceVideoUrls` (then `referenceVideoUrl`). Used for billing — the
   * provider charges reference seconds like output seconds. Missing or
   * implausible values fall back to the model maximum, never to zero.
   */
  referenceVideoDurations?: (number | null)[];
  /** Reference audio clips (role `reference_audio`, max 10). */
  referenceAudioUrls?: string[];
  /** Native audio generation (`generate_audio`). */
  generateAudio?: boolean;
  /**
   * Explicit ambience-only mode for studio pipelines that add speech later.
   * AI Video Studio normally leaves this false because Seedance 2.5 can
   * generate prompt-controlled native dialogue together with its audio.
   */
  suppressDialogue?: boolean;
  seed?: number;
}


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (isQaMockRequest(req)) {
    return qaMockResponse({ corsHeaders, kind: "video" });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    );

    const user = await resolveRequestUser(req, supabaseClient);
    if (!user) throw new Error("Unauthorized");

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const body = await req.json() as GenerateRequest;
    const {
      prompt,
      duration,
      aspectRatio = "16:9",
      resolution = "720p",
      startImageUrl,
      endImageUrl,
      referenceImageUrls,
      referenceRoles,
      referenceHashes,
      referenceVideoUrls,
      referenceVideoUrl,
      referenceVideoDurations,
      referenceAudioUrls,
      generateAudio = false,
      suppressDialogue = false,
      seed,
    } = body;

    // Capability gate — before wallet, before provider.
    const generationMode = inferMode({
      modelId: "seedance-2-5",
      startImageUrl,
      endImageUrl,
      referenceImageUrls: Array.isArray(referenceImageUrls) ? referenceImageUrls : null,
      videoUrl: referenceVideoUrl ?? (referenceVideoUrls?.[0] ?? null),
    });
    const gate = await gateVideoCapability(
      supabaseAdmin,
      {
        modelId: "seedance-2-5",
        mode: generationMode,
        resolution,
        durationSeconds: Number(duration),
        aspectRatio,
      },
      corsHeaders,
    );
    if (gate.response) return gate.response;


    const refVideos = [
      ...(referenceVideoUrls ?? []),
      ...(referenceVideoUrl ? [referenceVideoUrl] : []),
    ].filter(Boolean).slice(0, 10);
    const refAudios = (referenceAudioUrls ?? []).filter(Boolean).slice(0, 10);

    // Ambience-only: sound yes, speech no. Same wording as the composer's
    // hybrid-ambient path so both routes condition the model identically.
    const NO_SPEECH_CLAUSE =
      "[AUDIO] Ambient sound design only: room tone, foley, natural environment " +
      "and optional instrumental music. No spoken words, no dialogue, no narration, " +
      "no singing. Characters do not talk and their lips stay closed.";
    const preLocale = ((req.headers.get("x-locale") ?? "en").slice(0, 2)) as PreflightLocale;

    // ── Semantic reference binding ──────────────────────────────────────
    // UI slot order is kept verbatim; slot i becomes provider content[i+1]
    // and is addressed as "@Image i+1". Roles arrive from the UI and are
    // written into the prompt here, so the user never types @ref-1.
    let referenceSlots: BoundReferenceSlot[] = [];
    if (Array.isArray(referenceImageUrls) && referenceImageUrls.length > 0) {
      const urls = referenceImageUrls.filter((u) => typeof u === "string" && u.trim().length > 0);
      const roles = Array.isArray(referenceRoles) ? referenceRoles.slice(0, urls.length) : undefined;
      const hashes = Array.isArray(referenceHashes) ? referenceHashes : [];
      const duplicates = findDuplicateReferences(
        urls.map((url, i) => ({ url, hash: hashes[i] ?? null })),
      );
      if (duplicates.length > 0) {
        const d = duplicates[0];
        const msg = preLocale === "de"
          ? `Referenzbild ${d.uiIndex + 1} ist identisch mit Referenzbild ${d.duplicateOf + 1}. Bitte entferne das Duplikat – jedes Bild darf nur einen Slot belegen.`
          : preLocale === "es"
            ? `La imagen de referencia ${d.uiIndex + 1} es idéntica a la imagen ${d.duplicateOf + 1}. Elimina el duplicado: cada imagen solo puede ocupar un espacio.`
            : `Reference image ${d.uiIndex + 1} is identical to reference image ${d.duplicateOf + 1}. Please remove the duplicate – each image may occupy only one slot.`;
        return new Response(
          JSON.stringify({
            error: msg,
            code: "DUPLICATE_REFERENCE_IMAGES",
            duplicates: duplicates.map((x) => ({ index: x.uiIndex, duplicateOf: x.duplicateOf, by: x.by })),
            rejectedReferenceIndex: d.uiIndex,
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      referenceSlots = bindReferenceSlots(urls, roles);
    }
    const boundPrompt = composeReferencePrompt(String(prompt ?? ""), referenceSlots);

    const effectivePrompt =
      generateAudio && suppressDialogue
        ? `${boundPrompt}\n\n${NO_SPEECH_CLAUSE}`
        : boundPrompt;

    // Request-shape preflight (prompt length, exclusive input slots) — runs
    // before the wallet and before ModelArk. A provider 400/422 must never be
    // our first validation layer.
    {
      // The prompt-length check runs on the text the provider actually
      // receives (user prompt + reference instructions), not on the raw input.
      const pre = preflightVideoRequest({
        modelId: MODEL_ID,
        prompt: boundPrompt,
        startImageUrl,
        endImageUrl,
        referenceImageUrls: Array.isArray(referenceImageUrls) ? referenceImageUrls : null,
        referenceVideoUrls: [
          ...(referenceVideoUrls ?? []),
          ...(referenceVideoUrl ? [referenceVideoUrl] : []),
        ],
      });
      if (!pre.ok && pre.violation) {
        return new Response(
          JSON.stringify({
            error: describePreflightViolation(pre.violation, preLocale, "Seedance 2.5"),
            code: pre.code,
            violation: pre.violation.kind,
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    if (!prompt || !prompt.trim()) {
      return new Response(JSON.stringify({ error: "Prompt is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // `-1` = provider smart duration: billed at the maximum length up front and
    // corrected down once ModelArk reports the real clip length.
    const smartDuration = duration === -1;
    if (
      !smartDuration &&
      (!Number.isFinite(duration) || duration < MIN_DURATION || duration > MAX_DURATION)
    ) {
      return new Response(
        JSON.stringify({
          error: `Duration must be between ${MIN_DURATION} and ${MAX_DURATION} seconds for Seedance 2.5`,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const billedDuration = smartDuration ? MAX_DURATION : duration;

    /**
     * Image pre-check — runs BEFORE any credit deduction or provider call.
     * ModelArk rejects images below 300 px width or outside the 1:2.5–2.5:1
     * ratio band with a raw 400; we catch that here with a readable message
     * and without charging the user.
     */
    const locale = ((req.headers.get("x-locale") ?? "en").slice(0, 2)) as ImageLocale;
    const requirements = imageRequirementsFor(MODEL_ID, "seedance");
    const imagesToCheck = [
      startImageUrl,
      endImageUrl,
      ...((referenceImageUrls ?? []) as string[]),
    ].filter(Boolean) as string[];

    for (const url of imagesToCheck) {
      const dims = await probeRemoteImageSize(url);
      if (!dims) continue; // unknown format → let the provider decide
      const check = checkImageDimensions(dims, requirements);
      if (!check.ok) {
        console.warn("[generate-seedance25-video] image rejected pre-flight", {
          url, dims, violation: check.violation,
        });
        return new Response(
          JSON.stringify({
            error: describeImageViolation(check, locale, "Seedance 2.5"),
            code: "IMAGE_REQUIREMENTS_NOT_MET",
            violation: check.violation,
            width: dims.width,
            height: dims.height,
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }




    const currency = await resolveWalletCurrency(supabaseAdmin, user.id);
    if (currency === null) return pricingUnavailableResponse(corsHeaders);
    // Billing identity comes from the canonical registry (tier-scoped pricing
    // id), never from a hand-written string here — the UI preview resolves the
    // identical id, so display and deduction cannot diverge.
    const pricingModelId =
      resolvePricingId(MODEL_ID, generationMode, gate.resolutionLabel ?? resolution) ?? MODEL_ID;

    const costPerSecond = await resolveAccountCostPerSecond(
      supabaseAdmin, user.id, pricingModelId, currency,
    );
    if (costPerSecond === null) return pricingUnavailableResponse(corsHeaders);
    // Reference clips are billed like extra output seconds (BytePlus bills the
    // material the model reads — verified 10.09.2026). The UI shows the same
    // split before generation.
    const referenceSeconds = referenceBillableSeconds(
      pricingModelId,
      refVideos.length,
      referenceVideoDurations,
    );
    // Fail closed exactly like an unreadable wallet currency: we never estimate
    // reference length, and no job starts before the billable duration is known.
    if (referenceSeconds === null) {
      return new Response(
        JSON.stringify({
          error:
            "The length of the reference clip could not be determined. Please upload the reference video again or use another compatible video file.",
          code: "REFERENCE_DURATION_UNKNOWN",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const billableSeconds = billedDuration + referenceSeconds;
    const totalCost = +(billableSeconds * costPerSecond).toFixed(4);

    const { data: wallet, error: walletError } = await supabaseAdmin
      .from("ai_video_wallets")
      .select("balance_euros, currency")
      .eq("user_id", user.id)
      .single();

    if (walletError || !wallet) {
      return new Response(
        JSON.stringify({
          error: "No AI Video wallet found. Please purchase credits first.",
          code: "NO_WALLET",
          needsPurchase: true,
        }),
        { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const currencySymbol = wallet.currency === "USD" ? "$" : "€";
    if (wallet.balance_euros < totalCost) {
      await trackBusinessEvent("credit_insufficient", user.id, {
        provider: "seedance25",
        model: MODEL_ID,
        required: totalCost,
        available: wallet.balance_euros,
        currency: wallet.currency,
      }).catch(() => {});
      return new Response(
        JSON.stringify({
          error: `Insufficient credits. Need ${currencySymbol}${totalCost.toFixed(2)}, have ${currencySymbol}${wallet.balance_euros.toFixed(2)}`,
          code: "INSUFFICIENT_CREDITS",
          needsPurchase: true,
          required: totalCost,
          available: wallet.balance_euros,
          currency: wallet.currency,
        }),
        { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: generation, error: genError } = await supabaseAdmin
      .from("ai_video_generations")
      .insert({
        ...(gate.parityColumns ?? {}),
        user_id: user.id,
        prompt,
        model: MODEL_ID,
        duration_seconds: billedDuration,
        aspect_ratio: aspectRatio,
        resolution,
        cost_per_second: costPerSecond,
        total_cost_euros: totalCost,
        status: "pending",
        source_image_url: startImageUrl || null,
      })
      .select()
      .single();

    if (genError) throw genError;

    const { data: newBalance, error: deductError } = await supabaseAdmin.rpc(
      "deduct_ai_video_credits",
      { p_user_id: user.id, p_amount: totalCost, p_generation_id: generation.id },
    );

    if (deductError || newBalance === null || newBalance === undefined) {
      console.error("[generate-seedance25-video] Deduct credits error:", deductError);
      await supabaseAdmin
        .from("ai_video_generations")
        .update({ status: "failed", error_message: "Failed to deduct credits" })
        .eq("id", generation.id);
      throw new Error("Failed to deduct credits");
    }

    const refund = async (reason: string) => {
      await supabaseAdmin
        .from("ai_video_generations")
        .update({
          status: "failed",
          failed_at: new Date().toISOString(),
          error_message: reason.slice(0, 500),
        })
        .eq("id", generation.id);
      const { error: refundError } = await supabaseAdmin.rpc("refund_ai_video_credits", {
        p_user_id: user.id,
        p_amount_euros: totalCost,
        p_generation_id: generation.id,
      });
      if (refundError) console.error("[generate-seedance25-video] Refund failed:", refundError);
    };

    /**
     * Smart duration (-1) is billed at the 30 s maximum up front. Once the
     * provider reports the real clip length, the unused seconds go straight
     * back to the wallet.
     */
    const settleSmartDuration = async (actualSeconds?: number) => {
      if (!smartDuration || !actualSeconds || actualSeconds >= billedDuration) return;
      // Only the OUTPUT seconds shrink — the reference seconds were really read
      // by the provider and stay billed.
      const actualCost = +(
        (Math.max(MIN_DURATION, actualSeconds) + referenceSeconds) * costPerSecond
      ).toFixed(4);
      const delta = +(totalCost - actualCost).toFixed(4);
      if (delta <= 0.001) return;
      const { error: refundError } = await supabaseAdmin.rpc("refund_ai_video_credits", {
        p_user_id: user.id,
        p_amount_euros: delta,
        p_generation_id: generation.id,
        // Distinct from the failure refund: unused smart-duration seconds.
        p_refund_key: `gen:${generation.id}:smart_duration`,
      });
      if (refundError) {
        console.error("[generate-seedance25-video] Smart-duration refund failed:", refundError);
        return;
      }
      await supabaseAdmin
        .from("ai_video_generations")
        .update({ duration_seconds: actualSeconds, total_cost_euros: actualCost })
        .eq("id", generation.id);
    };

    let taskId: string;
    try {
      taskId = await createSeedance25Task({
        prompt: effectivePrompt,
        duration: smartDuration ? -1 : duration,
        resolution,
        aspectRatio,
        firstFrameUrl: startImageUrl,
        lastFrameUrl: endImageUrl,
        // Exactly the bound slots, in UI order — no hidden extra images.
        referenceImageUrls: referenceSlots.length > 0 ? referenceSlots.map((s) => s.url) : referenceImageUrls,
        referenceVideoUrls: refVideos,
        referenceAudioUrls: refAudios,
        generateAudio,
        seed,
      });

    } catch (providerError: any) {
      const rawMessage = String(providerError?.message ?? "Unknown error");
      console.error("[generate-seedance25-video] ModelArk error:", rawMessage);
      // Raw provider JSON (incl. request ids) stays in the log and in the
      // generation row; the user gets one readable, localized sentence.
      // `content[N]` in the provider message is mapped back to the exact UI
      // reference slot so the customer knows WHICH thumbnail was rejected.
      const rejected = resolveRejectedReference(rawMessage, referenceSlots);
      let friendly = describeProviderImageError(rawMessage, locale);
      if (rejected) {
        const roleNote = rejected.role ? ` (${rejected.role})` : "";
        const slotLine = locale === "de"
          ? `Betroffen ist Referenzbild ${rejected.imageNumber}${roleNote}. Tausche dieses Bild aus – die anderen Referenzen sind nicht betroffen.`
          : locale === "es"
            ? `Afecta a la imagen de referencia ${rejected.imageNumber}${roleNote}. Sustituye esa imagen; las demás referencias no se ven afectadas.`
            : `Reference image ${rejected.imageNumber}${roleNote} was rejected. Replace that image – the other references are unaffected.`;
        friendly = `${friendly} ${slotLine}`;
      }
      await refund(`ModelArk Error: ${rawMessage}`);
      return new Response(
        JSON.stringify({
          error: friendly,
          code: "MODELARK_ERROR",
          ...(rejected
            ? {
                rejectedContentIndex: rejected.contentIndex,
                rejectedReferenceIndex: rejected.uiIndex,
                rejectedReferenceRole: rejected.role,
              }
            : {}),
        }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );

    }

    await supabaseAdmin
      .from("ai_video_generations")
      .update({
        status: "processing",
        started_at: new Date().toISOString(),
        artlist_job_id: `${MODELARK_JOB_PREFIX}${taskId}`,
      })
      .eq("id", generation.id);

    await trackAIGeneration("started", user.id, {
      provider: "modelark",
      model: MODEL_ID,
      duration_s: billedDuration,
      cost_eur: totalCost,
      aspect_ratio: aspectRatio,
      resolution,
      generation_id: generation.id,
    }).catch(() => {});

    // Background poll — ModelArk has no webhook. `modelark-poll` acts as the
    // safety net when this background task is cut short.
    const pollInBackground = async () => {
      const deadline = Date.now() + 12 * 60 * 1000;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 8000));
        try {
          const task = await getModelArkTask(taskId);
          if (task.status === "succeeded" && task.videoUrl) {
            const permanentUrl = await storeModelArkVideo(
              supabaseAdmin,
              "ai-videos",
              `${user.id}/${generation.id}.mp4`,
              task.videoUrl,
            );
            await supabaseAdmin
              .from("ai_video_generations")
              .update({
                status: "completed",
                video_url: permanentUrl,
                completed_at: new Date().toISOString(),
                error_message: null,
              })
              .eq("id", generation.id);
            await settleSmartDuration(task.durationSeconds);

            await trackAIGeneration("completed", user.id, {
              provider: "modelark",
              model: MODEL_ID,
              cost_eur: totalCost,
              generation_id: generation.id,
            }).catch(() => {});
            return;
          }
          if (task.status === "failed" || task.status === "cancelled") {
            await refund(task.error ?? "ModelArk task failed");
            return;
          }
        } catch (err) {
          console.error("[generate-seedance25-video] poll error:", err);
        }
      }
      console.warn(`[generate-seedance25-video] Poll deadline hit for task ${taskId}`);
    };

    // @ts-ignore EdgeRuntime is provided by the Supabase runtime
    if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) {
      // @ts-ignore
      EdgeRuntime.waitUntil(pollInBackground());
    } else {
      void pollInBackground();
    }

    return new Response(
      JSON.stringify({
        success: true,
        generationId: generation.id,
        taskId,
        cost: totalCost,
        currency: wallet.currency,
        newBalance,
        status: "processing",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
    );
  } catch (error: any) {
    console.error("[generate-seedance25-video] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 },
    );
  }
});

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { resolveRequestUser } from "../_shared/internalAuth.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { isQaMockRequest, qaMockResponse } from "../_shared/qaMock.ts"; // [qa-mock-injected]
import { gateVideoCapability, inferMode } from "../_shared/videoCapabilityGate.ts";
import { trackAIGeneration, trackBusinessEvent } from "../_shared/telemetry.ts";
import { resolveAccountCostPerSecond, pricingUnavailableResponse } from "../_shared/accountVideoPricing.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS, PUT, DELETE, PATCH",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-qa-mock",
};

const RUNWAY_API_BASE = "https://api.dev.runwayml.com/v1";
const RUNWAY_API_VERSION = "2024-11-06";

// Aspect ratio → Runway "ratio" string (Aleph supported ratios)
const RATIO_MAP: Record<string, string> = {
  "16:9": "1280:720",
  "9:16": "720:1280",
  "1:1": "960:960",
  "4:3": "1104:832",
  "3:4": "832:1104",
  "21:9": "1584:672",
};

interface GenerateRequest {
  prompt: string;
  model: "runway-gen4-aleph";
  duration: number; // 5 or 10 seconds
  aspectRatio: string;
  referenceVideoUrl?: string;
  startImageUrl?: string;
  videoReferenceType?: "feature" | "base";
}

async function pollAndPersist(params: {
  taskId: string;
  generationId: string;
  userId: string;
  totalCost: number;
  prompt: string;
  aspectRatio: string;
  duration: number;
  runwayKey: string;
}) {
  const { taskId, generationId, userId, totalCost, prompt, aspectRatio, duration, runwayKey } = params;
  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  const startedAt = Date.now();
  const MAX_POLL_MS = 8 * 60 * 1000; // 8 minutes hard cap
  const POLL_INTERVAL_MS = 5000;

  try {
    while (Date.now() - startedAt < MAX_POLL_MS) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));

      const res = await fetch(`${RUNWAY_API_BASE}/tasks/${taskId}`, {
        headers: {
          Authorization: `Bearer ${runwayKey}`,
          "X-Runway-Version": RUNWAY_API_VERSION,
        },
      });

      if (!res.ok) {
        const txt = await res.text();
        console.error(`[generate-runway-video] Poll failed ${res.status}:`, txt);
        if (res.status >= 400 && res.status < 500 && res.status !== 429) {
          throw new Error(`Runway poll error ${res.status}: ${txt}`);
        }
        continue;
      }

      const task = await res.json();
      const status = task?.status as string | undefined;
      console.log(`[generate-runway-video] Task ${taskId} status=${status}`);

      if (status === "SUCCEEDED") {
        const outputUrl: string | undefined = Array.isArray(task.output) ? task.output[0] : task.output;
        if (!outputUrl) throw new Error("Runway succeeded but returned no output URL");

        // Download & re-host on permanent storage
        let permanentUrl = outputUrl;
        try {
          const dl = await fetch(outputUrl);
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
          console.error("[generate-runway-video] Storage rehost failed, keeping Runway URL:", storageErr);
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

        console.log(`[generate-runway-video] ✅ Completed ${generationId}`);
        return;
      }

      if (status === "FAILED" || status === "CANCELLED") {
        const errMsg = task?.failure || task?.failure_code || `Runway task ${status}`;
        throw new Error(errMsg);
      }
      // PENDING / RUNNING / THROTTLED → keep polling
    }

    throw new Error(`Runway task timed out after ${Math.round(MAX_POLL_MS / 1000)}s`);
  } catch (err: any) {
    console.error(`[generate-runway-video] ❌ Failure:`, err?.message ?? err);

    await supabaseAdmin
      .from("ai_video_generations")
      .update({
        status: "failed",
        failed_at: new Date().toISOString(),
        error_message: err?.message ?? "Runway generation failed",
      })
      .eq("id", generationId);

    // Refund
    const { error: refundError } = await supabaseAdmin.rpc("refund_ai_video_credits", {
      p_user_id: userId,
      p_amount_euros: totalCost,
      p_generation_id: generationId,
    });
    if (refundError) {
      console.error("[generate-runway-video] Refund failed:", refundError);
    } else {
      console.log(`[generate-runway-video] ✅ Refunded €${totalCost.toFixed(2)}`);
    }
  }
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
    const { prompt, model, duration, aspectRatio, referenceVideoUrl } = body;

    if (model !== "runway-gen4-aleph") {
      return new Response(JSON.stringify({ error: `Unknown model: ${model}` }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!referenceVideoUrl) {
      return new Response(JSON.stringify({ error: "Runway Aleph requires a reference video (V2V only)." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    // Capability gate — before wallet, before provider.
    const gate = await gateVideoCapability(
      supabaseAdmin,
      {
        modelId: model,
        mode: inferMode({ modelId: model, videoUrl: referenceVideoUrl }),
        resolution: '720p',
        durationSeconds: Number(duration),
        aspectRatio,
      },
      corsHeaders,
    );
    if (gate.response) return gate.response;
    const ratio = RATIO_MAP[aspectRatio];
    if (!ratio) {
      return new Response(JSON.stringify({ error: `Unsupported aspect ratio: ${aspectRatio}` }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Wallet & cost
    const { data: wallet, error: walletError } = await supabaseAdmin
      .from("ai_video_wallets")
      .select("balance_euros, currency")
      .eq("user_id", user.id)
      .single();

    if (walletError || !wallet) {
      return new Response(
        JSON.stringify({ error: "No AI Video wallet found. Please purchase credits first.", code: "NO_WALLET", needsPurchase: true }),
        { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Canonical catalog price only — no local margin table (policy: net margin floor, see videoPricingCatalog.ts).
    const costPerSecond = await resolveAccountCostPerSecond(
      supabaseAdmin, user.id, 'runway-gen4-aleph', (wallet.currency === 'USD' ? 'USD' : 'EUR'),
    );
    if (costPerSecond === null) return pricingUnavailableResponse(corsHeaders);
    const totalCost = duration * costPerSecond;
    const sym = wallet.currency === "USD" ? "$" : "€";

    if (wallet.balance_euros < totalCost) {
      await trackBusinessEvent('credit_insufficient', user.id, {
        provider: 'runway', model, required: totalCost,
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

    // Create generation record
    const { data: generation, error: genError } = await supabaseAdmin
      .from("ai_video_generations")
      .insert({
        ...(gate.parityColumns ?? {}),
        user_id: user.id,
        prompt,
        model,
        duration_seconds: duration,
        aspect_ratio: aspectRatio,
        resolution: "720p",
        cost_per_second: costPerSecond,
        total_cost_euros: totalCost,
        status: "pending",
        source_image_url: referenceVideoUrl,
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

    // Submit to Runway
    const RUNWAY_API_KEY = Deno.env.get("RUNWAY_API_KEY");
    if (!RUNWAY_API_KEY) throw new Error("RUNWAY_API_KEY not configured");

    const runwayBody: Record<string, unknown> = {
      model: "gen4_aleph",
      promptText: prompt,
      videoUri: referenceVideoUrl,
      ratio,
    };

    // Aleph accepts a single style/subject reference image.
    if (body.startImageUrl) {
      runwayBody.references = [{ type: 'image', uri: body.startImageUrl }];
    }

    console.log(`[generate-runway-video] Submitting Runway task:`, {
      ...runwayBody,
      promptText: prompt.substring(0, 100) + (prompt.length > 100 ? "..." : ""),
    });

    let taskId: string;
    try {
      const resp = await fetch(`${RUNWAY_API_BASE}/video_to_video`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${RUNWAY_API_KEY}`,
          "X-Runway-Version": RUNWAY_API_VERSION,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(runwayBody),
      });

      if (!resp.ok) {
        const txt = await resp.text();
        throw new Error(`Runway API ${resp.status}: ${txt}`);
      }
      const data = await resp.json();
      taskId = data.id;
      if (!taskId) throw new Error("Runway response missing task id");

      await supabaseAdmin
        .from("ai_video_generations")
        .update({
          status: "processing",
          started_at: new Date().toISOString(),
          artlist_job_id: taskId,
        })
        .eq("id", generation.id);

      await trackAIGeneration('started', user.id, {
        provider: 'runway', model, duration_s: duration,
        cost_eur: totalCost, aspect_ratio: aspectRatio, resolution: '720p',
        generation_id: generation.id,
      }).catch(() => {});
    } catch (runwayErr: any) {
      console.error("[generate-runway-video] ❌ Submit failed:", runwayErr);
      await supabaseAdmin
        .from("ai_video_generations")
        .update({
          status: "failed",
          failed_at: new Date().toISOString(),
          error_message: runwayErr?.message ?? "Runway submit failed",
        })
        .eq("id", generation.id);
      await supabaseAdmin.rpc("refund_ai_video_credits", {
        p_user_id: user.id,
        p_amount_euros: totalCost,
        p_generation_id: generation.id,
      });
      return new Response(
        JSON.stringify({ error: "Runway submission failed. Credits refunded.", code: "RUNWAY_ERROR", details: runwayErr?.message }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Background polling
    // @ts-ignore EdgeRuntime is provided by Supabase
    EdgeRuntime.waitUntil(
      pollAndPersist({
        taskId,
        generationId: generation.id,
        userId: user.id,
        totalCost,
        prompt,
        aspectRatio,
        duration,
        runwayKey: RUNWAY_API_KEY,
      }),
    );

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
    console.error("[generate-runway-video] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 },
    );
  }
});

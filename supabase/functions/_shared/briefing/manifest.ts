// supabase/functions/_shared/briefing/manifest.ts
//
// Free-form briefing → BriefingManifest.
//
// Differences to the old `parse-briefing` function:
//  - tool schema and validation both come from ONE shared schema file
//  - the manifest is validated ON THE SERVER; invalid output triggers a single
//    repair round that feeds the validation errors back into the model
//  - errors are localised (DE/EN/ES) instead of raw English strings
//  - the shared model chain is used (no per-function model drift)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { BriefingManifest, BRIEFING_TOOL_PARAMETERS } from "./manifestSchema.ts";
import { callBriefingGateway, callBriefingRepair, readToolCallArguments } from "./models.ts";
import { briefingErrorResponse, statusFromError } from "./errors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const TOOL_DEFINITION = {
  type: "function",
  function: {
    name: "emitBriefingManifest",
    description:
      "Extract a structured production manifest from the briefing. Map every concrete value the briefing states (durations, voiceover lines, voice IDs, shot framing, captions, negative prompt, cast/location mentions). Leave fields undefined when the briefing does not specify them — do not invent.",
    parameters: BRIEFING_TOOL_PARAMETERS,
  },
};

const SYSTEM_PROMPT = `You convert long-form video production briefings into a strict BriefingManifest via tool-calling.

Rules:
- Read the ENTIRE briefing. Tables, bullet lists and prose are all valid sources.
- Extract every concrete value the briefing names: scene durations, voiceover lines with timecodes, ElevenLabs voice ID/model/stability/similarity/style/speed/speaker_boost, caption style (font, size, color, stroke, highlight color, safe-zone, max-words-per-cue), highlighted keywords, negative prompt, cast mentions (e.g. "@founder-avatar"), location mentions (e.g. "@home-office"), shot framing/angle/movement/lighting per scene, style presets, and anchor prompt hints (keep these in English).
- DO NOT invent fields the briefing does not state. Leave optional fields undefined.
- Map shot framing/angle/movement/lighting to the provided enum values (closest match). If no match exists, omit the field and add an entry to "unresolved".
- Scene "index" starts at 1 and increases by 1. "durationSec" must be between 1 and 60.
- For VO timecodes, prefer "timecodeStartSec"/"timecodeEndSec" in seconds.
- For mentions like "@founder-avatar", keep the leading "@" verbatim — the resolver maps them to DB IDs.
- If the briefing references a voice by name only (e.g. "George"), set voice.voiceName and leave voiceId for the resolver.
- Anything ambiguous → add to "unresolved" with field path and a short reason.`;

function buildBody(model: string, briefing: string, repairNote?: string) {
  const messages: Array<{ role: string; content: string }> = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: `BRIEFING:\n\n${briefing}` },
  ];
  if (repairNote) {
    messages.push({
      role: "user",
      content:
        `Your previous manifest failed schema validation with these errors:\n${repairNote}\n\n` +
        `Emit the tool call again, fixing exactly these problems. Keep all other extracted values.`,
    });
  }
  return {
    model,
    messages,
    tools: [TOOL_DEFINITION],
    tool_choice: { type: "function", function: { name: "emitBriefingManifest" } },
    max_tokens: 8000,
  };
}

function formatIssues(issues: Array<{ path: (string | number)[]; message: string }>): string {
  return issues
    .slice(0, 25)
    .map((i) => `- ${i.path.join(".") || "(root)"}: ${i.message}`)
    .join("\n");
}

export async function analyzeFreeformBriefing(
  briefing: string,
): Promise<{ manifest: unknown; model: string; repaired: boolean }> {
  const { response, model } = await callBriefingGateway(
    (m) => buildBody(m, briefing),
    "briefing-manifest",
  );
  let raw = readToolCallArguments(await response.json());

  let parsed = BriefingManifest.safeParse(raw);
  if (parsed.success) return { manifest: parsed.data, model, repaired: false };

  // ── One repair round: feed the validation errors back into the model ──
  const note = formatIssues(parsed.error.issues as any);
  console.warn("[briefing-manifest] schema invalid, running repair round:", note);

  const {response: repairRes, model: repairModel} = await callBriefingRepair(
    (m) => buildBody(m, briefing, note),
  );
  if (repairRes.ok) {
    raw = readToolCallArguments(await repairRes.json());
    parsed = BriefingManifest.safeParse(raw);
    if (parsed.success) {
      return { manifest: parsed.data, model: repairModel, repaired: true };
    }
  }

  const err: any = new Error("manifest failed schema validation");
  err.status = 422;
  err.issues = formatIssues((parsed as any).error.issues);
  throw err;
}

export async function handleManifest(
  req: Request,
  corsHeaders: Record<string, string>,
  body: Record<string, unknown>,
): Promise<Response> {
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userRes } = await supabase.auth.getUser();
    if (!userRes?.user) return briefingErrorResponse(401, corsHeaders);

    const briefing = String(body?.briefing ?? "").trim();
    if (!briefing) return briefingErrorResponse(400, corsHeaders, "briefing text required");
    if (briefing.length > 120_000) return briefingErrorResponse(413, corsHeaders);

    const { manifest, model, repaired } = await analyzeFreeformBriefing(briefing);
    return new Response(JSON.stringify({ manifest, model, repaired }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    const status = statusFromError(e);
    console.error("[briefing-manifest] error:", e?.message);
    return briefingErrorResponse(status, corsHeaders, e?.issues);
  }
}

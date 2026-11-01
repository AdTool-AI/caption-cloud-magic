/** Shared, host-owned briefing transport. No platform credential fallback. */
export class GatewayError extends Error {
  readonly body = "";
  readonly retryable = false;
  constructor(public status: number, message: string) { super(message); }
}
export interface GatewayAttemptResult { response: Response; model: string; attempt: number; }

export function getBriefingProvider(): {endpoint: string; key: string; model: string; repairModel: string} {
  const base = Deno.env.get("BRIEFING_API_BASE_URL")?.replace(/\/+$/, "");
  const key = Deno.env.get("BRIEFING_API_KEY");
  const model = Deno.env.get("BRIEFING_MODEL");
  const repairModel = Deno.env.get("BRIEFING_REPAIR_MODEL") || model;
  if (!base || !key?.trim() || !model?.trim() || !repairModel?.trim() || /[\r\n]/.test(key + model + repairModel)) {
    throw new GatewayError(503, "Briefing provider is not configured.");
  }
  try {
    const endpoint = new URL(base);
    const host = endpoint.hostname.toLowerCase();
    if (endpoint.protocol !== "https:" || endpoint.username || endpoint.password || endpoint.search || endpoint.hash ||
        ["lovable.dev", "lovable.app", "lovableproject.com", "supabase.co"].some(d => host === d || host.endsWith("." + d))) throw new Error();
  } catch { throw new GatewayError(503, "Briefing provider endpoint is invalid."); }
  return {endpoint: `${base}/chat/completions`, key, model, repairModel};
}

async function requestBriefing(buildBody: (model: string) => unknown, repair: boolean): Promise<GatewayAttemptResult> {
  const settings = getBriefingProvider();
  const model = repair ? settings.repairModel : settings.model;
  const body = buildBody(model);
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new GatewayError(400, "Invalid briefing request.");
  let response: Response;
  try {
    response = await fetch(settings.endpoint, {
      method: "POST",
      headers: {Authorization: `Bearer ${settings.key}`, "Content-Type": "application/json"},
      body: JSON.stringify({...body, model}),
      redirect: "error",
    });
  } catch {
    // A timeout/network error can happen after provider acceptance. Do not
    // repeat a potentially billed request or reveal provider error details.
    throw new GatewayError(503, "Briefing provider unavailable.");
  }
  if (!response.ok) {
    const status = response.status === 402 || response.status === 429 ? response.status : 503;
    void response.body?.cancel().catch(() => {});
    throw new GatewayError(status, "Briefing provider request failed.");
  }
  return {response, model, attempt: 1};
}

/** One attempt per extraction; schema repair is a separate explicit call. */
export function callBriefingGateway(buildBody: (model: string) => unknown, _label = "briefing"): Promise<GatewayAttemptResult> {
  return requestBriefing(buildBody, false);
}
export function callBriefingRepair(buildBody: (model: string) => unknown): Promise<GatewayAttemptResult> {
  return requestBriefing(buildBody, true);
}

/** Decode tool arguments; schema validation remains the caller's responsibility. */
export function readToolCallArguments(json: unknown): Record<string, unknown> {
  const args = (json as any)?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (typeof args !== "string") throw new GatewayError(502, "No structured briefing output returned.");
  let value: unknown;
  try { value = JSON.parse(args); } catch { throw new GatewayError(502, "Invalid structured briefing output."); }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new GatewayError(502, "Invalid structured briefing output.");
  return value as Record<string, unknown>;
}

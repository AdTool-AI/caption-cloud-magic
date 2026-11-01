/**
 * Shared webhook authentication helpers.
 *
 * Webhook callbacks from Replicate / Remotion Lambda / our own renderers must
 * carry a shared secret so that arbitrary internet callers cannot forge
 * completion events and mutate DB state via the service role.
 *
 * Usage in webhook receivers:
 *   import { verifyWebhookRequest } from "../_shared/webhook-auth.ts";
 *   const unauth = verifyWebhookRequest(req);
 *   if (unauth) return unauth; // 401 response
 *
 * Usage in callers that construct webhook URLs:
 *   import { appendWebhookToken } from "../_shared/webhook-auth.ts";
 *   const webhookUrl = appendWebhookToken(`${SUPABASE_URL}/functions/v1/remotion-webhook`);
 */

const SECRET_ENV = "WEBHOOK_SHARED_SECRET";

export function getWebhookSecret(env: (name:string)=>string|undefined = name=>Deno.env.get(name)): string | null {
  const s = env(SECRET_ENV);
  return s && s.length >= 16 ? s : null;
}

export function appendWebhookToken(url: string, env: (name:string)=>string|undefined = name=>Deno.env.get(name)): string {
  const secret = getWebhookSecret(env);
  if (!secret) throw new Error('WEBHOOK_SHARED_SECRET_REQUIRED');
  // Database/API traffic uses SUPABASE_URL internally. Providers need the public HTTPS origin.
  const configured = env('PUBLIC_API_URL');
  let origin: URL;
  try { origin = new URL(configured ?? ''); } catch { throw new Error('WEBHOOK_PUBLIC_ORIGIN_REQUIRED'); }
  if (origin.origin !== 'https://api-prod.useadtool.ai' || origin.username || origin.password ||
      origin.pathname !== '/' || origin.search || origin.hash) throw new Error('WEBHOOK_PUBLIC_ORIGIN_REQUIRED');
  let supplied: URL;
  try { supplied = new URL(url); } catch { throw new Error('INVALID_WEBHOOK_PATH'); }
  if (supplied.username || supplied.password || supplied.hash || url.length>8192 ||
      !/^\/functions\/v1\/[a-z][a-z0-9-]{0,99}$/.test(supplied.pathname)) throw new Error('INVALID_WEBHOOK_PATH');
  const result = new URL(supplied.pathname + supplied.search, origin);
  result.searchParams.set('token', secret);
  return result.href;
}

/**
 * Verify that an incoming webhook request carries the shared secret.
 * Accepts either a `?token=` query param or `X-Webhook-Token` header.
 * Returns null on success, or a 401 Response on failure.
 *
 * If WEBHOOK_SHARED_SECRET is not configured, requests are rejected
 * (fail-closed). This prevents accidental open endpoints.
 */
export function verifyWebhookRequest(req: Request): Response | null {
  const secret = getWebhookSecret();
  if (!secret) {
    console.error(
      `[webhook-auth] ${SECRET_ENV} is not configured (must be >=16 chars). Rejecting webhook.`,
    );
    return new Response(
      JSON.stringify({ error: "Webhook authentication not configured" }),
      {
        status: 503,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  const url = new URL(req.url);
  const tokenFromQuery = url.searchParams.get("token");
  const tokenFromHeader = req.headers.get("x-webhook-token");
  const provided = tokenFromQuery || tokenFromHeader;

  if (!provided || !timingSafeEqual(provided, secret)) {
    console.warn("[webhook-auth] Rejected webhook with missing/invalid token");
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  return null;
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

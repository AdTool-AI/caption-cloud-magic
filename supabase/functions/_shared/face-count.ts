/**
 * Shared face-count helper. Asks an independently configured vision model how many distinct human
 * faces are visible in a given image or first-frame URL. Used by:
 *  - `compose-video-clips` → pre-flight check on composed scene anchor
 *    BEFORE handing it to i2v (catches "Nano Banana rendered only one
 *    face" early so we can re-compose without spending Hailuo credits).
 *  - `compose-twoshot-lipsync` → post-clip audit (separate, richer
 *    helper there because it also returns per-face coordinates).
 *
 * Returns null when the call fails — caller decides whether that means
 * "skip the check" or "fail loud".
 */

/** Server-owned provider settings only; never forward a caller/legacy credential. */
function provider(): {endpoint: string; key: string; model: string} | null {
  const base = Deno.env.get("QA_API_BASE_URL")?.replace(/\/+$/, "");
  const key = Deno.env.get("QA_API_KEY");
  const model = Deno.env.get("QA_MODEL");
  if (!base || !key?.trim() || !model?.trim() || /[\r\n]/.test(key + model)) return null;
  try {
    const u = new URL(base);
    const host = u.hostname.toLowerCase();
    if (u.protocol !== "https:" || u.username || u.password || u.search || u.hash ||
        ["lovable.dev", "lovable.app", "lovableproject.com", "supabase.co"].some(d => host === d || host.endsWith("." + d))) return null;
    return {endpoint: `${base}/chat/completions`, key, model};
  } catch { return null; }
}
function countFromResponse(json: unknown, field: "faces" | "humans"): number | null {
  const text = (json as any)?.choices?.[0]?.message?.content;
  if (typeof text !== "string") return null;
  const match = text.match(/\{[\s\S]*?\}/);
  if (!match) return null;
  const count = JSON.parse(match[0])?.[field];
  return typeof count === "number" && Number.isSafeInteger(count) && count >= 0 ? count : null;
}
function deadline(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(60_000, Math.max(1_000, value)) : 20_000;
}

export async function countFacesInImage(
  url: string,
  _unusedLegacyKey: string,
  opts: { kind?: "image" | "video"; timeoutMs?: number } = {},
): Promise<number | null> {
  const kind = opts.kind ?? "image";
  const timeoutMs = deadline(opts.timeoutMs);
  // This image-only contract cannot safely interpret MP4 URLs — calling vision
  // with a video URL returns 0 silently. Callers must extract a first frame
  // before invoking this helper for video sources.
  if (kind === "video") return null;
  const settings = provider();
  if (!settings) return null;
  try {
    const resp = await fetch(settings.endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${settings.key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: settings.model,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text:
                  "You see a single image. " +
                  "Count the DISTINCT human faces that are clearly visible and identifiable " +
                  "(eyes, nose and mouth all discernible). Do NOT count back-of-head shots, " +
                  "heavily occluded faces, blurred background faces, or faces shown only in profile " +
                  "silhouette with no features visible. " +
                  "Return STRICT JSON only, no prose: {\"faces\": <integer>}.",
              },
              { type: "image_url", image_url: { url } },
            ],
          },
        ],
      }),
      redirect: "error",
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!resp.ok) return null;
    return countFromResponse(await resp.json(), "faces");
  } catch {
    return null;
  }
}

/**
 * Counts visible HUMAN BODIES (not just frontal faces). Catches the
 * "2 frontal faces but a third person in profile/background" failure mode
 * that `countFacesInImage` misses. Returns null on transport failure.
 */
export async function countHumansInImage(
  url: string,
  _unusedLegacyKey: string,
  opts: { timeoutMs?: number } = {},
): Promise<number | null> {
  const timeoutMs = deadline(opts.timeoutMs);
  const settings = provider();
  if (!settings) return null;
  try {
    const resp = await fetch(settings.endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${settings.key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: settings.model,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text:
                  "Count the total number of DISTINCT HUMAN BEINGS visible in this image. " +
                  "Include people in profile, partially visible people, people in the background, " +
                  "people whose face is turned away — anyone whose body/silhouette is recognizable as human. " +
                  "Also include posters, photos, mirrors, screens, mannequins, or statues that depict a person — " +
                  "count each depicted person once. Do NOT count hands or arms without a body. " +
                  "Return STRICT JSON only, no prose: {\"humans\": <integer>}.",
              },
              { type: "image_url", image_url: { url } },
            ],
          },
        ],
      }),
      redirect: "error",
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!resp.ok) return null;
    return countFromResponse(await resp.json(), "humans");
  } catch {
    return null;
  }
}

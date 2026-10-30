/**
 * videoRequestPreflight — request-shape rules the video routes enforce BEFORE
 * any wallet movement and before the provider is called.
 *
 * Plain TypeScript (no Deno APIs) so the browser can mirror it through
 * `src/lib/ai-video/requestPreflight.ts` — one rule set, two callers.
 *
 * Evidence (production failures, 09/2026, account REDACTED_ACCOUNT_EMAIL):
 *  - Replicate Seedance Pro: 422 "prompt: String should have at most 4000
 *    characters" — 3 runs, provider was the first validation layer.
 *  - ModelArk Seedance 2.5: 400 InvalidParameter when a first/last frame is
 *    sent together with reference media (`content` roles are exclusive).
 */

export type PreflightLocale = "en" | "de" | "es";

/** Documented prompt length ceiling per model id. Absent = no known limit. */
export const PROMPT_CHAR_LIMITS: Record<string, number> = {
  // Replicate ByteDance Seedance routes.
  "seedance-pro": 4000,
  "seedance-standard": 4000,
  "seedance-mini": 4000,
  "seedance-1-pro": 4000,
  "seedance-1-lite": 4000,
  // ByteDance ModelArk (Seedance 2.5).
  "seedance-2-5": 4000,
};

/**
 * Routes whose provider rejects a first/last frame together with reference
 * images or reference clips — the input slot is exclusive.
 */
export const FRAME_REFERENCE_EXCLUSIVE = new Set<string>(["seedance-2-5"]);

export function promptCharLimit(modelId: string | undefined): number | null {
  if (!modelId) return null;
  return PROMPT_CHAR_LIMITS[modelId] ?? null;
}

export interface PreflightInput {
  modelId: string;
  prompt: string;
  startImageUrl?: string | null;
  endImageUrl?: string | null;
  referenceImageUrls?: readonly string[] | null;
  referenceVideoUrls?: readonly string[] | null;
}

export type PreflightViolation =
  | { kind: "prompt_too_long"; length: number; limit: number }
  | { kind: "frame_and_reference_media" };

export interface PreflightResult {
  ok: boolean;
  /** Machine code for a refused request (absent when ok). */
  code?: string;
  violation?: PreflightViolation;
}

export function preflightVideoRequest(input: PreflightInput): PreflightResult {
  const prompt = String(input.prompt ?? "");
  const limit = promptCharLimit(input.modelId);
  if (limit !== null && prompt.length > limit) {
    return {
      ok: false,
      code: "PROMPT_TOO_LONG",
      violation: { kind: "prompt_too_long", length: prompt.length, limit },
    };
  }

  if (FRAME_REFERENCE_EXCLUSIVE.has(input.modelId)) {
    const hasFrame = !!input.startImageUrl || !!input.endImageUrl;
    const hasRefMedia =
      (input.referenceImageUrls?.filter(Boolean).length ?? 0) > 0 ||
      (input.referenceVideoUrls?.filter(Boolean).length ?? 0) > 0;
    if (hasFrame && hasRefMedia) {
      return {
        ok: false,
        code: "INCOMPATIBLE_INPUT_COMBINATION",
        violation: { kind: "frame_and_reference_media" },
      };
    }
  }

  return { ok: true };
}

/** Reader-facing sentence for a refused request, in the user's language. */
export function describePreflightViolation(
  violation: PreflightViolation,
  locale: PreflightLocale,
  modelLabel: string,
): string {
  const lang: PreflightLocale = ["de", "es"].includes(locale) ? locale : "en";
  if (violation.kind === "prompt_too_long") {
    const { length, limit } = violation;
    return {
      de: `Dein Text ist ${length} Zeichen lang. ${modelLabel} verarbeitet höchstens ${limit} Zeichen — bitte kürze die Beschreibung um ${length - limit} Zeichen.`,
      en: `Your text is ${length} characters long. ${modelLabel} accepts at most ${limit} characters — please shorten the description by ${length - limit} characters.`,
      es: `Tu texto tiene ${length} caracteres. ${modelLabel} admite como máximo ${limit} caracteres: acorta la descripción en ${length - limit} caracteres.`,
    }[lang];
  }
  return {
    de: `${modelLabel} kann ein Start- oder Endbild nicht zusammen mit Referenzbildern oder Referenzclips verwenden. Bitte entscheide dich für eine der beiden Vorlagen.`,
    en: `${modelLabel} cannot use a start or end image together with reference images or reference clips. Please pick one of the two.`,
    es: `${modelLabel} no puede usar una imagen inicial o final junto con imágenes o clips de referencia. Elige solo una de las dos opciones.`,
  }[lang];
}

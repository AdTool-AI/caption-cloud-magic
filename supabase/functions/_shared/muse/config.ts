/**
 * Muse (Meta Model API) configuration — single place where the model and
 * endpoint are resolved. Portable: only reads process/Deno environment
 * variables, no Lovable- or Supabase-specific APIs.
 */

export interface MuseConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  /** Hard safety rails for the agent loop. */
  maxToolIterations: number;
  maxRegenerations: number;
  /** Max estimated video spend (in the wallet currency) per single agent turn. */
  maxTurnSpend: number;
}

function env(name: string): string | undefined {
  // deno-lint-ignore no-explicit-any
  const g = globalThis as any;
  return g.Deno?.env?.get?.(name) ?? g.process?.env?.[name];
}

export const MUSE_DEFAULT_MODEL = 'muse-spark-1.3';
export const MUSE_DEFAULT_BASE_URL = 'https://api.meta.ai/v1';

/** Approximate Meta list pricing (USD per 1M tokens) for usage accounting. */
export const MUSE_PRICE_PER_MTOK = { input: 1.25, output: 4.25 };

export function loadMuseConfig(): MuseConfig {
  const apiKey = env('META_MODEL_API_KEY');
  if (!apiKey) {
    throw new Error('META_MODEL_API_KEY is not configured on the server.');
  }
  const num = (name: string, fallback: number) => {
    const raw = env(name);
    const parsed = raw ? Number(raw) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  };
  return {
    apiKey,
    baseUrl: (env('META_MODEL_BASE_URL') ?? MUSE_DEFAULT_BASE_URL).replace(/\/+$/, ''),
    model: env('META_MUSE_MODEL') ?? MUSE_DEFAULT_MODEL,
    maxToolIterations: num('META_MUSE_MAX_TOOL_ITERATIONS', 8),
    maxRegenerations: num('META_MUSE_MAX_REGENERATIONS', 2),
    maxTurnSpend: num('META_MUSE_MAX_TURN_SPEND', 25),
  };
}

export function estimateMuseCostUsd(inputTokens: number, outputTokens: number): number {
  return (
    (inputTokens / 1_000_000) * MUSE_PRICE_PER_MTOK.input +
    (outputTokens / 1_000_000) * MUSE_PRICE_PER_MTOK.output
  );
}

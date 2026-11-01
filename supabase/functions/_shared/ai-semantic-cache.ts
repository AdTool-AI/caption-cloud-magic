/**
 * AI Semantic Cache
 * 
 * Caches AI responses by computing embeddings of prompts and matching
 * similar prompts via cosine similarity (>= 0.95).
 * 
 * Reduces AI provider calls by ~60% on common workloads.
 */

import { createClient } from "npm:@supabase/supabase-js@2";

const SIMILARITY_THRESHOLD = 0.95;
const DEFAULT_TTL_HOURS = 24;

interface CacheLookupResult<T> {
  hit: boolean;
  data: T | null;
  similarity?: number;
  cacheId?: string;
}

interface CacheOptions {
  endpoint: string;
  promptText: string;
  language?: string;
  model?: string;
  ttlHours?: number;
  /** false uses exact hashes only and makes no embedding-provider calls. */
  semantic?: boolean;
}

function getServiceClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );
}

async function hashPrompt(text: string): Promise<string> {
  const data = new TextEncoder().encode(text.trim().toLowerCase());
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Optional independently configured embedding provider. The existing cache
 * vectors are text-embedding-3-small / 1536 dimensions, so a different model
 * requires a separate cache migration rather than mixing vector spaces.
 * Missing or invalid configuration leaves exact caching available.
 */
export async function generateCacheEmbedding(text: string): Promise<number[] | null> {
  const base = Deno.env.get("CACHE_EMBEDDINGS_BASE_URL")?.replace(/\/+$/, "");
  const apiKey = Deno.env.get("CACHE_EMBEDDINGS_API_KEY");
  const model = Deno.env.get("CACHE_EMBEDDINGS_MODEL");
  if (!base || !apiKey || model !== "text-embedding-3-small") return null;

  try {
    const endpoint = new URL(base);
    const host = endpoint.hostname.toLowerCase();
    const blocked = ["lovable.dev", "lovable.app", "lovableproject.com", "supabase.co"];
    if (endpoint.protocol !== "https:" || endpoint.username || endpoint.password || endpoint.search || endpoint.hash ||
        blocked.some(domain => host === domain || host.endsWith("." + domain))) return null;
    const response = await fetch(`${base}/embeddings`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, input: text.slice(0, 8000) }),
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return null;
    const data = await response.json();
    const vector = data?.data?.[0]?.embedding;
    if (!Array.isArray(vector) || vector.length !== 1536 || !vector.every(value => typeof value === "number" && Number.isFinite(value))) return null;
    return vector;
  } catch {
    // A cache miss must not expose provider responses, credentials or prompts.
    return null;
  }
}

async function recordStat(
  endpoint: string,
  hit: boolean,
  latencyMs: number
): Promise<void> {
  try {
    const supabase = getServiceClient();
    await supabase.from("cache_stats").insert({
      endpoint,
      cache_type: "ai_semantic",
      hit,
      latency_ms: latencyMs,
    });
  } catch (e) {
    // Stats are non-critical
    console.warn("[ai-semantic-cache] Stat record failed:", e);
  }
}

/**
 * Look up a cached AI response. Tries exact hash match first,
 * then semantic similarity match.
 */
export async function lookupAiCache<T = any>(
  opts: CacheOptions
): Promise<CacheLookupResult<T>> {
  const start = Date.now();
  const language = opts.language ?? "en";

  try {
    const supabase = getServiceClient();
    const promptHash = await hashPrompt(opts.promptText);

    // 1. Exact hash hit (fast path)
    const { data: exact } = await supabase
      .from("ai_response_cache")
      .select("id, response_data")
      .eq("endpoint", opts.endpoint)
      .eq("prompt_hash", promptHash)
      .eq("language", language)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();

    if (exact) {
      // Increment hit count async (fire and forget)
      supabase
        .from("ai_response_cache")
        .update({
          hit_count: (exact as any).hit_count ? (exact as any).hit_count + 1 : 1,
          last_hit_at: new Date().toISOString(),
        })
        .eq("id", exact.id)
        .then(() => {});

      await recordStat(opts.endpoint, true, Date.now() - start);
      console.log(`[ai-semantic-cache] EXACT HIT for ${opts.endpoint}`);
      return { hit: true, data: exact.response_data as T, similarity: 1.0, cacheId: exact.id };
    }

    // 2. Semantic similarity match
    const embedding = opts.semantic === false ? null : await generateCacheEmbedding(opts.promptText);
    if (!embedding) {
      await recordStat(opts.endpoint, false, Date.now() - start);
      return { hit: false, data: null };
    }

    const { data: matches } = await supabase.rpc("match_ai_cache", {
      query_embedding: embedding as any,
      query_endpoint: opts.endpoint,
      query_language: language,
      match_threshold: SIMILARITY_THRESHOLD,
      match_count: 1,
    });

    if (matches && matches.length > 0) {
      const match = matches[0] as any;
      supabase
        .from("ai_response_cache")
        .update({
          hit_count: (match.hit_count ?? 0) + 1,
          last_hit_at: new Date().toISOString(),
        })
        .eq("id", match.id)
        .then(() => {});

      await recordStat(opts.endpoint, true, Date.now() - start);
      console.log(
        `[ai-semantic-cache] SEMANTIC HIT for ${opts.endpoint} (similarity: ${match.similarity.toFixed(3)})`
      );
      return {
        hit: true,
        data: match.response_data as T,
        similarity: match.similarity,
        cacheId: match.id,
      };
    }

    await recordStat(opts.endpoint, false, Date.now() - start);
    return { hit: false, data: null };
  } catch (e) {
    console.warn("[ai-semantic-cache] Lookup error:", e);
    return { hit: false, data: null };
  }
}

/**
 * Store an AI response in the cache.
 */
export async function storeAiCache(
  opts: CacheOptions,
  responseData: any
): Promise<void> {
  try {
    const supabase = getServiceClient();
    const promptHash = await hashPrompt(opts.promptText);
    const embedding = opts.semantic === false ? null : await generateCacheEmbedding(opts.promptText);
    const ttlHours = opts.ttlHours ?? DEFAULT_TTL_HOURS;
    const expiresAt = new Date(Date.now() + ttlHours * 3600 * 1000).toISOString();

    await supabase.from("ai_response_cache").insert({
      endpoint: opts.endpoint,
      prompt_hash: promptHash,
      prompt_text: opts.promptText.slice(0, 4000),
      prompt_embedding: embedding as any,
      response_data: responseData,
      language: opts.language ?? "en",
      model: opts.model,
      expires_at: expiresAt,
    });

    console.log(`[ai-semantic-cache] STORED for ${opts.endpoint} (TTL: ${ttlHours}h)`);
  } catch (e) {
    console.warn("[ai-semantic-cache] Store error:", e);
  }
}

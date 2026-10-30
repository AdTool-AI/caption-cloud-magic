/**
 * Embedding provider for semantic duplicate checks. Configurable by env so the
 * agent can move hosts: EMBEDDINGS_BASE_URL / EMBEDDINGS_API_KEY / EMBEDDINGS_MODEL.
 * All settings must be supplied by the host; no platform credential fallback.
 */

function env(name: string): string | undefined {
  // deno-lint-ignore no-explicit-any
  const g = globalThis as any;
  return g.Deno?.env?.get?.(name) ?? g.process?.env?.[name];
}

export class EmbeddingError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  const base = env('EMBEDDINGS_BASE_URL')?.replace(/\/+$/, '');
  const key = env('EMBEDDINGS_API_KEY');
  const model = env('EMBEDDINGS_MODEL');
  if (!base || !key || !model) throw new EmbeddingError(503, 'Embeddings provider is not configured.');
  let endpoint: URL;
  try { endpoint = new URL(base); } catch { throw new EmbeddingError(503, 'Embeddings endpoint is invalid.'); }
  if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.search || endpoint.hash)
    throw new EmbeddingError(503, 'Embeddings endpoint must be a clean HTTPS base URL.');

  const res = await fetch(`${base}/embeddings`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, input: texts.map((t) => (t || '-').slice(0, 2000)) }),
    signal: AbortSignal.timeout(45_000),
  });
  if (!res.ok) throw new EmbeddingError(res.status, `Embeddings HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  const rows = (data?.data ?? []) as { index?: number; embedding: number[] }[];
  const out: number[][] = new Array(texts.length);
  rows.forEach((r, i) => { out[r.index ?? i] = r.embedding; });
  if (out.some((v) => !Array.isArray(v))) throw new EmbeddingError(502, 'Embeddings response incomplete.');
  return out;
}

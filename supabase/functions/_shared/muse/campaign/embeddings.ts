/**
 * Embedding provider for semantic duplicate checks. Configurable by env so the
 * agent can move hosts: EMBEDDINGS_BASE_URL / EMBEDDINGS_API_KEY / EMBEDDINGS_MODEL.
 * Defaults to the AI gateway already used elsewhere in AdTool.
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
  const base = (env('EMBEDDINGS_BASE_URL') ?? 'https://ai.gateway.lovable.dev/v1').replace(/\/+$/, '');
  const key = env('EMBEDDINGS_API_KEY') ?? env('LOVABLE_API_KEY');
  const model = env('EMBEDDINGS_MODEL') ?? 'google/gemini-embedding-2';
  if (!key) throw new EmbeddingError(401, 'No embeddings API key configured.');

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

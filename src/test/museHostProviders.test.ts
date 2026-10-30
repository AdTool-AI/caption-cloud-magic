import { afterEach, describe, expect, it, vi } from 'vitest';
import { embedTexts } from '../../supabase/functions/_shared/muse/campaign/embeddings';
import { createCheckProviders } from '../../supabase/functions/_shared/muse/campaign/checkProviders';
import { firecrawlConfig, firecrawlSearch } from '../../supabase/functions/_shared/muse/campaign/research';

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe('Muse host provider boundaries', () => {
  it('missing embeddings config fails before any request, including with an old platform key', async () => {
    for (const name of ['EMBEDDINGS_BASE_URL', 'EMBEDDINGS_API_KEY', 'EMBEDDINGS_MODEL']) vi.stubEnv(name, '');
    vi.stubEnv('LOVABLE_API_KEY', 'old-platform-key');
    const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
    await expect(embedTexts(['test'])).rejects.toThrow('not configured');
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('embeddings uses only the configured endpoint, model and key', async () => {
    vi.stubEnv('EMBEDDINGS_BASE_URL', 'https://embeddings.example.test/v1/');
    vi.stubEnv('EMBEDDINGS_API_KEY', 'owned-key'); vi.stubEnv('EMBEDDINGS_MODEL', 'owned-model');
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [{ index: 0, embedding: [1, 2] }] })));
    vi.stubGlobal('fetch', fetchMock);
    expect(await embedTexts(['hello'])).toEqual([[1, 2]]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://embeddings.example.test/v1/embeddings');
    expect(JSON.parse(init.body).model).toBe('owned-model');
    expect(init.headers.Authorization).toBe('Bearer owned-key');
  });
  it('rejects credential-bearing or non-HTTPS embedding endpoints before sending', async () => {
    vi.stubEnv('EMBEDDINGS_API_KEY', 'owned'); vi.stubEnv('EMBEDDINGS_MODEL', 'owned');
    const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
    for (const base of ['http://example.test/v1', 'https://user:pass@example.test/v1', 'https://example.test/v1?token=secret']) {
      vi.stubEnv('EMBEDDINGS_BASE_URL', base);
      await expect(embedTexts(['test'])).rejects.toThrow('HTTPS');
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('does not route connector tokens through an intermediary', async () => {
    vi.stubEnv('FIRECRAWL_API_KEY', 'lovc_old');
    const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
    expect(firecrawlConfig()).toBeNull();
    const errors: string[] = [];
    expect(await firecrawlSearch('test', errors)).toEqual([]);
    expect(errors).toEqual(['A direct Firecrawl provider key is required.']);
    expect(fetchMock).not.toHaveBeenCalled();
    vi.stubEnv('FIRECRAWL_API_KEY', 'fc-owned');
    expect(firecrawlConfig()?.url('/search')).toBe('https://api.firecrawl.dev/v2/search');
    expect(firecrawlConfig()?.headers.Authorization).toBe('Bearer fc-owned');
  });
  it('QA refuses missing or invalid config before rendering/downloading', () => {
    const renderStill = vi.fn();
    for (const baseUrl of ['', 'http://example.test', 'https://user:secret@example.test/v1']) {
      expect(() => createCheckProviders({ apiKey: 'owned', baseUrl, model: 'owned', renderStill })).toThrow();
    }
    expect(renderStill).not.toHaveBeenCalled();
  });
  it('QA uses the configured model and endpoint and captures generic request id', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: 'result' } }], usage: { total_tokens: 3 } }), { headers: { 'x-request-id': 'request-1' } }));
    const provider = createCheckProviders({ apiKey: 'owned', baseUrl: 'https://qa.example.test/v1/', model: 'owned-model', renderStill: vi.fn(), fetchImpl: fetchMock,
      mediaFetch: async () => new Response(new Uint8Array([1, 2, 3])) });
    expect(await provider.analyzeSpot('https://media.example.test/video.mp4', 'review')).toBe('result');
    expect(fetchMock.mock.calls[0][0]).toBe('https://qa.example.test/v1/chat/completions');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).model).toBe('owned-model');
    expect(provider.usage()[0]).toMatchObject({ model: 'owned-model', total_tokens: 3, run_id: 'request-1' });
  });
});

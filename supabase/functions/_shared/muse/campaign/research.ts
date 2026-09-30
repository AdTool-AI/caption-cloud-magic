/**
 * Research adapter for campaigns. One interface over the existing research
 * layer: Perplexity (cited web research), optional Firecrawl (if a key is
 * configured) and the SSRF-safe website fetch. Portable: only env + fetch.
 * Public sources only — no logins, no private profiles, no CAPTCHA bypass.
 */

import { safeFetchText } from '../../safe-fetch.ts';

function env(name: string): string | undefined {
  // deno-lint-ignore no-explicit-any
  const g = globalThis as any;
  return g.Deno?.env?.get?.(name) ?? g.process?.env?.[name];
}

export interface ResearchSource {
  url: string;
  title?: string;
  excerpt?: string;
  via: 'perplexity' | 'firecrawl' | 'safe_fetch';
}

export interface ResearchImage {
  url: string;
  kind: 'logo' | 'website_image' | 'menu' | 'social';
  source_url: string;
  alt?: string;
}

export interface ResearchBundle {
  report: string;
  sources: ResearchSource[];
  images: ResearchImage[];
  website?: { url: string; title?: string; description?: string; text: string } | null;
  errors: string[];
}

function normalizeUrl(u: string): string {
  try {
    const url = new URL(u.startsWith('http') ? u : `https://${u}`);
    url.hash = '';
    return url.toString();
  } catch {
    return u;
  }
}

async function robotsAllows(pageUrl: string): Promise<boolean> {
  try {
    const u = new URL(pageUrl);
    const res = await fetch(`${u.origin}/robots.txt`, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return true;
    const txt = await res.text();
    let applies = false;
    for (const raw of txt.split('\n')) {
      const line = raw.split('#')[0].trim();
      const [k, ...rest] = line.split(':');
      const v = rest.join(':').trim();
      if (/^user-agent$/i.test(k)) applies = v === '*' || /adtool/i.test(v);
      else if (applies && /^disallow$/i.test(k) && (v === '/' )) return false;
    }
    return true;
  } catch {
    return true;
  }
}

const decode = (s: string) =>
  s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');

function extractFromHtml(html: string, base: string) {
  const meta = (name: string) =>
    html.match(new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]*content=["']([^"']+)`, 'i'))?.[1] ??
    html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]*(?:name|property)=["']${name}["']`, 'i'))?.[1];
  const title = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim();
  const description = meta('description') ?? meta('og:description');
  const abs = (u: string) => { try { return new URL(decode(u), base).toString(); } catch { return null; } };

  const images: ResearchImage[] = [];
  const seen = new Set<string>();
  const push = (u: string | null | undefined, kind: ResearchImage['kind'], alt?: string) => {
    if (!u) return;
    const a = abs(u);
    if (!a || seen.has(a) || !/^https?:/.test(a) || /\.svg(\?|$)/i.test(a) && kind !== 'logo') return;
    if (/pixel|tracking|spacer|1x1/i.test(a)) return;
    seen.add(a);
    images.push({ url: a, kind, source_url: base, alt });
  };
  push(meta('og:image'), 'website_image', 'og:image');
  for (const m of html.matchAll(/<link[^>]+rel=["'](?:apple-touch-icon|icon)["'][^>]*href=["']([^"']+)/gi)) push(m[1], 'logo', 'icon');
  for (const m of html.matchAll(/<img[^>]*>/gi)) {
    const tag = m[0];
    const src = tag.match(/\s(?:data-src|src)=["']([^"']+)/i)?.[1];
    const alt = tag.match(/\salt=["']([^"']*)/i)?.[1] ?? '';
    const blob = `${src ?? ''} ${alt} ${tag.match(/class=["']([^"']*)/i)?.[1] ?? ''}`;
    const kind: ResearchImage['kind'] = /logo/i.test(blob) ? 'logo' : /menu|speisekarte|karte/i.test(blob) ? 'menu' : 'website_image';
    push(src, kind, alt);
    if (images.length >= 25) break;
  }
  const socials = [...new Set(
    [...html.matchAll(/href=["'](https?:\/\/(?:www\.)?(?:instagram\.com|facebook\.com|tiktok\.com|youtube\.com|linkedin\.com)\/[^"'?#]+)/gi)].map((m) => m[1]),
  )].slice(0, 8);
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return { title, description: description ? decode(description) : undefined, images, socials, text: decode(text).slice(0, 6000) };
}

async function fetchWebsite(url: string, errors: string[]) {
  const target = normalizeUrl(url);
  if (!(await robotsAllows(target))) {
    errors.push(`robots.txt disallows fetching ${target}`);
    return null;
  }
  try {
    const res = await safeFetchText(target);
    return { finalUrl: res.finalUrl, ...extractFromHtml(res.text, res.finalUrl) };
  } catch (e) {
    errors.push(`Website fetch failed (${target}): ${(e as Error).message}`);
    return null;
  }
}

async function perplexityResearch(prompt: string, errors: string[]): Promise<{ text: string; citations: string[] } | null> {
  const key = env('PERPLEXITY_API_KEY');
  if (!key) { errors.push('PERPLEXITY_API_KEY not configured'); return null; }
  try {
    const res = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'sonar',
        temperature: 0.2,
        max_tokens: 2500,
        messages: [
          {
            role: 'system',
            content:
              'You are a business researcher. Use only publicly accessible sources. Never guess: if something is unknown, say "unknown". Mark every factual statement with a citation index like [1]. Do not use content behind logins.',
          },
          { role: 'user', content: prompt },
        ],
      }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) { errors.push(`Perplexity HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`); return null; }
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content ?? '';
    const citations: string[] = Array.isArray(data?.citations)
      ? data.citations
      : Array.isArray(data?.search_results) ? data.search_results.map((r: { url: string }) => r.url) : [];
    return { text, citations };
  } catch (e) {
    errors.push(`Perplexity failed: ${(e as Error).message}`);
    return null;
  }
}

async function firecrawlSearch(query: string, errors: string[]): Promise<ResearchSource[]> {
  const key = env('FIRECRAWL_API_KEY');
  if (!key) return []; // optional
  // Direct keys (fc-) call Firecrawl; connection keys (lovc_) go through the connector gateway.
  const gateway = !key.startsWith('fc-');
  const lovableKey = env('LOVABLE_API_KEY');
  if (gateway && !lovableKey) { errors.push('Firecrawl gateway key present but LOVABLE_API_KEY missing'); return []; }
  const url = gateway ? 'https://connector-gateway.lovable.dev/firecrawl/v2/search' : 'https://api.firecrawl.dev/v2/search';
  const headers: Record<string, string> = gateway
    ? { Authorization: `Bearer ${lovableKey}`, 'X-Connection-Api-Key': key, 'Content-Type': 'application/json' }
    : { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ query, limit: 8, scrapeOptions: { formats: ['markdown'], onlyMainContent: true } }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) { errors.push(`Firecrawl HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`); return []; }
    const data = await res.json();
    const list = data?.data?.web ?? data?.data ?? [];
    return (Array.isArray(list) ? list : []).map((r: { url: string; title?: string; description?: string; markdown?: string }) => ({
      url: r.url, title: r.title, excerpt: (r.markdown ?? r.description ?? '').replace(/\s+/g, ' ').slice(0, 1500), via: 'firecrawl' as const,
    }));
  } catch (e) {
    errors.push(`Firecrawl failed: ${(e as Error).message}`);
    return [];
  }
}

export async function researchBusiness(input: {
  company: string;
  website?: string | null;
  location?: string | null;
  focus?: string | null;
}): Promise<ResearchBundle> {
  const errors: string[] = [];
  const where = input.location ? ` in ${input.location}` : '';
  const site = input.website ? ` (website: ${input.website})` : '';

  const prompt = `Research the business "${input.company}"${where}${site} for an advertising campaign.
Report, each with citations:
1. Official website and public business information (address, opening hours, type of business).
2. Products / services, menu or signature offers, prices if public.
3. Branding and visual/content style (website and public social profiles).
4. Target audience and customer types.
5. Strongest selling points.
6. Themes from public customer reviews (positive and negative).
7. Public social profile URLs.
8. Seasonal offers, events or reservation options.
9. Main local competitors and how this business is positioned.
${input.focus ? `Extra focus: ${input.focus}` : ''}
Answer in English, compact bullet points.`;

  const [pplx, website, fc] = await Promise.all([
    perplexityResearch(prompt, errors),
    input.website ? fetchWebsite(input.website, errors) : Promise.resolve(null),
    firecrawlSearch(`${input.company}${where}`, errors),
  ]);
  // Second targeted search for reviews / social when Firecrawl is available.
  const fc2 = fc.length ? await firecrawlSearch(`${input.company}${where} Bewertungen reviews instagram`, errors) : [];

  const sources: ResearchSource[] = [];
  const addSource = (s: ResearchSource) => {
    const url = normalizeUrl(s.url);
    if (!sources.some((x) => x.url === url)) sources.push({ ...s, url });
  };
  if (website) addSource({ url: website.finalUrl, title: website.title, excerpt: website.description ?? website.text.slice(0, 300), via: 'safe_fetch' });
  (pplx?.citations ?? []).forEach((u) => addSource({ url: u, via: 'perplexity' }));
  [...fc, ...fc2].forEach(addSource);

  const images: ResearchImage[] = [...(website?.images ?? [])];
  for (const s of website?.socials ?? []) addSource({ url: s, title: 'Social profile (linked from website)', via: 'safe_fetch' });

  // Citation indexes [n] in the Perplexity report refer to its citations array (1-based).
  const citationMap = (pplx?.citations ?? []).map((u, i) => `[${i + 1}] ${normalizeUrl(u)}`).join('\n');
  const fcBlock = sources.filter((x) => x.via === 'firecrawl' && x.excerpt)
    .map((x) => `SOURCE ${x.url}\n${x.title ?? ''}\n${x.excerpt}`).join('\n\n');
  const report = [
    fcBlock ? `SEARCH RESULTS (cite these URLs)\n${fcBlock.slice(0, 9000)}\n` : '',
    pplx?.text ? `WEB RESEARCH\n${pplx.text}\n\nCITATIONS\n${citationMap}` : 'WEB RESEARCH unavailable.',
    website ? `\nOFFICIAL WEBSITE ${website.finalUrl}\nTitle: ${website.title ?? ''}\nDescription: ${website.description ?? ''}\nText: ${website.text.slice(0, 2500)}` : '',
  ].join('\n');

  return {
    report,
    sources,
    images,
    website: website ? { url: website.finalUrl, title: website.title, description: website.description, text: website.text } : null,
    errors,
  };
}

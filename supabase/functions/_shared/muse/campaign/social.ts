/**
 * Social-profile discovery for campaigns (Instagram, TikTok, Facebook, YouTube).
 * Public sources only: website links, web search (Firecrawl), cited web
 * research (Perplexity) and a public page read. A login wall, CAPTCHA or block
 * is recorded as `not_accessible` — never bypassed and never treated as absent.
 * Portable: only env + fetch (no Lovable-specific APIs).
 */

import { fetchWebsite, firecrawlConfig, firecrawlSearch, perplexityResearch } from './research.ts';

export const SOCIAL_PLATFORMS = ['instagram', 'tiktok', 'facebook', 'youtube'] as const;
export type SocialPlatform = typeof SOCIAL_PLATFORMS[number];
export type SocialStatus = 'pending' | 'found_not_analyzed' | 'analyzed' | 'not_found' | 'not_accessible';
export const TERMINAL_SOCIAL_STATUSES: SocialStatus[] = ['analyzed', 'not_found', 'not_accessible'];

const DOMAIN: Record<SocialPlatform, string> = {
  instagram: 'instagram.com', tiktok: 'tiktok.com', facebook: 'facebook.com', youtube: 'youtube.com',
};

const RESERVED: Record<SocialPlatform, RegExp> = {
  instagram: /^(p|reel|reels|explore|stories|accounts|about|legal|developer|tv|direct)$/i,
  tiktok: /^(tag|music|discover|video|search|login|about|legal)$/i,
  facebook: /^(sharer(\.php)?|share|dialog|login|help|policies|privacy|groups|events|watch|marketplace|photo\.php|story\.php|permalink\.php|tr|plugins|hashtag)$/i,
  youtube: /^(watch|results|feed|shorts|embed|playlist|redirect|t|about|howyoutubeworks)$/i,
};

/** Returns the canonical profile URL + handle if `raw` is a profile (not a post) on `platform`. */
export function parseProfileUrl(raw: string, platform: SocialPlatform): { url: string; handle: string } | null {
  let u: URL;
  try { u = new URL(raw.startsWith('http') ? raw : `https://${raw}`); } catch { return null; }
  const host = u.hostname.replace(/^(www\.|m\.|de-de\.|de\.|web\.)/, '');
  if (host !== DOMAIN[platform]) return null;
  const parts = u.pathname.split('/').filter(Boolean);
  if (!parts.length) return null;
  if (platform === 'tiktok') {
    if (!parts[0].startsWith('@')) return null;
    const h = parts[0].slice(1);
    return h ? { url: `https://www.tiktok.com/@${h}`, handle: h.toLowerCase() } : null;
  }
  if (platform === 'youtube') {
    if (parts[0].startsWith('@')) return { url: `https://www.youtube.com/${parts[0]}`, handle: parts[0].slice(1).toLowerCase() };
    if (['channel', 'c', 'user'].includes(parts[0]) && parts[1]) return { url: `https://www.youtube.com/${parts[0]}/${parts[1]}`, handle: parts[1].toLowerCase() };
    return null;
  }
  if (platform === 'facebook' && parts[0] === 'pages' && parts[1]) {
    return { url: `https://www.facebook.com/${parts.slice(0, 3).join('/')}`, handle: parts[1].toLowerCase() };
  }
  if (RESERVED[platform].test(parts[0])) return null;
  return { url: `https://www.${DOMAIN[platform]}/${parts[0]}`, handle: parts[0].toLowerCase() };
}

/** Distinctive tokens of a company name, used to reject unrelated profiles found via search. */
export function companyTokens(company: string): string[] {
  const plain = company.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const words = plain.split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !['cafe', 'the', 'und', 'and', 'gmbh', 'restaurant', 'bar'].includes(w));
  const joined = plain.replace(/[^a-z0-9]/g, '');
  return [...new Set([joined, ...words])].filter((t) => t.length >= 3);
}

export function handleMatchesCompany(handle: string, company: string): boolean {
  const h = handle.toLowerCase().replace(/[^a-z0-9]/g, '');
  return companyTokens(company).some((t) => h.includes(t));
}

/** True when a fetched page is a login wall / block rather than public profile content. */
export function looksBlocked(text: string | null | undefined): boolean {
  if (!text) return true;
  const t = text.replace(/\s+/g, ' ');
  if (t.length < 400) return true;
  return /(log ?in|sign ?up|anmelden|registrieren) (to|um|, um) (see|view|continue|sehen|fortzufahren)|you must log in|content isn.t available|this content isn't available|captcha|verify you are (a )?human|unusual traffic|not supported|this website is no longer supported|access denied/i.test(t);
}

/** Pure completeness rule: every major platform analyzed or explicitly unavailable. */
export function computeSocialCompleteness(rows: { platform: string; status: string }[]): { complete: boolean; missing: string[] } {
  const missing = SOCIAL_PLATFORMS.filter((p) => {
    const r = rows.find((x) => x.platform === p);
    return !r || !TERMINAL_SOCIAL_STATUSES.includes(r.status as SocialStatus);
  });
  return { complete: missing.length === 0, missing: [...missing] };
}

export interface SocialDiscovery {
  platform: SocialPlatform;
  status: SocialStatus;
  found: boolean;
  profile_url: string | null;
  discovery_source: string | null;
  discovery_via: 'website' | 'firecrawl' | 'perplexity' | null;
  discovery_evidence: { url: string; via: string }[];
  access_note: string | null;
  public_excerpt: string | null;
}

async function readPublicPage(url: string, errors: string[]): Promise<{ text: string | null; note: string }> {
  const fc = firecrawlConfig();
  if (!fc) return { text: null, note: 'No public page reader configured.' };
  try {
    const res = await fetch(fc.url('/scrape'), {
      method: 'POST', headers: fc.headers,
      body: JSON.stringify({ url, formats: ['markdown'], onlyMainContent: true }),
      signal: AbortSignal.timeout(45_000),
    });
    const body = await res.text();
    if (!res.ok) return { text: null, note: `Public read refused (HTTP ${res.status}): ${body.slice(0, 160)}` };
    const data = JSON.parse(body);
    const md: string = data?.data?.markdown ?? data?.markdown ?? '';
    return { text: md.slice(0, 6000), note: 'Public page read.' };
  } catch (e) {
    errors.push(`Public read failed (${url}): ${(e as Error).message}`);
    return { text: null, note: `Public read failed: ${(e as Error).message}` };
  }
}

export async function discoverSocialProfiles(input: {
  company: string; website?: string | null; location?: string | null;
}): Promise<{ platforms: SocialDiscovery[]; research: { text: string; citations: string[] } | null; errors: string[] }> {
  const errors: string[] = [];
  const where = input.location ? ` ${input.location}` : '';

  const pplxPrompt = `Find the OFFICIAL public social media profiles of the business "${input.company}"${where}${input.website ? ` (website: ${input.website})` : ''} on Instagram, TikTok, Facebook and YouTube.
For EACH platform report: profile URL or "not found"; how you found it; and, only from publicly visible content: recent post/reel/video examples (with URLs where possible), recurring content themes, visual style, formats that visibly perform best (views, likes, comments where public), and obvious content gaps.
If a profile exists but its content is not publicly viewable, say "not publicly accessible". Never guess; cite every statement.`;

  const [site, pplx, ...searches] = await Promise.all([
    input.website ? fetchWebsite(input.website, errors) : Promise.resolve(null),
    perplexityResearch(pplxPrompt, errors),
    ...SOCIAL_PLATFORMS.map((p) => firecrawlSearch(`${input.company}${where} site:${DOMAIN[p]}`, errors, 5)),
  ]);
  const searchOk = searches.some((s) => s.length > 0) || !!pplx;

  const platforms: SocialDiscovery[] = [];
  for (const [i, platform] of SOCIAL_PLATFORMS.entries()) {
    const evidence: { url: string; via: string }[] = [];
    let pick: { url: string; source: string; via: SocialDiscovery['discovery_via'] } | null = null;

    for (const link of site?.socials ?? []) {
      const p = parseProfileUrl(link, platform);
      if (p) { evidence.push({ url: link, via: 'website' }); pick ??= { url: p.url, source: site!.finalUrl, via: 'website' }; }
    }
    for (const r of searches[i] ?? []) {
      const p = parseProfileUrl(r.url, platform);
      if (p && handleMatchesCompany(p.handle, input.company)) {
        evidence.push({ url: r.url, via: 'firecrawl' });
        pick ??= { url: p.url, source: r.url, via: 'firecrawl' };
      }
    }
    for (const c of pplx?.citations ?? []) {
      const p = parseProfileUrl(c, platform);
      if (p && handleMatchesCompany(p.handle, input.company)) {
        evidence.push({ url: c, via: 'perplexity' });
        pick ??= { url: p.url, source: c, via: 'perplexity' };
      }
    }

    if (!pick) {
      platforms.push({
        platform, status: searchOk ? 'not_found' : 'pending', found: false, profile_url: null,
        discovery_source: null, discovery_via: null, discovery_evidence: evidence,
        access_note: searchOk ? 'No official profile found via website links, web search or cited research.' : 'Discovery services unavailable — platform not checked.',
        public_excerpt: null,
      });
      continue;
    }
    const read = await readPublicPage(pick.url, errors);
    const blocked = looksBlocked(read.text);
    platforms.push({
      platform, status: blocked ? 'not_accessible' : 'found_not_analyzed', found: true, profile_url: pick.url,
      discovery_source: pick.source, discovery_via: pick.via, discovery_evidence: evidence,
      access_note: blocked ? `Profile found but its content is not publicly accessible (login wall/block). ${read.note}` : read.note,
      public_excerpt: blocked ? null : read.text,
    });
  }
  return { platforms, research: pplx, errors };
}

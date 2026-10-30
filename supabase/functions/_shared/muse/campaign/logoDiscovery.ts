/**
 * Official-logo discovery — pure helpers (no I/O).
 * A discovered logo is only ever a reference_only candidate; it becomes
 * reuse_ok solely through the user's explicit confirmation (confirm_campaign_logo RPC).
 * Never generates a substitute logo, never infers rights from public visibility.
 */

export type LogoDiscoverySource = 'official_website' | 'official_social' | 'official_brand_page';

export interface LogoCandidate {
  url: string;
  page_url: string;
  discovery_source: LogoDiscoverySource;
  signal: string;
  confidence: number; // 0..1 that this is the business's official logo
}

const decode = (s: string) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
const abs = (u: string, base: string) => { try { return new URL(decode(u.trim()), base).toString(); } catch { return null; } };
const attr = (tag: string, name: string) => tag.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, 'i'))?.[1];

/** Extracts ranked logo candidates from one official page. */
export function extractLogoCandidates(html: string, pageUrl: string, source: LogoDiscoverySource, brandName = ''): LogoCandidate[] {
  const out = new Map<string, LogoCandidate>();
  const brand = brandName.toLowerCase().split(/\s+/)[0] ?? '';
  const add = (raw: string | undefined, signal: string, confidence: number) => {
    if (!raw || raw.startsWith('data:')) return;
    const url = abs(raw, pageUrl);
    if (!url || !url.startsWith('https://')) return;
    const prev = out.get(url);
    if (!prev || prev.confidence < confidence) out.set(url, { url, page_url: pageUrl, discovery_source: source, signal, confidence });
  };
  // schema.org Organization.logo (strongest structured signal)
  for (const m of html.matchAll(/"logo"\s*:\s*(?:\{[^}]*?"url"\s*:\s*)?"([^"]+)"/gi)) add(m[1], 'schema.org Organization.logo', 0.9);
  // <img> tags that declare themselves as the logo
  for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
    const tag = m[0];
    const src = attr(tag, 'src') ?? attr(tag, 'data-src');
    const hay = `${attr(tag, 'alt') ?? ''} ${attr(tag, 'class') ?? ''} ${attr(tag, 'id') ?? ''} ${src ?? ''}`.toLowerCase();
    if (!/logo/.test(hay)) continue;
    const inHeader = /<header\b/i.test(html.slice(Math.max(0, (m.index ?? 0) - 3000), m.index ?? 0));
    let c = 0.6 + (inHeader ? 0.1 : 0) + (brand && hay.includes(brand) ? 0.1 : 0);
    if (/partner|sponsor|payment|award|footer-logos|client/.test(hay)) c -= 0.4;
    add(src, `<img> marked as logo${inHeader ? ' in header' : ''}`, Math.max(0.05, Math.min(0.85, c)));
  }
  // Profile/brand pages: og:image is usually the profile picture (often the logo, but uncertain)
  const og = html.match(/<meta[^>]+property=["']og:image["'][^>]*content=["']([^"']+)/i)?.[1]
    ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]*property=["']og:image["']/i)?.[1];
  if (og) add(og, 'og:image', source === 'official_website' ? 0.25 : 0.45);
  // Icons: official, but tiny — weak for an end card
  for (const m of html.matchAll(/<link\b[^>]*rel=["'][^"']*(?:apple-touch-icon|icon)[^"']*["'][^>]*>/gi)) add(attr(m[0], 'href'), 'site icon', 0.3);
  return [...out.values()].sort((a, b) => b.confidence - a.confidence);
}

export interface ImageInfo { file_type: string; width: number | null; height: number | null }

/** Reads type + pixel size from file bytes (PNG, JPEG, GIF, WebP, SVG). */
export function sniffImage(b: Uint8Array): ImageInfo | null {
  const u32 = (o: number) => (b[o] << 24 | b[o + 1] << 16 | b[o + 2] << 8 | b[o + 3]) >>> 0;
  const u16 = (o: number) => b[o] << 8 | b[o + 1];
  const le16 = (o: number) => b[o] | b[o + 1] << 8;
  if (b.length > 24 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return { file_type: 'image/png', width: u32(16), height: u32(20) };
  if (b.length > 10 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return { file_type: 'image/gif', width: le16(6), height: le16(8) };
  if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8) {
    let o = 2;
    while (o + 9 < b.length) {
      if (b[o] !== 0xff) { o++; continue; }
      const marker = b[o + 1];
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { file_type: 'image/jpeg', width: u16(o + 7), height: u16(o + 5) };
      o += 2 + u16(o + 2);
    }
    return { file_type: 'image/jpeg', width: null, height: null };
  }
  if (b.length > 30 && String.fromCharCode(...b.slice(0, 4)) === 'RIFF' && String.fromCharCode(...b.slice(8, 12)) === 'WEBP') {
    const kind = String.fromCharCode(...b.slice(12, 16));
    if (kind === 'VP8X') return { file_type: 'image/webp', width: 1 + (b[24] | b[25] << 8 | b[26] << 16), height: 1 + (b[27] | b[28] << 8 | b[29] << 16) };
    if (kind === 'VP8L') { const v = b[21] | b[22] << 8 | b[23] << 16 | b[24] << 24; return { file_type: 'image/webp', width: (v & 0x3fff) + 1, height: ((v >> 14) & 0x3fff) + 1 }; }
    if (kind === 'VP8 ') return { file_type: 'image/webp', width: le16(26) & 0x3fff, height: le16(28) & 0x3fff };
    return { file_type: 'image/webp', width: null, height: null };
  }
  const head = new TextDecoder().decode(b.slice(0, 2048));
  if (/<svg\b/i.test(head)) {
    const tag = head.match(/<svg\b[^>]*>/i)?.[0] ?? '';
    const num = (v?: string) => (v && /^[\d.]+(px)?$/.test(v) ? Math.round(parseFloat(v)) : null);
    let w = num(attr(tag, 'width')), h = num(attr(tag, 'height'));
    const vb = attr(tag, 'viewBox')?.split(/[\s,]+/).map(Number);
    if ((!w || !h) && vb?.length === 4) { w = Math.round(vb[2]); h = Math.round(vb[3]); }
    return { file_type: 'image/svg+xml', width: w, height: h };
  }
  return null;
}

/** Final confidence after seeing the file: too small or non-image lowers it. */
export function adjustConfidence(c: LogoCandidate, info: ImageInfo | null): number {
  if (!info) return 0;
  let v = c.confidence;
  if (info.file_type === 'image/svg+xml') v += 0.05;
  const min = Math.min(info.width ?? 0, info.height ?? 0);
  if (info.width && info.height && Math.max(info.width, info.height) < 120) v -= 0.2;
  if (info.width && info.height && min > 0 && info.width / info.height > 12) v -= 0.2;
  return Math.round(Math.max(0, Math.min(0.95, v)) * 100) / 100;
}

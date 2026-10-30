import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { adjustConfidence, extractLogoCandidates, sniffImage } from './logoDiscovery.ts';

Deno.test('schema.org logo ranks above header img, partner logos penalised', () => {
  const html = `<script type="application/ld+json">{"@type":"Organization","logo":"/brand/logo.svg"}</script>
    <header><img src="/img/cafe-buur-logo.png" alt="Café Buur Logo"></header>
    <footer><img class="partner-logo" src="/img/sponsor.png"></footer>`;
  const c = extractLogoCandidates(html, 'https://cafebuur.de/', 'official_website', 'Café Buur');
  assertEquals(c[0].url, 'https://cafebuur.de/brand/logo.svg');
  assertEquals(c[1].url, 'https://cafebuur.de/img/cafe-buur-logo.png');
  assert(c.find((x) => x.url.endsWith('sponsor.png'))!.confidence < 0.4);
});

Deno.test('only https candidates, data URIs ignored', () => {
  const c = extractLogoCandidates('<img src="data:image/png;base64,xx" alt="logo"><img src="http://x.de/logo.png" alt="logo">', 'http://x.de/', 'official_website');
  assertEquals(c.length, 0);
});

Deno.test('sniffs PNG and SVG dimensions', () => {
  const png = new Uint8Array(32); png.set([0x89, 0x50, 0x4e, 0x47], 0); png.set([0, 0, 3, 32], 16); png.set([0, 0, 1, 144], 20);
  assertEquals(sniffImage(png), { file_type: 'image/png', width: 800, height: 400 });
  const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 120"></svg>');
  assertEquals(sniffImage(svg), { file_type: 'image/svg+xml', width: 300, height: 120 });
  assertEquals(sniffImage(new TextEncoder().encode('<html>')), null);
});

Deno.test('non-image or tiny files lower confidence', () => {
  const c = { url: 'https://x/l.png', page_url: 'https://x', discovery_source: 'official_website' as const, signal: 's', confidence: 0.8 };
  assertEquals(adjustConfidence(c, null), 0);
  assert(adjustConfidence(c, { file_type: 'image/png', width: 32, height: 32 }) < 0.8);
});

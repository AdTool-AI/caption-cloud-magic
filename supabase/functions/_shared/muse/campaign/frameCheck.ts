/**
 * Frame visibility check for the exported spot (pure).
 * Plans one probe per overlay / endcard / logo at the middle of its time window,
 * then judges provider observations (OCR text, logo similarity) against the plan.
 * Providers are injected by the runtime; nothing here calls the network.
 */
import { frameSize, logoBox, totalCut, type SpotEdit } from './spot.ts';

export interface FrameProbe { element_id: string; kind: 'text' | 'endcard' | 'logo'; t: number; expected: string; box?: { x: number; y: number; w: number; h: number } }
export interface FrameObservation { element_id: string; ocr_text?: string | null; logo_similarity?: number | null; error?: string | null }
export type Visibility = 'visible' | 'not_visible' | 'not_checkable';

const r3 = (n: number) => Math.round(n * 1000) / 1000;

export function planFrameProbes(e: SpotEdit): FrameProbe[] {
  const total = totalCut(e);
  const out: FrameProbe[] = e.overlays.map((o) => ({ element_id: o.id, kind: 'text' as const, t: r3((o.start + o.end) / 2), expected: o.text }));
  if (e.endcard) {
    const from = total - e.endcard.duration;
    out.push({ element_id: 'endcard', kind: 'endcard', t: r3(from + e.endcard.duration / 2), expected: [e.endcard.headline, e.endcard.cta].filter(Boolean).join(' ') });
  }
  if (e.branding_mode !== 'text_only' && e.logo && Number(e.logo.width) > 0 && Number(e.logo.height) > 0) {
    const from = e.endcard ? total - e.endcard.duration : 0;
    const [fw, fh] = frameSize(e.aspect);
    const b = logoBox(fw, fh, Number(e.logo.width), Number(e.logo.height), e.logo.width_share);
    out.push({ element_id: 'logo', kind: 'logo', t: r3((from + total) / 2), expected: e.logo.url, box: { x: b.x, y: b.y, w: b.w, h: b.h } });
  }
  return out;
}

export const normText = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

/** Share of expected words found in the OCR text (order-free). */
export function textCoverage(expected: string, ocr: string): number {
  const want = normText(expected).split(' ').filter(Boolean);
  if (!want.length) return 1;
  const have = new Set(normText(ocr).split(' '));
  return want.filter((w) => have.has(w)).length / want.length;
}

export const TEXT_MIN_COVERAGE = 0.8;
export const LOGO_MIN_SIMILARITY = 0.7;

export function judgeFrames(revision: number, probes: FrameProbe[], obs: FrameObservation[]) {
  const byId = new Map(obs.map((o) => [o.element_id, o]));
  const items = probes.map((p) => {
    const o = byId.get(p.element_id);
    let status: Visibility = 'not_checkable';
    let detail = 'no observation';
    if (o?.error) detail = o.error;
    else if (p.kind === 'logo' && typeof o?.logo_similarity === 'number') {
      status = o.logo_similarity >= LOGO_MIN_SIMILARITY ? 'visible' : 'not_visible';
      detail = `similarity ${o.logo_similarity.toFixed(2)} (min ${LOGO_MIN_SIMILARITY})`;
    } else if (p.kind !== 'logo' && typeof o?.ocr_text === 'string') {
      const c = textCoverage(p.expected, o.ocr_text);
      status = c >= TEXT_MIN_COVERAGE ? 'visible' : 'not_visible';
      detail = `${Math.round(c * 100)} % of expected words read`;
    }
    return { element_id: p.element_id, kind: p.kind, t: p.t, expected: p.kind === 'logo' ? 'original logo' : p.expected, status, detail, observed: typeof o?.ocr_text === 'string' ? o.ocr_text : null };
  });
  return {
    revision, method: 'automatic',
    passed: items.length > 0 && items.every((i) => i.status === 'visible'),
    items, checked_at: new Date().toISOString(),
  };
}

/**
 * Phase B shot-level model router — pure functions, no platform imports.
 *
 * Deterministic scoring: hard capability filter → risk uplift →
 * confidence-weighted quality prior (Bayesian blend of static spec prior and
 * observed QA outcomes) → price efficiency → neighbour consistency.
 */

import { MUSE_VIDEO_MODELS, type MuseModelSpec } from '../videoModelCatalog.ts';

export const CONTENT_CATEGORIES = [
  'food', 'drink', 'people', 'interior', 'product', 'text_brand', 'motion', 'exterior',
] as const;
export type ContentCategory = (typeof CONTENT_CATEGORIES)[number];

export interface RiskFeatures {
  motion_complexity: number; // 0-3
  human_anatomy_risk: number; // 0-3
  physics_risk: number; // 0-3
  identity_consistency_requirement: number; // 0-3
  text_requirement: number; // 0-3
  reference_strength: number; // 0-3
}

export interface ShotInput {
  id: string;
  video_id: string;
  shot_index: number;
  start_s: number;
  end_s: number;
  purpose: string;
  shot_type: string;
  subject_emphasis: string; // product | people | atmosphere | brand
  description: string;
  on_screen_text?: string | null;
  asset_id?: string | null;
}

export interface ModelQaStatsRow {
  model: string;
  content_category: string;
  generation_mode: string;
  n_runs: number;
  n_client_ready: number;
  score_sum: number;
  issue_class_counts: Record<string, number>;
}

export interface RouteCandidate {
  model: string;
  displayName: string;
  mode: string;
  resolution: string;
  duration: number;
  price_per_second: number | null;
  estimated_cost: number | null;
  scores: { quality: number; fit: number; price: number; consistency: number; total: number };
  confidence: 'low' | 'medium' | 'high';
  quality_tier: number;
}

const clamp03 = (n: number) => Math.max(0, Math.min(3, Math.round(n)));

/** Deterministic risk assessment from the shot plan text. */
export function assessRisk(shot: Pick<ShotInput, 'description' | 'subject_emphasis' | 'shot_type' | 'on_screen_text'>): RiskFeatures {
  const t = `${shot.description} ${shot.shot_type}`.toLowerCase();
  const has = (...words: string[]) => words.some((w) => t.includes(w));

  const motion = has('pour', 'steam', 'splash', 'drizzle', 'walk', 'danc', 'run', 'spin', 'flip', 'toss', 'whisk', 'camera pan', 'tracking', 'handheld', 'crowd')
    ? has('pour', 'splash', 'drizzle', 'flip', 'toss') ? 3 : 2
    : has('slow push', 'static', 'locked', 'still', 'macro') ? 0 : 1;

  const anatomy = shot.subject_emphasis === 'people' || has('hand', 'face', 'barista', 'smile', 'laugh', 'person', 'people', 'guest', 'friends', 'team')
    ? has('hand', 'pour', 'latte art', 'hold', 'gesture', 'eat', 'bite', 'sip') ? 3 : 2
    : 0;

  const physics = has('pour', 'liquid', 'steam', 'splash', 'drizzle', 'foam', 'melt', 'crumble', 'smoke', 'fire', 'water')
    ? has('pour', 'splash', 'drizzle') ? 3 : 2
    : has('glass', 'ice', 'light', 'shadow') ? 1 : 0;

  const identity = has('same ', 'recurring', 'character', 'host', 'owner', 'barista') && anatomy > 0 ? 2 : anatomy >= 2 ? 1 : 0;

  const textReq = shot.on_screen_text?.trim() ? 3 : has('logo', 'sign', 'menu board', 'text', 'lettering') ? 2 : 0;

  const reference = has('exact', 'this product', 'the actual', 'real menu item', 'logo') ? 2 : 1;

  return {
    motion_complexity: clamp03(motion),
    human_anatomy_risk: clamp03(anatomy),
    physics_risk: clamp03(physics),
    identity_consistency_requirement: clamp03(identity),
    text_requirement: clamp03(textReq),
    reference_strength: clamp03(reference),
  };
}

/** Map a shot to one content category. */
export function categorizeShot(shot: Pick<ShotInput, 'description' | 'subject_emphasis' | 'purpose'>): ContentCategory {
  const t = `${shot.description} ${shot.purpose}`.toLowerCase();
  if (shot.on_screen_text || /logo|brand|cta|text/.test(t) && shot.subject_emphasis === 'brand') return 'text_brand';
  if (/coffee|latte|espresso|matcha|drink|cocktail|juice|tea|beer|wine/.test(t)) return 'drink';
  if (/food|brunch|pancake|croissant|dish|plate|bowl|cake|burger|pizza|menu item|dessert/.test(t)) return 'food';
  if (shot.subject_emphasis === 'people' || /face|smile|laugh|friends|team|barista|guest|crowd/.test(t)) return 'people';
  if (/interior|atmosphere|ambience|cozy|room|space|decor/.test(t)) return 'interior';
  if (/street|exterior|facade|outside|neighbourhood|neighborhood|city/.test(t)) return 'exterior';
  if (/pour|motion|action|dynamic|transition/.test(t)) return 'motion';
  return 'product';
}

/** Static quality prior per UI group (cold start). */
export function staticPrior(uiGroup: string): number {
  switch (uiGroup) {
    case 'flagship': return 0.85;
    case 'professional': return 0.75;
    case 'audio': return 0.7;
    case 'fast': return 0.6;
    case 'economy': return 0.45;
    default: return 0.5;
  }
}

/** Minimum quality tier required by the risk profile (1 = any … 3 = flagship). */
export function requiredTier(risk: RiskFeatures): number {
  const peak = Math.max(risk.motion_complexity, risk.human_anatomy_risk, risk.physics_risk);
  if (peak >= 3 || risk.identity_consistency_requirement >= 3) return 3;
  if (peak >= 2 || risk.identity_consistency_requirement >= 2) return 2;
  return 1;
}

const GROUP_TIER: Record<string, number> = { flagship: 3, professional: 2, audio: 2, fast: 1, economy: 1 };

/** Confidence-weighted quality: Bayesian blend, prior weight k/(k+n). */
export function blendedQuality(prior: number, stats: ModelQaStatsRow | null, k = 5): { quality: number; confidence: 'low' | 'medium' | 'high' } {
  if (!stats || stats.n_runs <= 0) return { quality: prior, confidence: 'low' };
  const observed = stats.n_client_ready / stats.n_runs;
  const w = k / (k + stats.n_runs);
  const quality = prior * w + observed * (1 - w);
  const confidence = stats.n_runs >= 10 ? 'high' : stats.n_runs >= k ? 'medium' : 'low';
  return { quality, confidence };
}

function pickDuration(spec: { durations: number[] }, wanted: number): number | null {
  const sorted = [...spec.durations].sort((a, b) => a - b);
  // exact match first, otherwise the smallest duration that covers the shot
  if (sorted.includes(wanted)) return wanted;
  const covering = sorted.find((d) => d >= wanted);
  return covering ?? null;
}

export interface RouteOptions {
  aspectRatio: string;
  mode: 't2v' | 'i2v';
  pricePerSecond: (pricingId: string) => number | null; // account-adjusted
  stats: Map<string, ModelQaStatsRow>; // key: model|category|mode
  neighborModels?: string[]; // models chosen for other shots of the same video
}

/** Route one shot: returns ranked candidates (best first). */
export function routeShot(
  shot: ShotInput,
  category: ContentCategory,
  risk: RiskFeatures,
  opts: RouteOptions,
): RouteCandidate[] {
  const durationWanted = Math.max(2, Math.ceil(Number(shot.end_s) - Number(shot.start_s)));
  const minTier = requiredTier(risk);
  const candidates: RouteCandidate[] = [];

  for (const m of MUSE_VIDEO_MODELS) {
    const spec = m.modes[opts.mode];
    if (!spec) continue;
    if (!spec.aspectRatios.includes(opts.aspectRatio)) continue;
    const duration = pickDuration(spec, durationWanted);
    if (duration == null) continue;
    const tier = GROUP_TIER[m.uiGroup] ?? 1;
    if (tier < minTier) continue;
    // text_brand shots are composited in editing; generative text is never required,
    // but when a shot still carries text risk prefer stronger models.
    const effectiveTier = risk.text_requirement >= 2 ? Math.max(minTier, 2) : minTier;
    if (tier < effectiveTier) continue;

    // Prefer the highest natively available priced resolution for the tier.
    const priced = spec.resolutions.filter((r) => r.pricingId);
    if (!priced.length) continue;
    const res = priced[0];
    const pps = opts.pricePerSecond(res.pricingId!);

    const statsKey = `${m.id}|${category}|${opts.mode}`;
    const { quality, confidence } = blendedQuality(staticPrior(m.uiGroup), opts.stats.get(statsKey) ?? null);

    // Capability/risk fit: models with native audio and i2v get a small fit bonus
    // for people/identity shots; high-risk shots favour higher tiers.
    let fit = 0.5 + tier * 0.1;
    if (risk.identity_consistency_requirement >= 2 && opts.mode === 'i2v') fit += 0.15;
    if (risk.motion_complexity >= 2 && tier >= 2) fit += 0.1;
    fit = Math.min(1, fit);

    const est = pps == null ? null : Math.round(pps * duration * 100) / 100;
    // Price efficiency relative to a notional €2.50 shot.
    const price = est == null ? 0.3 : Math.max(0, Math.min(1, 1 - est / 5));

    const consistency = opts.neighborModels?.includes(m.id) ? 1 : 0;

    const total = quality * 0.5 + fit * 0.25 + price * 0.15 + consistency * 0.1;
    candidates.push({
      model: m.id,
      displayName: m.displayName,
      mode: opts.mode,
      resolution: res.label,
      duration,
      price_per_second: pps,
      estimated_cost: est,
      scores: { quality: round3(quality), fit: round3(fit), price: round3(price), consistency, total: round3(total) },
      confidence,
      quality_tier: tier,
    });
  }

  candidates.sort((a, b) => b.scores.total - a.scores.total);
  return candidates;
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** Build the English generation prompt for a shot. */
export function buildShotPrompt(shot: ShotInput, ctx: { company: string; visualStyle?: string; onScreenTextNote?: boolean }): string {
  const parts = [
    shot.description.trim(),
    shot.shot_type ? `Shot type: ${shot.shot_type}.` : '',
    ctx.visualStyle ? `Visual style: ${ctx.visualStyle}.` : '',
    'Photorealistic commercial quality, natural lighting, no text overlays, no logos, no watermarks.',
  ];
  return parts.filter(Boolean).join(' ');
}

export function negativeConstraints(risk: RiskFeatures): string {
  const base = ['text', 'watermark', 'logo', 'subtitles', 'deformed hands', 'extra fingers', 'morphing faces', 'flicker'];
  if (risk.physics_risk >= 2) base.push('liquid teleporting', 'objects disappearing');
  if (risk.human_anatomy_risk >= 2) base.push('warped mouth', 'uncanny teeth');
  return base.join(', ');
}

export { MUSE_VIDEO_MODELS };
export type { MuseModelSpec };

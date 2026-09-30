/**
 * Campaign diversity + coverage rules. Pure functions (no I/O) so they can be
 * unit-tested and reused on any host.
 */

export const BUSINESS_AREAS = [
  'products_menu',
  'drinks',
  'atmosphere',
  'people_team',
  'location',
  'service',
  'reviews_social_proof',
  'offers_seasonal',
  'conversion_reservations',
] as const;
export type BusinessArea = typeof BUSINESS_AREAS[number];

export const FUNNEL_STAGES = ['awareness', 'consideration', 'conversion', 'retention'] as const;

export interface PlannedVideo {
  index: number;
  title: string;
  concept: string;
  pillar: string;
  business_area: string;
  funnel_stage: string;
  target_audience: string;
  emotional_angle: string;
  commercial_objective: string;
  primary_goal: string;
  hook_type: string;
  hook_text: string;
  cta: string;
  visual_style: string;
  hero_subject: string;
  main_message: string;
  shot_structure: string[];
  rationale: string;
  series_key?: string | null;
}

export interface RuleViolation {
  rule: string;
  videos: number[];
  detail: string;
}

export const SIMILARITY_DIMENSIONS = ['concept', 'hook', 'cta', 'shot_structure', 'hero_subject', 'main_message'] as const;
export type SimilarityDimension = typeof SIMILARITY_DIMENSIONS[number];

/** Cosine thresholds above which a dimension counts as "the same". */
export const HARD_THRESHOLDS: Record<SimilarityDimension, number> = {
  concept: 0.9,
  hook: 0.9,
  cta: 0.93,
  shot_structure: 0.95,
  hero_subject: 0.92,
  main_message: 0.9,
};
/** Above this, a pair is ambiguous and goes to a structured AI judgment. */
export const BORDERLINE_THRESHOLD = 0.72;

export const norm = (s: string | null | undefined) =>
  String(s ?? '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

export function dimensionText(v: PlannedVideo, d: SimilarityDimension): string {
  switch (d) {
    case 'concept': return `${v.title}. ${v.concept}`;
    case 'hook': return `${v.hook_type}: ${v.hook_text}`;
    case 'cta': return v.cta;
    case 'shot_structure': return v.shot_structure.join(' -> ');
    case 'hero_subject': return v.hero_subject;
    case 'main_message': return `${v.main_message} (${v.commercial_objective})`;
  }
}

/** Structural validation of required fields. */
export function validateShape(videos: PlannedVideo[], requested: number): RuleViolation[] {
  const out: RuleViolation[] = [];
  if (videos.length !== requested) {
    out.push({ rule: 'video_count', videos: [], detail: `Planned ${videos.length} videos, campaign requires exactly ${requested}.` });
  }
  const required: (keyof PlannedVideo)[] = [
    'title', 'concept', 'pillar', 'business_area', 'funnel_stage', 'target_audience', 'emotional_angle',
    'commercial_objective', 'primary_goal', 'hook_type', 'hook_text', 'cta', 'visual_style', 'hero_subject',
    'main_message', 'rationale',
  ];
  for (const v of videos) {
    for (const k of required) {
      if (!String(v[k] ?? '').trim()) out.push({ rule: 'missing_field', videos: [v.index], detail: `Video ${v.index}: "${k}" is required.` });
    }
    if (!(BUSINESS_AREAS as readonly string[]).includes(v.business_area)) {
      out.push({ rule: 'invalid_business_area', videos: [v.index], detail: `Video ${v.index}: business_area must be one of ${BUSINESS_AREAS.join(', ')}.` });
    }
    if (!(FUNNEL_STAGES as readonly string[]).includes(v.funnel_stage)) {
      out.push({ rule: 'invalid_funnel_stage', videos: [v.index], detail: `Video ${v.index}: funnel_stage must be one of ${FUNNEL_STAGES.join(', ')}.` });
    }
    if (!Array.isArray(v.shot_structure) || v.shot_structure.length < 3) {
      out.push({ rule: 'shot_structure', videos: [v.index], detail: `Video ${v.index}: shot_structure needs at least 3 beats.` });
    }
  }
  const idx = videos.map((v) => v.index).sort((a, b) => a - b);
  if (idx.some((n, i) => n !== i + 1)) out.push({ rule: 'index', videos: [], detail: 'Video indexes must be 1..N without gaps.' });
  return out;
}

function dupGroups(videos: PlannedVideo[], key: (v: PlannedVideo) => string, allowSeries = false): number[][] {
  const map = new Map<string, PlannedVideo[]>();
  for (const v of videos) {
    const k = key(v);
    if (!k) continue;
    map.set(k, [...(map.get(k) ?? []), v]);
  }
  const groups: number[][] = [];
  for (const list of map.values()) {
    if (list.length < 2) continue;
    if (allowSeries) {
      const series = list[0].series_key;
      if (series && list.every((v) => v.series_key === series)) continue;
    }
    groups.push(list.map((v) => v.index));
  }
  return groups;
}

/**
 * Exact-field diversity rules. `pillarCount` / `relevantAreaCount` relax
 * uniqueness when the business genuinely has fewer pillars/areas than videos.
 */
export function exactDiversityRules(
  videos: PlannedVideo[],
  opts: { pillarCount: number; relevantAreaCount: number },
): RuleViolation[] {
  const out: RuleViolation[] = [];
  const n = videos.length;
  if (n < 2) return out;

  for (const g of dupGroups(videos, (v) => norm(v.hook_type))) out.push({ rule: 'duplicate_hook_type', videos: g, detail: `Videos ${g.join(', ')} use the same hook type.` });
  for (const g of dupGroups(videos, (v) => norm(v.cta))) out.push({ rule: 'duplicate_cta', videos: g, detail: `Videos ${g.join(', ')} have an identical CTA.` });
  for (const g of dupGroups(videos, (v) => v.shot_structure.map(norm).join('|'))) out.push({ rule: 'duplicate_shot_sequence', videos: g, detail: `Videos ${g.join(', ')} have the same shot sequence.` });
  for (const g of dupGroups(videos, (v) => norm(v.hero_subject), true)) out.push({ rule: 'duplicate_hero_subject', videos: g, detail: `Videos ${g.join(', ')} feature the same hero subject without being marked as a series.` });
  for (const g of dupGroups(videos, (v) => norm(v.primary_goal))) out.push({ rule: 'duplicate_primary_goal', videos: g, detail: `Videos ${g.join(', ')} share the same primary goal.` });
  if (opts.pillarCount >= n) {
    for (const g of dupGroups(videos, (v) => norm(v.pillar), true)) out.push({ rule: 'duplicate_pillar', videos: g, detail: `Videos ${g.join(', ')} use the same content pillar although enough pillars exist.` });
  }
  if (opts.relevantAreaCount >= n) {
    for (const g of dupGroups(videos, (v) => v.business_area, true)) out.push({ rule: 'duplicate_business_area', videos: g, detail: `Videos ${g.join(', ')} cover the same business area although enough relevant areas exist.` });
  }
  if (n >= 3) {
    const stages = new Set(videos.map((v) => v.funnel_stage));
    if (!stages.has('awareness') || !stages.has('conversion')) {
      out.push({ rule: 'funnel_mix', videos: [], detail: 'With 3+ videos the set must include at least one awareness and one conversion video.' });
    }
    const angles = new Set(videos.map((v) => norm(v.emotional_angle)));
    if (angles.size < Math.ceil(n / 2)) out.push({ rule: 'emotional_variety', videos: [], detail: 'Too few distinct emotional angles across the set.' });
  }
  return out;
}

export function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
}

export type PairScores = Record<SimilarityDimension, number>;

export interface PairAssessment {
  a: number;
  b: number;
  scores: PairScores;
  hardHits: SimilarityDimension[];
  borderline: boolean;
}

/** Classifies each pair from per-dimension embeddings. */
export function assessPairs(
  videos: PlannedVideo[],
  vectors: Map<string, number[]>, // key `${index}:${dimension}`
): PairAssessment[] {
  const out: PairAssessment[] = [];
  for (let i = 0; i < videos.length; i++) {
    for (let j = i + 1; j < videos.length; j++) {
      const A = videos[i], B = videos[j];
      const sameSeries = !!A.series_key && A.series_key === B.series_key;
      const scores = {} as PairScores;
      const hardHits: SimilarityDimension[] = [];
      for (const d of SIMILARITY_DIMENSIONS) {
        const va = vectors.get(`${A.index}:${d}`), vb = vectors.get(`${B.index}:${d}`);
        const s = va && vb ? Math.round(cosine(va, vb) * 1000) / 1000 : 0;
        scores[d] = s;
        if (sameSeries && (d === 'hero_subject' || d === 'shot_structure')) continue;
        if (s >= HARD_THRESHOLDS[d]) hardHits.push(d);
      }
      const conceptual = Math.max(scores.concept, scores.main_message, scores.hook);
      out.push({ a: A.index, b: B.index, scores, hardHits, borderline: hardHits.length === 0 && conceptual >= BORDERLINE_THRESHOLD });
    }
  }
  return out;
}

export interface CoverageInput {
  videos: PlannedVideo[];
  pillars: { name: string; rank: number }[];
  areas: { area: string; relevance: number }[];
  tooSimilarPairs: number;
}

export interface CoverageResult {
  score: number;
  breakdown: Record<string, number>;
  coveredPillars: string[];
  missedTopPillars: string[];
  coveredAreas: string[];
  missedRelevantAreas: string[];
}

/** 0-100 campaign coverage score. */
export function coverageScore(input: CoverageInput): CoverageResult {
  const n = Math.max(1, input.videos.length);
  const pillarsByName = new Map(input.pillars.map((p) => [norm(p.name), p]));
  const top = [...input.pillars].sort((a, b) => a.rank - b.rank).slice(0, n);
  const w = (rank: number) => 1 / Math.max(1, rank);
  const covered = new Set(input.videos.map((v) => norm(v.pillar)).filter((p) => pillarsByName.has(p)));
  const topWeight = top.reduce((s, p) => s + w(p.rank), 0) || 1;
  const coveredWeight = top.filter((p) => covered.has(norm(p.name))).reduce((s, p) => s + w(p.rank), 0);
  const pillarPts = 35 * Math.min(1, coveredWeight / topWeight);

  const relevant = input.areas.filter((a) => a.relevance >= 0.5).map((a) => a.area);
  const areasCovered = new Set(input.videos.map((v) => v.business_area).filter((a) => relevant.includes(a)));
  const areaPts = 25 * Math.min(1, areasCovered.size / Math.max(1, Math.min(n, relevant.length || 1)));

  const stages = new Set(input.videos.map((v) => v.funnel_stage));
  const funnelPts = 15 * Math.min(1, stages.size / Math.min(n, 3));

  const uniq = (f: (v: PlannedVideo) => string) => new Set(input.videos.map((v) => norm(f(v)))).size / n;
  const varietyPts = 25 * (
    0.3 * uniq((v) => v.emotional_angle) + 0.3 * uniq((v) => v.hook_type) + 0.2 * uniq((v) => v.visual_style) + 0.2 * uniq((v) => v.hero_subject)
  );

  const penalty = Math.min(40, input.tooSimilarPairs * 15);
  const score = Math.max(0, Math.round(pillarPts + areaPts + funnelPts + varietyPts - penalty));
  return {
    score,
    breakdown: {
      pillars: Math.round(pillarPts * 10) / 10,
      business_areas: Math.round(areaPts * 10) / 10,
      funnel: Math.round(funnelPts * 10) / 10,
      variety: Math.round(varietyPts * 10) / 10,
      similarity_penalty: -penalty,
    },
    coveredPillars: top.filter((p) => covered.has(norm(p.name))).map((p) => p.name),
    missedTopPillars: top.filter((p) => !covered.has(norm(p.name))).map((p) => p.name),
    coveredAreas: [...areasCovered],
    missedRelevantAreas: relevant.filter((a) => !areasCovered.has(a)),
  };
}

export interface ShotInput {
  start_s: number;
  end_s: number;
}

/** Shot plan must be 5-7 contiguous shots of 2-8 s each that cover the full duration. */
export function validateShots(shots: ShotInput[], durationS: number): string[] {
  const errs: string[] = [];
  if (shots.length < 5 || shots.length > 7) errs.push(`Needs 5-7 shots, got ${shots.length}.`);
  const sorted = [...shots].sort((a, b) => a.start_s - b.start_s);
  if (sorted.length && Math.abs(sorted[0].start_s) > 0.01) errs.push('First shot must start at 0 s.');
  for (let i = 0; i < sorted.length; i++) {
    const len = sorted[i].end_s - sorted[i].start_s;
    if (len < 2 || len > 8) errs.push(`Shot ${i + 1} is ${len.toFixed(1)} s; each shot must be 2-8 s.`);
    if (i > 0 && Math.abs(sorted[i].start_s - sorted[i - 1].end_s) > 0.01) errs.push(`Gap/overlap before shot ${i + 1}.`);
  }
  const end = sorted.length ? sorted[sorted.length - 1].end_s : 0;
  if (Math.abs(end - durationS) > 0.5) errs.push(`Shots end at ${end} s; video is ${durationS} s.`);
  return errs;
}

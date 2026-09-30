import { assertEquals, assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { assessPairs, coverageScore, exactDiversityRules, validateShape, validateShots, SIMILARITY_DIMENSIONS, type PlannedVideo } from './diversity.ts';

const base = (i: number, o: Partial<PlannedVideo> = {}): PlannedVideo => ({
  index: i, title: `T${i}`, concept: `c${i}`, pillar: `P${i}`, business_area: ['products_menu', 'drinks', 'atmosphere', 'people_team', 'conversion_reservations', 'service'][i - 1],
  funnel_stage: i === 1 ? 'awareness' : i === 2 ? 'conversion' : 'consideration', target_audience: 'a', emotional_angle: `e${i}`,
  commercial_objective: 'o', primary_goal: `g${i}`, hook_type: `h${i}`, hook_text: 'x', cta: `cta${i}`, visual_style: `v${i}`,
  hero_subject: `s${i}`, main_message: 'm', shot_structure: ['a', 'b', `c${i}`], rationale: 'r', ...o,
});

Deno.test('distinct set passes exact rules', () => {
  const vids = [1, 2, 3, 4, 5, 6].map((i) => base(i));
  assertEquals(validateShape(vids, 6), []);
  assertEquals(exactDiversityRules(vids, { pillarCount: 6, relevantAreaCount: 6 }), []);
});

Deno.test('duplicate hook, cta and hero are rejected; series allowed', () => {
  const vids = [base(1), base(2, { hook_type: 'h1', cta: 'CTA1!', hero_subject: 's1' }), base(3)];
  const rules = exactDiversityRules(vids, { pillarCount: 3, relevantAreaCount: 3 }).map((r) => r.rule);
  assert(rules.includes('duplicate_hook_type') && rules.includes('duplicate_cta') && rules.includes('duplicate_hero_subject'));
  const series = [base(1, { series_key: 's' }), base(2, { hero_subject: 's1', series_key: 's' }), base(3)];
  assert(!exactDiversityRules(series, { pillarCount: 3, relevantAreaCount: 3 }).some((r) => r.rule === 'duplicate_hero_subject'));
});

Deno.test('funnel mix required for 3+', () => {
  const vids = [1, 2, 3].map((i) => base(i, { funnel_stage: 'awareness' }));
  assert(exactDiversityRules(vids, { pillarCount: 3, relevantAreaCount: 3 }).some((r) => r.rule === 'funnel_mix'));
});

Deno.test('semantic pairs: identical vectors hit, orthogonal distinct', () => {
  const vids = [base(1), base(2)];
  const m = new Map<string, number[]>();
  for (const d of SIMILARITY_DIMENSIONS) { m.set(`1:${d}`, [1, 0]); m.set(`2:${d}`, d === 'concept' ? [1, 0] : [0, 1]); }
  const [p] = assessPairs(vids, m);
  assertEquals(p.hardHits, ['concept']);
});

Deno.test('coverage rewards spread and penalises duplicates', () => {
  const vids = [1, 2, 3].map((i) => base(i));
  const pillars = [1, 2, 3].map((i) => ({ name: `P${i}`, rank: i }));
  const areas = ['products_menu', 'drinks', 'atmosphere'].map((a) => ({ area: a, relevance: 0.9 }));
  const good = coverageScore({ videos: vids, pillars, areas, tooSimilarPairs: 0 });
  const bad = coverageScore({ videos: vids, pillars, areas, tooSimilarPairs: 1 });
  assert(good.score >= 90, String(good.score));
  assertEquals(good.score - bad.score, 15);
});

Deno.test('shot validation', () => {
  assertEquals(validateShots([0, 3, 8, 14, 20, 26].map((s, i, a) => ({ start_s: s, end_s: a[i + 1] ?? 30 })), 30), []);
  assert(validateShots([{ start_s: 0, end_s: 30 }], 30).length > 0);
});

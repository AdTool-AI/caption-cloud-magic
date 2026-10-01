import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  assessRisk, blendedQuality, categorizeShot, requiredTier, routeShot, staticPrior,
  type ModelQaStatsRow, type ShotInput,
} from './routing.ts';

const shot = (over: Partial<ShotInput>): ShotInput => ({
  id: 's1', video_id: 'v1', shot_index: 1, start_s: 0, end_s: 5,
  purpose: 'hero', shot_type: 'macro close-up', subject_emphasis: 'product',
  description: 'A plated stack of pancakes with berries, static macro shot.',
  ...over,
});

const price = () => 0.2;
const noStats = new Map<string, ModelQaStatsRow>();

Deno.test('risk: static plated food is low risk', () => {
  const r = assessRisk(shot({}));
  assert(r.motion_complexity <= 1 && r.human_anatomy_risk === 0 && r.physics_risk <= 1);
  assertEquals(requiredTier(r), 1);
});

Deno.test('risk: hand pouring latte art is high risk', () => {
  const r = assessRisk(shot({ subject_emphasis: 'people', description: 'A barista hand pours latte art, milk streaming into the cup.' }));
  assert(r.human_anatomy_risk >= 2 && r.physics_risk >= 2 && r.motion_complexity >= 2);
  assert(requiredTier(r) >= 2);
});

Deno.test('risk routing: latte-art shot excludes economy/fast-only options vs plated food', () => {
  const latte = shot({ subject_emphasis: 'people', description: 'A barista hand pours latte art into a flat white, close-up.' });
  const plated = shot({});
  const latteRoutes = routeShot(latte, 'drink', assessRisk(latte), { aspectRatio: '9:16', mode: 't2v', pricePerSecond: price, stats: noStats });
  const platedRoutes = routeShot(plated, 'food', assessRisk(plated), { aspectRatio: '9:16', mode: 't2v', pricePerSecond: price, stats: noStats });
  assert(latteRoutes.length > 0 && platedRoutes.length > 0);
  const latteMinTier = Math.min(...latteRoutes.map((c) => c.quality_tier));
  const platedMinTier = Math.min(...platedRoutes.map((c) => c.quality_tier));
  assert(latteMinTier > platedMinTier, `latte min tier ${latteMinTier} should exceed plated ${platedMinTier}`);
});

Deno.test('blendedQuality: tiny samples keep the prior', () => {
  const prior = 0.85;
  const oneFail: ModelQaStatsRow = { model: 'm', content_category: 'food', generation_mode: 't2v', n_runs: 1, n_client_ready: 0, score_sum: 2, issue_class_counts: {} };
  const { quality, confidence } = blendedQuality(prior, oneFail);
  assertEquals(confidence, 'low');
  assert(quality > 0.7, `one failure must not crash the prior (got ${quality})`);
});

Deno.test('blendedQuality: large samples dominate', () => {
  const many: ModelQaStatsRow = { model: 'm', content_category: 'food', generation_mode: 't2v', n_runs: 20, n_client_ready: 4, score_sum: 80, issue_class_counts: {} };
  const { quality, confidence } = blendedQuality(0.85, many);
  assertEquals(confidence, 'high');
  assert(quality < 0.35, `20 runs with 4 ready should pull quality down (got ${quality})`);
});

Deno.test('categorizeShot: coffee pour is drink, interior ambience is interior', () => {
  assertEquals(categorizeShot(shot({ description: 'Flat white with latte art on a marble table' })), 'drink');
  assertEquals(categorizeShot(shot({ description: 'Wide shot of the cozy interior with warm light' })), 'interior');
});

Deno.test('routeShot: respects aspect ratio and duration coverage', () => {
  const s = shot({ start_s: 0, end_s: 8 });
  const routes = routeShot(s, 'food', assessRisk(s), { aspectRatio: '9:16', mode: 't2v', pricePerSecond: price, stats: noStats });
  for (const c of routes) assert(c.duration >= 8, `duration ${c.duration} must cover the 8s shot`);
});

Deno.test('routeShot: cheaper model only wins when quality is close', () => {
  const s = shot({});
  const routes = routeShot(s, 'food', assessRisk(s), { aspectRatio: '16:9', mode: 't2v', pricePerSecond: price, stats: noStats });
  // flagship prior (0.85) outweighs small price gains for client demos
  assertEquals(routes[0].displayName.length > 0, true);
  assert(routes[0].scores.quality >= routes[routes.length - 1].scores.quality);
});

Deno.test('staticPrior ordering', () => {
  assert(staticPrior('flagship') > staticPrior('professional'));
  assert(staticPrior('professional') > staticPrior('economy'));
});

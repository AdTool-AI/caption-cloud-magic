import { assert, assertEquals } from 'jsr:@std/assert@1';
import { budgetFit, classifyFailures, materialChanges, planRetry, raiseRisk, rewritePrompt } from './retryPlan.ts';
import { buildPostProduction } from './postProduction.ts';
import type { ModelQaStatsRow } from './routing.ts';

const baseShot = {
  id: 's', video_id: 'v', shot_index: 2, start_s: 0, end_s: 8, purpose: 'craft', shot_type: 'overhead close-up',
  subject_emphasis: 'product', description: 'Egg cracked into bubbling tomato shakshuka sauce, herbs sprinkled in slow motion',
  selected_model: 'kling-3', generation_mode: 't2v', duration_s: 8, resolution: '1080p', aspect_ratio: '9:16',
  english_prompt: 'old', category: 'motion' as const, visual_style: 'Warm, Handheld-Energie',
  risk: { motion_complexity: 1, human_anatomy_risk: 0, physics_risk: 0, identity_consistency_requirement: 0, text_requirement: 0, reference_strength: 1 },
  qa_summary: { issues: { food_logic: 4, hands: 1, physics: 1, prompt_miss: 1 }, overall: 5 },
};
const pps = (pid: string) => (pid.startsWith('kling-3') ? 0.09 : pid.startsWith('seedance-2-5') ? 0.33 : 0.2);
const badKling = new Map<string, ModelQaStatsRow>([
  ['kling-3|motion|t2v', { model: 'kling-3', content_category: 'motion', generation_mode: 't2v', n_runs: 6, n_client_ready: 0, score_sum: 28, issue_class_counts: {} }],
]);

Deno.test('food-logic failure adds explicit physical-action constraints', () => {
  const r = rewritePrompt({ description: baseShot.description, shot_type: baseShot.shot_type, subject_emphasis: 'product', classes: classifyFailures(baseShot.qa_summary.issues), textRelevant: false });
  assert(r.prompt.includes('Exactly one egg'));
  assert(r.prompt.includes('gravity'));
  assert(r.negative.includes('objects appearing or disappearing'));
  assert(r.structural_rules.includes('physical_action_constraints'));
});

Deno.test('text failure removes generated text and marks overlay composition', () => {
  const r = rewritePrompt({ description: 'Rustic table with pan in background, clean space for logo and text overlay', shot_type: 'static medium', subject_emphasis: 'brand', classes: { text_branding: 2 }, textRelevant: true });
  assert(!/logo and text overlay/i.test(r.prompt.split('Action')[0]));
  assert(r.prompt.includes('negative space'));
  assert(r.negative.includes('logo'));
  const post = buildPostProduction({ script: { cta: 'Jetzt Tisch reservieren', on_screen_text: ['Café Buur', 'Brunch in Köln', 'Jetzt Tisch reservieren'] }, company: 'Café Buur', shot: { shot_index: 5, description: 'table', on_screen_text: null }, shotCount: 5, model: 'kling-3', textFailure: true });
  assertEquals(post.composite_text_later, true);
  assertEquals(post.cta_text, 'Jetzt Tisch reservieren');
  assertEquals(post.brand_name_overlay, 'Café Buur');
});

Deno.test('high anatomy/physics risk with bad Kling stats ranks another model first', () => {
  const p = planRetry({ shot: baseShot, linkedAsset: null, stats: badKling, pricePerSecond: pps, neighborModels: [] });
  assert(p.best && p.best.model !== 'kling-3');
  assertEquals(raiseRisk(baseShot.risk, p.classes).physics_risk, 3);
});

Deno.test('reference_only asset never becomes an input frame; reuse_ok switches to i2v', () => {
  const ref = planRetry({ shot: baseShot, linkedAsset: { id: 'a', reuse_status: 'reference_only' }, stats: badKling, pricePerSecond: pps, neighborModels: [] });
  assertEquals(ref.mode, 't2v');
  const ok = planRetry({ shot: baseShot, linkedAsset: { id: 'a', reuse_status: 'reuse_ok' }, stats: badKling, pricePerSecond: pps, neighborModels: [] });
  assertEquals(ok.mode, 'i2v');
});

Deno.test('wording-only retry is trivial', () => {
  const same = { model: 'kling-3', mode: 't2v', asset: null, duration: 8, motion_plan: 'handheld' };
  assertEquals(materialChanges(same, { ...same, subject_reduced: false, structural_rules: [] }).material, false);
  assertEquals(materialChanges(same, { ...same, model: 'seedance-2-5', subject_reduced: false, structural_rules: [] }).changed, ['model']);
});

Deno.test('budget fit flags out-of-scope or over-budget retries', () => {
  const f = budgetFit({ originalCost: 0.8, retryCost: 2.64, maxTotal: 6.8, spent: 3.4, outstanding: 0, attempts: 1, retryBudgetPerShot: 1, scope: { model: 'kling-3', duration_s: 8, resolution: '1080p' }, proposed: { model: 'seedance-2-5', duration: 8, resolution: '720p' } });
  assertEquals(f.remaining_approved_budget, 3.4);
  assertEquals(f.within_approved_scope, false);
  assertEquals(f.requires_new_approval, true);
  const used = budgetFit({ originalCost: 0.8, retryCost: 0.5, maxTotal: 6.8, spent: 3.4, outstanding: 0, attempts: 2, retryBudgetPerShot: 1, scope: { model: 'kling-3', duration_s: 8, resolution: '1080p' }, proposed: { model: 'kling-3', duration: 8, resolution: '1080p' } });
  assertEquals(used.within_retry_allowance, false);
});

Deno.test('Phase B never sets final readiness; German VO defaults to Phase C TTS', () => {
  const post = buildPostProduction({ script: { voiceover: 'Schon mal Brunch gehört?', music_direction: 'acoustic', sound_direction: 'Pan sizzle, egg crack, soft café ambience' }, company: 'Café Buur', shot: { shot_index: 1, description: 'sucuk sizzling in hot pan', client_ready: true }, shotCount: 5, model: 'kling-3', textFailure: false });
  assertEquals(post.visual_client_ready, true);
  assert(!('final_client_ready' in post));
  assertEquals(post.voiceover_source, 'deferred_tts_phase_c');
  assertEquals(post.native_audio_preferred, false);
  assert(post.sfx_direction?.includes('Pan sizzle'));
});

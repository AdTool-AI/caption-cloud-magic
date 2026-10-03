/**
 * Phase B retry planner (pure — no DB, no network, no paid calls).
 *
 * A retry must materially change the failed attempt: model, generation mode,
 * reference asset, prompt structure, motion plan, subject complexity or
 * duration. Wording-only changes are rejected as TRIVIAL_RETRY.
 */

import {
  blendedQuality, routeShot, staticPrior,
  type ContentCategory, type ModelQaStatsRow, type RiskFeatures, type RouteCandidate, type ShotInput,
} from './routing.ts';
import { MUSE_VIDEO_MODELS } from '../videoModelCatalog.ts';

export const FAILURE_CLASSES = [
  'anatomy_hands', 'face_identity', 'morphing', 'physics', 'food_logic', 'text_branding', 'flicker_motion', 'prompt_adherence',
] as const;
export type FailureClass = (typeof FAILURE_CLASSES)[number];

const ISSUE_TO_CLASS: Record<string, FailureClass> = {
  hands: 'anatomy_hands', anatomy: 'anatomy_hands', faces: 'face_identity', identity: 'face_identity',
  morphing: 'morphing', physics: 'physics', food_logic: 'food_logic', text: 'text_branding',
  flicker: 'flicker_motion', prompt_miss: 'prompt_adherence',
};

/** QA issue counts → failure classes with summed severity. */
export function classifyFailures(issues: Record<string, number> | null | undefined): Record<FailureClass, number> {
  const out = {} as Record<FailureClass, number>;
  for (const [k, v] of Object.entries(issues ?? {})) {
    const c = ISSUE_TO_CLASS[k];
    if (c) out[c] = (out[c] ?? 0) + Number(v || 0);
  }
  return out;
}

/** Risk features raised to what QA actually observed. Text risk drops to 0: text is composited later. */
export function raiseRisk(risk: RiskFeatures, classes: Record<string, number>): RiskFeatures {
  const r = { ...risk };
  if (classes.anatomy_hands) r.human_anatomy_risk = Math.max(r.human_anatomy_risk, classes.anatomy_hands >= 2 ? 3 : 2);
  if (classes.face_identity) r.identity_consistency_requirement = Math.max(r.identity_consistency_requirement, 2);
  if (classes.physics || classes.food_logic) r.physics_risk = Math.max(r.physics_risk, (classes.food_logic ?? 0) >= 3 ? 3 : 2);
  if (classes.morphing || classes.flicker_motion) r.motion_complexity = Math.max(r.motion_complexity, 2);
  r.text_requirement = 0;
  return r;
}

/** Penalty for the model that just failed, scaled by how badly it failed. */
export function failedModelPenalty(classes: Record<string, number>): number {
  const severity = Object.values(classes).reduce((a, b) => a + b, 0);
  return Math.min(0.3, 0.1 + severity * 0.02);
}

export function rerank(candidates: RouteCandidate[], failedModel: string, classes: Record<string, number>): RouteCandidate[] {
  const p = failedModelPenalty(classes);
  return candidates
    .map((c) => (c.model === failedModel ? { ...c, scores: { ...c.scores, total: Math.round((c.scores.total - p) * 1000) / 1000 } } : c))
    .sort((a, b) => b.scores.total - a.scores.total);
}

// ---------------------------------------------------------------------------
// Prompt rewrite
// ---------------------------------------------------------------------------

const TEXT_WORDS = /\b(logo|logos|text|lettering|sign|signs|signage|menu board|label|labels|typography|caption)s?\b/i;

export function stripTextIntent(description: string): string {
  let d = description.replace(/,?\s*clean space for (a )?logo( and| &)? text overlay/i, ', clean empty negative space in the upper third of the frame');
  d = d.replace(/\b(with|showing)\s+(the\s+)?(logo|sign|signage|lettering|text)[^,.]*/gi, '');
  d = d.split(/,\s*/).filter((part) => !TEXT_WORDS.test(part) || /negative space/.test(part)).join(', ');
  return d.replace(/\s{2,}/g, ' ').replace(/\s+,/g, ',').trim();
}

/** Lists of 4+ items are cut to the first three (fewer objects → fewer morphs). */
export function reduceSubjects(description: string): { text: string; reduced: boolean } {
  const m = description.match(/^(.*?\bwith\s+)(.+?)(\s+in\s+.+)?$/i);
  if (!m) return { text: description, reduced: false };
  const items = m[2].split(/,\s*|\s+and\s+/).map((s) => s.trim()).filter(Boolean);
  if (items.length < 4) return { text: description, reduced: false };
  const kept = items.slice(0, 3);
  return { text: `${m[1]}${kept.slice(0, -1).join(', ')} and ${kept[kept.length - 1]}${m[3] ?? ''}`, reduced: true };
}

function foodActionConstraints(description: string): string[] {
  const d = description.toLowerCase();
  const out: string[] = [];
  if (/egg/.test(d)) out.push('Exactly one egg: the shell opens once, the yolk drops intact into the sauce and stays where it lands; the shell leaves the frame and never reappears.');
  if (/herb|sprinkl/.test(d)) out.push('Herbs fall straight down under gravity and settle on the surface; they never float upward or vanish.');
  if (/sizzl|sausage|sucuk/.test(d)) out.push('The same number of sausage slices throughout, each keeps its shape; oil bubbles only around the slices; steam rises upward and thins out.');
  if (/table|spread/.test(d)) out.push('Every dish stays in its place for the whole shot; the number of plates, cups and bowls never changes; nothing appears or disappears.');
  if (/bite|eat/.test(d)) out.push('One piece of bread already held at mouth level at the start; exactly one bite; afterwards the piece shows a matching bite mark.');
  if (/coffee|pour|drink/.test(d)) out.push('Liquid level only changes while liquid is visibly poured; cups stay full or empty consistently.');
  out.push('Food obeys real physics: no merging, splitting or teleporting items; start and end state are consistent.');
  return out;
}

export interface PromptRewrite {
  prompt: string;
  negative: string;
  motion_plan: string;
  previous_motion_plan: string;
  subject_reduced: boolean;
  structural_rules: string[];
}

function inferMotionPlan(shotType: string, visualStyle?: string | null): string {
  const t = `${shotType} ${visualStyle ?? ''}`.toLowerCase();
  if (/handheld/.test(t)) return 'handheld';
  if (/static|locked/.test(t)) return 'locked-off';
  if (/slow motion/.test(t)) return 'slow motion';
  return 'unspecified';
}

export function rewritePrompt(input: {
  description: string; shot_type: string; visual_style?: string | null; subject_emphasis: string;
  classes: Record<string, number>; textRelevant: boolean;
}): PromptRewrite {
  const c = input.classes;
  const rules: string[] = [];
  let subject = input.description;
  if (c.text_branding || input.textRelevant) subject = stripTextIntent(subject);
  let reduced = false;
  if (c.food_logic || c.morphing || c.flicker_motion) {
    const r = reduceSubjects(subject);
    subject = r.text; reduced = r.reduced;
  }
  const hasPerson = input.subject_emphasis === 'people' || /\b(woman|man|person|people|guest|barista|friends)\b/i.test(input.description);

  const previous = inferMotionPlan(input.shot_type, input.visual_style);
  const calm = c.flicker_motion || c.morphing || c.face_identity;
  const motion = calm
    ? 'Locked-off tripod camera, no camera movement, no cuts.'
    : 'One slow, steady push-in on a tripod dolly, no handheld shake, no cuts.';

  const action: string[] = [];
  if (c.food_logic || c.physics) { action.push(...foodActionConstraints(subject)); rules.push('physical_action_constraints'); }
  if (c.anatomy_hands) {
    action.push(hasPerson
      ? 'Hands stay simple: one hand holds one object in a static, natural grip; no finger close-ups; no gestures.'
      : 'No hands in frame.');
    rules.push('hand_framing');
  }
  if (c.face_identity) {
    action.push(hasPerson
      ? 'Exactly one person, face fully visible and stable, the same face from first to last frame; expressions change slowly.'
      : 'No people and no faces anywhere in frame, including the background.');
    rules.push('subject_count_lock');
  }
  if (c.text_branding || input.textRelevant) { action.push('No visible text, letters, signs, menus, labels, packaging print or logos anywhere in the frame.'); rules.push('text_removed_for_overlay'); }
  if (c.prompt_adherence) { action.push('The described action is the only event in the shot and happens in the first half.'); rules.push('single_event'); }
  if (c.morphing) { action.push('All objects keep their exact shape, size and position unless the action moves them.'); rules.push('object_permanence'); }

  const style = input.visual_style ? `Look: ${input.visual_style.replace(/handheld[-\s]?energie|handheld energy/ig, 'calm energy')}.` : '';
  const prompt = [
    `Subject: ${subject.replace(/\.$/, '')}.`,
    `Shot: ${input.shot_type.replace(/handheld/i, 'stabilized')}.`,
    `Camera: ${motion}`,
    action.length ? `Action and continuity: ${action.join(' ')}` : '',
    style,
    'Photorealistic commercial food photography quality, natural warm lighting.',
    'Audio: visual-only clip; no dialogue, no voice, no music.',
  ].filter(Boolean).join(' ');

  const neg = ['text', 'letters', 'logo', 'signage', 'watermark', 'subtitles', 'camera shake', 'jump cuts', 'flicker'];
  if (c.anatomy_hands) neg.push('extra fingers', 'fused fingers', 'deformed hands', 'floating hands');
  if (c.face_identity) neg.push(hasPerson ? 'face changing identity' : 'people', hasPerson ? 'warped mouth' : 'faces', 'background faces');
  if (c.morphing) neg.push('morphing objects', 'shape-shifting food', 'melting geometry');
  if (c.food_logic || c.physics) neg.push('objects appearing or disappearing', 'teleporting food', 'liquid flowing upward', 'duplicated eggs', 'changing item count');
  if (c.flicker_motion) neg.push('frame flicker', 'strobing light', 'rapid motion');
  if (hasPerson) neg.push('dialogue', 'lip movement speaking');

  return {
    prompt, negative: [...new Set(neg)].join(', '),
    motion_plan: calm ? 'locked-off' : 'slow push-in',
    previous_motion_plan: previous,
    subject_reduced: reduced,
    structural_rules: rules,
  };
}

// ---------------------------------------------------------------------------
// Materiality, budget and improvement rationale
// ---------------------------------------------------------------------------

export interface MaterialChange {
  material: boolean;
  changed: string[];
}

export function materialChanges(before: { model: string; mode: string; asset: string | null; duration: number; motion_plan: string },
  after: { model: string; mode: string; asset: string | null; duration: number; motion_plan: string; subject_reduced: boolean; structural_rules: string[] }): MaterialChange {
  const changed: string[] = [];
  if (before.model !== after.model) changed.push('model');
  if (before.mode !== after.mode) changed.push('generation_mode');
  if ((before.asset ?? null) !== (after.asset ?? null)) changed.push('reference_asset');
  if (Number(before.duration) !== Number(after.duration)) changed.push('duration');
  if (before.motion_plan !== after.motion_plan) changed.push('motion_plan');
  if (after.subject_reduced) changed.push('subject_complexity');
  if (after.structural_rules.length > 0) changed.push('prompt_structure');
  return { material: changed.length > 0, changed };
}

export interface BudgetFit {
  original_attempt_cost: number;
  retry_cost: number;
  remaining_approved_budget: number;
  within_retry_allowance: boolean;
  within_approved_scope: boolean;
  requires_new_approval: boolean;
  note: string;
}

export function budgetFit(input: {
  originalCost: number; retryCost: number; maxTotal: number; spent: number; outstanding: number;
  attempts: number; retryBudgetPerShot: number;
  scope: { model: string; duration_s: number; resolution: string } | null;
  proposed: { model: string; duration: number; resolution: string };
}): BudgetFit {
  const remaining = Math.round((input.maxTotal - input.spent - input.outstanding) * 100) / 100;
  const attemptsLeft = input.attempts < 1 + input.retryBudgetPerShot;
  const inScope = !!input.scope && input.scope.model === input.proposed.model
    && Number(input.scope.duration_s) === Number(input.proposed.duration) && input.scope.resolution === input.proposed.resolution;
  const within = attemptsLeft && input.retryCost <= remaining && input.retryCost <= input.originalCost;
  const note = !attemptsLeft ? 'The approved retry allowance for this shot is used up.'
    : input.retryCost > remaining ? 'Retry cost exceeds the remaining approved budget.'
    : !inScope ? 'Model, duration or resolution differ from the approved scope, so this retry needs a new budget approval before it can run.'
    : input.retryCost > input.originalCost ? 'Retry costs more than the approved per-shot allowance.'
    : 'Fits the existing approval.';
  return {
    original_attempt_cost: input.originalCost, retry_cost: input.retryCost, remaining_approved_budget: remaining,
    within_retry_allowance: within, within_approved_scope: inScope, requires_new_approval: !inScope || !within, note,
  };
}

const CLASS_TO_RISK: Record<FailureClass, string> = {
  anatomy_hands: 'anatomy', face_identity: 'identity', morphing: 'morphing', physics: 'physics',
  food_logic: 'food_logic', text_branding: 'text', flicker_motion: 'flicker', prompt_adherence: 'prompt_adherence',
};

export interface PredictedImprovement {
  risks: Array<{ risk: string; direction: 'decrease'; reason: string }>;
  model_reason: string;
  confidence: 'low' | 'medium' | 'high';
}

export function predictImprovement(input: {
  classes: Record<string, number>; rewrite: PromptRewrite; changed: string[];
  oldModel: string; newModel: string; category: string; mode: string; stats: Map<string, ModelQaStatsRow>;
}): PredictedImprovement {
  const r = input.rewrite;
  const reasonFor: Record<FailureClass, string> = {
    anatomy_hands: r.structural_rules.includes('hand_framing') ? 'Hands framed out or limited to one static grip.' : 'Stronger anatomy model.',
    face_identity: r.structural_rules.includes('subject_count_lock') ? 'Subject count locked; background faces excluded.' : 'Calmer camera.',
    morphing: `Object-permanence rule${r.subject_reduced ? ' and fewer objects in frame' : ''}; ${r.motion_plan} camera.`,
    physics: 'Explicit start/end state and gravity rules for every moving element.',
    food_logic: 'Single physical action with fixed item count; nothing may appear, vanish or merge.',
    text_branding: 'All generated text removed; exact wording is composited later as a deterministic overlay.',
    flicker_motion: `${r.previous_motion_plan} → ${r.motion_plan}; no cuts, no shake.`,
    prompt_adherence: 'One event only, placed early in the shot.',
  };
  const risks = (Object.keys(input.classes) as FailureClass[])
    .filter((k) => input.classes[k] > 0)
    .map((k) => ({ risk: CLASS_TO_RISK[k], direction: 'decrease' as const, reason: reasonFor[k] }));

  const oldStats = input.stats.get(`${input.oldModel}|${input.category}|${input.mode}`) ?? null;
  const newSpec = MUSE_VIDEO_MODELS.find((m) => m.id === input.newModel);
  const newStats = input.stats.get(`${input.newModel}|${input.category}|${input.mode}`) ?? null;
  const q = blendedQuality(staticPrior(newSpec?.uiGroup ?? ''), newStats);
  const oldLine = oldStats && oldStats.n_runs > 0
    ? `${input.oldModel}: ${oldStats.n_client_ready}/${oldStats.n_runs} client-ready, avg QA ${(oldStats.score_sum / oldStats.n_runs).toFixed(1)}/10 for ${input.category}.`
    : `${input.oldModel}: no history for ${input.category}.`;
  const model_reason = input.newModel === input.oldModel
    ? `Model kept (still ranks first after the failure penalty). ${oldLine}`
    : `${oldLine} ${newSpec?.displayName ?? input.newModel} (${newSpec?.uiGroup ?? '?'} tier) has expected quality ${q.quality.toFixed(2)} from ${newStats?.n_runs ?? 0} own QA runs plus its tier prior, and is not affected by the observed failure penalty.`;
  // Confidence never exceeds what the stats of the proposed model support.
  return { risks, model_reason, confidence: q.confidence };
}

// ---------------------------------------------------------------------------
// One-shot planner
// ---------------------------------------------------------------------------

export interface PlanInput {
  shot: ShotInput & {
    selected_model: string; generation_mode: string; duration_s: number; resolution: string; aspect_ratio: string;
    input_asset_id?: string | null; qa_summary?: { issues?: Record<string, number>; overall?: number } | null;
    risk: RiskFeatures; category: ContentCategory; visual_style?: string | null; english_prompt: string;
  };
  linkedAsset: { id: string; reuse_status: string } | null;
  stats: Map<string, ModelQaStatsRow>;
  pricePerSecond: (pricingId: string) => number | null;
  neighborModels: string[];
}

export function planRetry(input: PlanInput) {
  const s = input.shot;
  const classes = classifyFailures(s.qa_summary?.issues);
  const risk = raiseRisk(s.risk, classes);

  // Mode: switch t2v → i2v only with a reuse_ok asset and an identity/anatomy/product/physics failure.
  const wantsReference = !!(classes.face_identity || classes.anatomy_hands || classes.morphing || classes.physics || classes.food_logic);
  const asset = input.linkedAsset && input.linkedAsset.reuse_status === 'reuse_ok' ? input.linkedAsset : null;
  const mode: 't2v' | 'i2v' = s.generation_mode === 'i2v' ? 'i2v' : asset && wantsReference ? 'i2v' : 't2v';
  const modeNote = mode !== s.generation_mode ? `Switched to image-to-video using reuse_ok asset ${asset!.id}.`
    : mode === 't2v' ? (input.linkedAsset?.reuse_status === 'reference_only'
      ? 'Linked asset is reference_only and is never used as an input frame; stays text-to-video.'
      : 'No reuse_ok asset is linked to this shot; stays text-to-video.')
    : 'Already image-to-video.';

  const ranked = rerank(routeShot(s, s.category, risk, {
    aspectRatio: s.aspect_ratio, mode, pricePerSecond: input.pricePerSecond, stats: input.stats, neighborModels: input.neighborModels,
  }), s.selected_model, classes);
  const best = ranked[0] ?? null;

  const rewrite = rewritePrompt({
    description: s.description, shot_type: s.shot_type, visual_style: s.visual_style, subject_emphasis: s.subject_emphasis,
    classes, textRelevant: !!s.on_screen_text || risk.text_requirement > 0 || s.subject_emphasis === 'brand',
  });

  return { classes, risk, mode, modeNote, asset, ranked, best, rewrite };
}

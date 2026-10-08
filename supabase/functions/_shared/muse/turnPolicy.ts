/**
 * Server-side turn policy for the AdTool Agent.
 *
 * Read-only mode is decided by the SERVER from the message itself. A client
 * flag can only switch read-only ON, never off — so a missing or manipulated
 * flag cannot unlock paid, approval-changing or writing tools for a status
 * question. Pure: no I/O.
 */

/** The only tools a read-only turn may see and execute. */
export const READ_ONLY_TOOLS: ReadonlySet<string> = new Set([
  'get_user_context',
  'get_available_video_models',
  'get_video_status',
  'get_campaign',
  'get_campaign_production_status',
]);


// Explicit commands to act (generate, start, retry, approve, plan, charge …) in EN/DE/ES.
const ACTION_RE = new RegExp(
  [
    // EN
    String.raw`\b(start|generate|create|make|render|produce|launch|kick\s*off|run|execute|go\s+ahead|proceed|approve|confirm|charge|retry\s+(it|s\d|shot|now|them)|redo|regenerate|do\s+it)\b`,
    // DE
    String.raw`\b(starte\w*|start(en)?|generier\w*|erstell\w*|erzeug\w*|produzier\w*|render\w*|leg\w*\s+(los|an)|mach\w*|führ\w*|ausführ\w*|wiederhol\w*|freigeb\w*|gib\w*\s+frei|genehmig\w*|bestätig\w*|buch\w*|kalkulier\w*|berechne\w*|plane\w*|recherchier\w*|bereite\w*|los\s*geht|leg\s+los|neu\s+(generier|erstell|mach|render)\w*)\b`,
    // ES
    String.raw`\b(inicia\w*|empieza\w*|genera\w*|crea\w*|produce\w*|renderiza\w*|lanza\w*|ejecuta\w*|aprueba\w*|confirma\w*|reintenta\w*|repite\w*|prepara\w*|planifica\w*|investiga\w*|calcula\w*|estima\w*)\b`,
  ].join('|'),
  'i',
);

const NEGATED_RE = /\b(nicht|kein\w*|nichts|don'?t|do\s+not|never|without|ohne|no\s+(new|paid)|sin|no\s+generes|no\s+inicies)\b/i;

/**
 * Clauses of a message with negation scope: a negation ("ohne", "keine",
 * "without", "sin", "nicht") starts a new clause and stays in force for the
 * following list items ("ohne Budgetfreigabe, Freigabekarte oder Abbuchung")
 * until the sentence ends. So a verb before the negation still counts, and
 * nouns listed after it never do.
 */
const NOUN_COMPOUND_RE = /[\p{L}-]*(?:dauer|kosten|zeit|länge|daten|modus|preis|preise|status|plan|pläne|karte|budget)\b/giu;
export function splitClauses(message: string): Array<{ text: string; negated: boolean }> {
  const out: Array<{ text: string; negated: boolean }> = [];
  for (const sentence of String(message ?? '').replace(/[¿¡]/g, ' ').split(/[.!?;\n]+/)) {
    let negated = false;
    const parts = sentence.split(/[,\u2013\u2014:]+|\s-\s|\b(?:and|und|y|then|dann|oder|or|sowie)\b|(?=\b(?:ohne|without|sin|kein\w*|nicht|nichts|never|no\s+(?:new|paid))\b)/i);
    for (const raw of parts) {
      const t = (raw ?? '').trim();
      if (!t) continue;
      if (NEGATED_RE.test(t)) negated = true;
      else if (/\b(dann|then|aber|but|pero|danach|anschließend)\b/i.test(t)) negated = false;
      // Compound nouns ("Generierungsdauer", "Produktionskosten", "Planungsdaten")
      // name a quantity, not a command — drop them before verb matching.
      out.push({ text: t.replace(NOUN_COMPOUND_RE, ' ').trim(), negated });
    }
  }
  return out;
}

/**
 * True when the message is a status/information request without a command to
 * act. Action verbs that only appear under an explicit negation ("do not
 * generate", "nichts starten") do not count as commands.
 */
export function classifyReadOnly(message: string): boolean {
  const text = String(message ?? '').trim();
  if (!text) return true;
  // Split into clauses; a clause with an action verb counts unless it is negated.
  for (const { text: c, negated } of splitClauses(text)) {
    if (ACTION_RE.test(c) && !negated && !isPureQuestionAboutAction(c)) return false;
  }
  return true;
}

/** "What would a retry cost?", "Wie viel würde ... kosten", "¿Cuánto costaría …?" — questions, not commands. */
function isPureQuestionAboutAction(clause: string): boolean {
  return /^(what|how|which|why|when|is|are|does|would|was|wie|welche\w*|warum|wann|wäre|würde|ist|sind|gibt|qué|cómo|cuál|cuánto|por\s+qué|cuándo)\b/i.test(clause)
    && !/\b(can\s+you|could\s+you|kannst\s+du|könntest\s+du|würdest\s+du|puedes)\b/i.test(clause);
}

export type TurnMode = 'read_only' | 'planning' | 'normal';

/**
 * Planning turns: free planning tools only, listed one by one (never "everything
 * in campaign/"). Each entry was checked in code: no media generation, no
 * production job, no approval row, no wallet/ledger write. `internalCost` notes
 * provider API costs the platform carries (never charged to the user wallet).
 */
export const PLANNING_TOOL_AUDIT: Readonly<Record<string, { writes: string; internalCost: string }>> = {
  get_user_context: { writes: 'none', internalCost: 'none' },
  get_available_video_models: { writes: 'none', internalCost: 'none' },
  get_video_status: { writes: 'none', internalCost: 'none' },
  get_campaign: { writes: 'none', internalCost: 'none' },
  get_campaign_production_status: { writes: 'none', internalCost: 'none' },
  create_campaign: { writes: 'agent_campaigns (reuses the existing campaign of this chat + company)', internalCost: 'none' },
  research_business: { writes: 'campaign_sources, campaign_assets (reference_only), agent_campaigns.website — upsert by url', internalCost: 'Perplexity / Firecrawl API' },
  record_research_findings: { writes: 'campaign_facts, agent_campaigns research fields — replaces the set', internalCost: 'none' },
  collect_campaign_assets: { writes: 'campaign_assets — upsert by (campaign_id,url)', internalCost: 'none' },
  identify_content_pillars: { writes: 'campaign_pillars — replaces the set', internalCost: 'none' },
  identify_business_areas: { writes: 'campaign_business_areas — replaces the set', internalCost: 'none' },
  plan_campaign_videos: { writes: 'campaign_videos — upsert by (campaign_id,video_index); campaign_similarity_checks', internalCost: 'embeddings API' },
  write_video_scripts: { writes: 'campaign_videos.script, campaign_shots — updates in place by shot_index (ids/routing kept, changed shots marked routing_stale)', internalCost: 'none' },
  discover_social_profiles: { writes: 'campaign_social_profiles — upsert by (campaign_id,platform)', internalCost: 'Firecrawl API' },
  record_social_analysis: { writes: 'campaign_social_profiles', internalCost: 'none' },
  route_campaign_shots: { writes: 'campaign_shots routing fields + estimated_cost (no approval, no reservation)', internalCost: 'none' },
};
export const PLANNING_TOOLS: ReadonlySet<string> = new Set(Object.keys(PLANNING_TOOL_AUDIT));

/** Tools that may never run in a planning turn (generation, production, approvals, retries, spend). */
export const PLANNING_FORBIDDEN = [
  'generate_video', 'regenerate_video', 'estimate_video_cost', 'analyze_asset', 'estimate_campaign_budget',
  'start_campaign_production', 'review_shot', 'prepare_shot_retry', 'request_retry_approval', 'retry_shot',
] as const;

// Production / approval / spend vocabulary — any such command keeps the turn 'normal'.
const PRODUCTION_RE = /\b(generier\w*|generate\w*|genera\w*|render\w*|renderiza\w*|produzier\w*|produktion\w*|production|produce\w*|producci\w*|retry\w*|wiederhol\w*|reintenta\w*|freigab\w*|freigeb\w*|gib\w*\s+frei|genehmig\w*|approv\w*|aprueba\w*|budget\w*|presupuesto|buch\w*|charge\w*|abbuch\w*|cobra\w*|clip\w*|videos?\s+(erstell|erzeug|mach)\w*|kick\s*off|launch)\b/i;
// Planning vocabulary (research, plan, script, shots, save the plan) in EN/DE/ES.
const PLANNING_RE = /\b(plan\w*|planung\w*|plane\w*|planifica\w*|speicher\w*|sicher\w*|save\w*|guarda\w*|recherch\w*|research\w*|investiga\w*|skript\w*|script\w*|guion\w*|shots?|tomas?|konzept\w*|concept\w*|kampagne\w*|campaign\w*|campaña\w*|vervollständig\w*|complete|completa\w*|zielgruppe|audience|fakten|facts|säulen|pillars)\b/i;
// "Save / complete the plan" as an explicit command even when phrased like a request.
const SAVE_RE = /\b(speicher\w*|fertigstell\w*|abschlie(?:ß|ss)\w*|finish\w*|finaliz\w*|termina\w*|save|guarda\w*|vervollst\w*|complete\s+the\s+plan|completa\w*|ergänz\w*|erganz\w*|aktualisier\w*|update\w*|actualiza\w*|füg\w*\s+.{0,40}hinzu|add|añade\w*|trag\w*\s+.{0,40}ein|rout\w*|enruta\w*)\b/i;
const CONTINUATION_RE = /^((ok(ay)?|ja|yes|gut|passt|s[ií])[\s,.!]+)?(weiter(machen)?|mach\s+weiter|fortfahren|fahr\s+fort|continue|go\s+on|keep\s+going|carry\s+on|next|sigue|seguir|contin[uú]a|ok(ay)?|ja|yes|s[ií]|passt|gut|genau|bitte)\b[\s,.:!-]*(bitte|please|por\s+favor|so|mit\b.{0,80}|with\b.{0,80}|con\b.{0,80})?[\s.!]*$/i;

function hasCommand(text: string, re: RegExp): boolean {
  return splitClauses(text).some(({ text: c, negated }) => re.test(c) && !negated && !isPureQuestionAboutAction(c));
}

/** Short continuation like "weiter", "continue", "sigue", "ok, weiter mit Planung speichern". */
export function isContinuation(message: string): boolean {
  const t = String(message ?? '').trim();
  return t.length > 0 && t.length <= 100 && CONTINUATION_RE.test(t);
}

export interface TurnDecision { mode: TurnMode; reason: string; needsClarification?: boolean }

/** Mode of a standalone (non-continuation) message. */
function standaloneMode(message: string): TurnDecision {
  if (classifyReadOnly(message)) {
    if (hasCommand(message, SAVE_RE) && !hasCommand(message, PRODUCTION_RE)) return { mode: 'planning', reason: 'save_plan_command' };
    return { mode: 'read_only', reason: 'status_or_question' };
  }
  if (hasCommand(message, PRODUCTION_RE)) return { mode: 'normal', reason: 'production_command' };
  if (PLANNING_RE.test(message)) return { mode: 'planning', reason: 'planning_command' };
  return { mode: 'normal', reason: 'other_command' };
}

/**
 * Server-side mode decision. `priorUserMessages` are the previous user messages
 * of the SAME conversation read from the database (newest first) — never from
 * the client. A continuation inherits at most 'planning' from the latest
 * standalone request, so "weiter" can never unlock production or approvals,
 * also not after a failed or rejected production request.
 */
export function decideTurnMode(input: { message: string; clientReadOnly?: unknown; priorUserMessages?: string[] }): TurnDecision {
  if (input.clientReadOnly === true) return { mode: 'read_only', reason: 'client_read_only' };
  const message = String(input.message ?? '');
  if (isContinuation(message)) {
    const prior = (input.priorUserMessages ?? []).find((m) => !isContinuation(m));
    const base = prior ? standaloneMode(prior) : null;
    if (base && base.mode !== 'read_only') return { mode: 'planning', reason: `continuation_of_${base.reason}` };
    if (PLANNING_RE.test(message) && !hasCommand(message, PRODUCTION_RE)) return { mode: 'planning', reason: 'continuation_with_planning_words' };
    return { mode: 'read_only', reason: base ? 'continuation_of_status_question' : 'continuation_without_context', needsClarification: true };
  }
  return standaloneMode(message);
}

export function resolveTurnMode(input: { message: string; clientReadOnly?: unknown; priorUserMessages?: string[] }): TurnMode {
  return decideTurnMode(input).mode;
}

/** Execution-time guard: read-only and planning turns refuse every tool outside their explicit list. */
export function guardToolCall(mode: TurnMode, name: string): { error: string; code: 'READ_ONLY_TURN' | 'PLANNING_TURN' } | null {
  if (mode === 'read_only') {
    if (READ_ONLY_TOOLS.has(name)) return null;
    return {
      code: 'READ_ONLY_TURN',
      error: `This turn is read-only. "${name}" was blocked on the server: nothing was generated, retried, approved or charged. Answer from the data you can read; if the user wants an action, they must ask for it explicitly.`,
    };
  }
  if (mode === 'planning') {
    if (PLANNING_TOOLS.has(name)) return null;
    return {
      code: 'PLANNING_TURN',
      error: `This is a planning turn. "${name}" was blocked on the server: planning may research and save the campaign plan, but nothing is generated, produced, approved, retried or charged. The user must ask for production explicitly in a new message.`,
    };
  }
  return null;
}

export function toolAllowedInMode(mode: TurnMode, name: string): boolean {
  return guardToolCall(mode, name) === null;
}

export async function requestFingerprint(conversationId: string | null | undefined, message: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${conversationId ?? ''}\u0000${message}`));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export const READ_ONLY_INSTRUCTION =
  'THIS TURN IS READ-ONLY (enforced by the server). You only have reading tools. Answer the user\'s latest question directly from the data. For shot retries, report the stored retry_plan: proposed model, retry cost with currency, QA failure classes, planned changes, and whether a new approval is required (cost.requires_new_approval). Explicitly name any information that is missing. Do not offer to start anything in this turn beyond telling the user they can ask for it explicitly.';

export const CLARIFY_CONTINUATION_INSTRUCTION =
  'The user sent a short continuation ("weiter", "continue", …) but the server found no earlier request in this chat it could continue. Do not guess: ask in one short sentence what exactly should be continued (e.g. research, saving the plan, or a status check). Nothing is started in this turn.';

/** Hard step cap for one planning job (never an endless loop). */
export const PLANNING_MAX_TOOL_ITERATIONS = 20;

/** Server-side auto continuations of one planning job (bounded, no endless loop). */
export const PLANNING_MAX_AUTO_CONTINUES = 3;
export const PLANNING_CONTINUE_INPUT = 'INTERNAL SERVER CONTINUATION (not written by the user): the user already authorized this whole planning job. Continue with the next open step now using the planning tools; do not ask the user to say "weiter". If a real obstacle blocks you, name it and stop.';

/** True when an answer hands the job back ("bitte mit weiter fortfahren", "say continue"). */
export function asksToContinue(text: string): boolean {
  return /(„|"|')?\b(weiter|continue|continuar|sigue)\b("|“|'|”)?[^.\n]{0,40}\b(fortfahren|fahren|schreib\w*|sag\w*|antwort\w*|to\s+proceed|to\s+continue|para\s+seguir)|\b(mit|with|con)\s+[„"']?(weiter|continue|continuar)\b|\boffen:.*\bweiter\b/i.test(text);
}

export const PLANNING_INSTRUCTION = [
  'Finish the WHOLE authorized planning job in this turn without asking the user to say "weiter": continue from what get_campaign shows is already stored (research → pillars/areas → videos → scripts/shots → route_campaign_shots → get_campaign). Only stop early for a real obstacle (missing input only the user can give, tool error) and name it plainly.',
  'THIS IS A PLANNING TURN (enforced by the server). You may research and SAVE the campaign plan with the planning tools: research, facts, pillars, business areas, assets (reference_only), video concept, script and shots, routing. Generation, production, budget approvals, retries and wallet charges are blocked — do not offer to start them in this turn.',
  'Work on the existing campaign of this chat (get_campaign first). Never create a second campaign for the same company. Saving is repeatable: calling the same tool again replaces/updates the stored objects, it never duplicates them.',
  'After saving, call get_campaign again and report what is actually stored (counts of facts, pillars, areas, assets, videos, shots, script present, total shot seconds). Never claim something is saved that get_campaign does not show.',
  'Evidence: every product claim in scripts must be supported by a stored fact/source. No absolute promises ("no crackling", "never fails", "kein Knacken", "kein Wackeln") unless a source states exactly that; prefer cautious wording ("designed for …", "built for stable connections"). Do not mix product families unless a source links them.',
  'Model comparison: name the model manufacturer (provider field, e.g. Kuaishou, ByteDance) separately from the API provider we actually call (api_provider field, e.g. Replicate, BytePlus ModelArk). Only name models returned by get_available_video_models. Cost estimates come from route_campaign_shots / price_per_second in USD as an estimate without any approval; leave unknown prices explicitly open.',
  'Agent compute: the "agent cost" shown in the chat is the estimated language-model cost of this conversation, carried internally by the platform; it is not charged to the user wallet. Never say a turn had "no costs" — say "no wallet charge; internal agent compute only".',
].join('\n');

/** Fixed limits for one stored background planning job. */
export const PLANNING_JOB_MAX_CONTINUATIONS = 2;
export const PLANNING_JOB_MAX_COST_USD = 1.0;

export type PlanningJobVerdict =
  | { status: 'queued' }
  | { status: 'completed' }
  | { status: 'interrupted'; reason: 'continuation_limit' | 'cost_limit' | 'error' | 'no_answer' };

/**
 * Decide what happens after one background planning run. Pure: the worker
 * applies it with a lease-guarded update. Never loops past the fixed limits.
 */
export function nextPlanningJobState(j: {
  continuations: number; maxContinuations: number; costUsd: number; maxCostUsd: number;
  stepLimitHit: boolean; answered: boolean; error: string | null;
}): PlanningJobVerdict {
  if (j.error && !j.answered) return { status: 'interrupted', reason: 'error' };
  if (!j.stepLimitHit) return j.answered ? { status: 'completed' } : { status: 'interrupted', reason: 'no_answer' };
  if (j.costUsd >= j.maxCostUsd) return { status: 'interrupted', reason: 'cost_limit' };
  if (j.continuations >= j.maxContinuations) return { status: 'interrupted', reason: 'continuation_limit' };
  return { status: 'queued' };
}

export const PLANNING_JOB_INTERRUPT_TEXT: Record<string, (reason: string, done: number) => string> = {
  de: (r, d) => `Die Planung wurde nach ${d} automatischen Fortsetzungen angehalten (${r === 'cost_limit' ? 'Obergrenze für interne Agent-/Recherchekosten erreicht' : r === 'continuation_limit' ? 'Obergrenze für automatische Fortsetzungen erreicht' : 'technischer Fehler'}). Der bisherige Stand ist gespeichert; es wurde nichts produziert, freigegeben oder abgebucht.`,
  es: (r, d) => `La planificación se detuvo tras ${d} continuaciones automáticas (${r === 'cost_limit' ? 'límite de coste interno alcanzado' : r === 'continuation_limit' ? 'límite de continuaciones alcanzado' : 'error técnico'}). El progreso está guardado; no se produjo, aprobó ni cobró nada.`,
  en: (r, d) => `Planning stopped after ${d} automatic continuations (${r === 'cost_limit' ? 'internal agent/research cost cap reached' : r === 'continuation_limit' ? 'continuation cap reached' : 'technical error'}). Progress is saved; nothing was produced, approved or charged.`,
};

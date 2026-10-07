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
 * True when the message is a status/information request without a command to
 * act. Action verbs that only appear under an explicit negation ("do not
 * generate", "nichts starten") do not count as commands.
 */
export function classifyReadOnly(message: string): boolean {
  const text = String(message ?? '').trim();
  if (!text) return true;
  // Split into clauses; a clause with an action verb counts unless it is negated.
  const clauses = text.replace(/[¿¡]/g, " ").split(/[.!?;\n]+|\b(?:and|und|y|then|dann)\b/i).map((c) => c.trim()).filter(Boolean);
  for (const c of clauses) {
    if (ACTION_RE.test(c) && !NEGATED_RE.test(c) && !isPureQuestionAboutAction(c)) return false;
  }
  return true;
}

/** "What would a retry cost?", "Wie viel würde ... kosten", "¿Cuánto costaría …?" — questions, not commands. */
function isPureQuestionAboutAction(clause: string): boolean {
  return /^(what|how|which|why|when|is|are|does|would|was|wie|welche\w*|warum|wann|wäre|würde|ist|sind|gibt|qué|cómo|cuál|cuánto|por\s+qué|cuándo)\b/i.test(clause)
    && !/\b(can\s+you|could\s+you|kannst\s+du|könntest\s+du|würdest\s+du|puedes)\b/i.test(clause);
}

export type TurnMode = 'read_only' | 'normal';

export function resolveTurnMode(input: { message: string; clientReadOnly?: unknown }): TurnMode {
  if (input.clientReadOnly === true) return 'read_only';
  return classifyReadOnly(input.message) ? 'read_only' : 'normal';
}

/** Execution-time guard: in read-only mode every non-read tool is refused, whatever the model asks for. */
export function guardToolCall(mode: TurnMode, name: string): { error: string; code: 'READ_ONLY_TURN' } | null {
  if (mode !== 'read_only' || READ_ONLY_TOOLS.has(name)) return null;
  return {
    code: 'READ_ONLY_TURN',
    error: `This turn is read-only. "${name}" was blocked on the server: nothing was generated, retried, approved or charged. Answer from the data you can read; if the user wants an action, they must ask for it explicitly.`,
  };
}

export async function requestFingerprint(conversationId: string | null | undefined, message: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${conversationId ?? ''}\u0000${message}`));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export const READ_ONLY_INSTRUCTION =
  'THIS TURN IS READ-ONLY (enforced by the server). You only have reading tools. Answer the user\'s latest question directly from the data. For shot retries, report the stored retry_plan: proposed model, retry cost with currency, QA failure classes, planned changes, and whether a new approval is required (cost.requires_new_approval). Explicitly name any information that is missing. Do not offer to start anything in this turn beyond telling the user they can ask for it explicitly.';

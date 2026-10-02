/**
 * Shot QA (free for the wallet): reviews an EXISTING finished generation and
 * persists one terminal verdict. Never calls a generation provider.
 *
 * Idempotency lives in SQL: claim_shot_qa (atomic claim + lease),
 * fail_shot_qa (retryable `qa_pending`, `qa_failed` after max attempts) and
 * finalize_shot_qa (verdict + model_qa_stats in one transaction, once per generation).
 */

// deno-lint-ignore no-explicit-any
type Any = any;

export const ISSUE_CLASSES = ['anatomy', 'faces', 'hands', 'food_logic', 'physics', 'text', 'flicker', 'morphing', 'prompt_miss', 'audio'];

/** Classifies only the reported issues — never the schema/keys of the whole response. */
export function classifyIssues(issues: unknown): Record<string, number> {
  const list = Array.isArray(issues) ? issues : [];
  const counts: Record<string, number> = {};
  for (const it of list) {
    const text = JSON.stringify(it ?? '').toLowerCase();
    const add = (cls: string, ...words: string[]) => { if (words.some((w) => text.includes(w))) counts[cls] = (counts[cls] ?? 0) + 1; };
    add('hands', 'hand', 'finger');
    add('faces', 'face', 'mouth', 'teeth', 'eyes');
    add('anatomy', 'anatomy', 'limb', ' arm', ' leg');
    add('food_logic', 'food', 'coffee', 'pour', 'croissant', 'drink', 'egg', 'sauce');
    add('physics', 'physics', 'float', 'disappear', 'teleport', 'impossible');
    add('text', 'text', 'letter', 'spelling', 'typo', 'logo', 'watermark');
    add('flicker', 'flicker');
    add('morphing', 'morph', 'warp');
    add('prompt_miss', 'off-prompt', 'wrong subject', 'not show', 'missing');
    add('audio', 'audio', 'sound', 'lip-sync', 'lipsync');
  }
  return counts;
}

export interface ParsedQa { verdict: string; overall: number; scores: Record<string, number | null> | null; issues: Record<string, number>; rawIssues: unknown; clientReady: boolean }

/** agent-video-qa returns `{ analysis_available, qa: { verdict, scores, issues, ... } }`. */
export function parseQaResponse(body: Any): ParsedQa {
  const q = body?.qa ?? body?.analysis ?? body ?? {};
  const verdict = String(q.verdict ?? 'needs_work');
  const scores = q.scores && typeof q.scores === 'object' ? q.scores : null;
  const nums = scores ? Object.values(scores).filter((v): v is number => typeof v === 'number') : [];
  const overall = Number(q.overall_score ?? scores?.overall ?? (nums.length ? Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10 : 0));
  const rawIssues = q.issues ?? q.timestamped_issues ?? [];
  const issues = classifyIssues(rawIssues);
  const absurd = (issues.physics ?? 0) > 0 && /absurd|impossible|nonsensical/i.test(JSON.stringify(rawIssues));
  const humanIssues = (issues.anatomy ?? 0) + (issues.hands ?? 0) + (issues.faces ?? 0);
  const clientReady = !absurd && verdict !== 'unusable' && (verdict === 'acceptable' || verdict === 'client_ready' || (overall >= 7 && humanIssues === 0));
  return { verdict, overall, scores, issues, rawIssues, clientReady };
}

export interface QaTransport { supabaseUrl: string; jwt: string; anonKey: string; internalAuthUserId?: string | null; fetchFn?: typeof fetch }

export type ShotQaOutcome =
  | { state: 'final'; persisted: boolean; parsed: ParsedQa }
  | { state: 'qa_pending' | 'qa_failed'; error: string }
  | { state: 'not_claimed' };

/** Claims (if eligible), reviews the existing video and persists the outcome. */
export async function runShotQa(admin: Any, t: QaTransport, shotId: string): Promise<ShotQaOutcome> {
  const { data: claims } = await admin.rpc('claim_shot_qa', { _shot_id: shotId, _limit: 1 });
  const claim = claims?.[0];
  if (!claim) return { state: 'not_claimed' };
  return await reviewClaimed(admin, t, claim);
}

export async function reviewClaimed(admin: Any, t: QaTransport, claim: { shot_id: string; claim_id: string; generation_id: string }): Promise<ShotQaOutcome> {
  const { data: shot } = await admin.from('campaign_shots').select('english_prompt, description, purpose').eq('id', claim.shot_id).maybeSingle();
  const fail = async (error: string): Promise<ShotQaOutcome> => {
    // A file above the analyzer's size limits will never pass: stop retrying at once.
    const permanent = /input_too_large/.test(error);
    const { data: st } = await admin.rpc('fail_shot_qa', { _shot_id: claim.shot_id, _claim_id: claim.claim_id, _error: error, ...(permanent ? { _max_attempts: 1 } : {}) });
    console.warn('[shot-qa] retryable failure', JSON.stringify({ shot_id: claim.shot_id, error, state: st }));
    return { state: st === 'qa_failed' ? 'qa_failed' : 'qa_pending', error };
  };
  let res: Response;
  try {
    res = await (t.fetchFn ?? fetch)(`${t.supabaseUrl}/functions/v1/agent-video-qa`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${t.jwt}`, apikey: t.anonKey, 'Content-Type': 'application/json',
        ...(t.internalAuthUserId ? { 'x-agent-user-id': t.internalAuthUserId } : {}),
      },
      body: JSON.stringify({
        generation_id: claim.generation_id,
        intent: `Advertising shot for ${shot?.english_prompt ?? shot?.description ?? ''}. Purpose: ${shot?.purpose ?? ''}.`,
      }),
    });
  } catch (e) {
    return await fail(`network: ${(e as Error).message}`);
  }
  const body: Any = await res.json().catch(() => ({}));
  if (!res.ok || body?.analysis_available === false || !body?.qa) {
    return await fail(`${body?.code ?? 'QA_UNAVAILABLE'} (HTTP ${res.status})${body?.reason ? ` ${body.reason}` : ''}`);
  }
  const parsed = parseQaResponse(body);
  const { data: ok } = await admin.rpc('finalize_shot_qa', {
    _shot_id: claim.shot_id, _claim_id: claim.claim_id, _verdict: parsed.verdict, _overall: parsed.overall,
    _scores: parsed.scores, _issues: parsed.issues, _client_ready: parsed.clientReady,
    _analysis_source: body?.analysis_source === 'derived_copy' ? 'derived_copy' : 'original',
  });
  return { state: 'final', persisted: ok === true, parsed };
}

/** Background pass: QA only, bounded per run. Never generates. */
export async function reconcilePendingShotQa(admin: Any, t: QaTransport, limit = 1): Promise<number> {
  const { data: claims } = await admin.rpc('claim_shot_qa', { _shot_id: null, _limit: limit });
  let n = 0;
  for (const c of claims ?? []) {
    await reviewClaimed(admin, { ...t, internalAuthUserId: c.user_id }, c);
    n += 1;
  }
  return n;
}

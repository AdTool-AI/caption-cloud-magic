/**
 * Loop detection (shadow: recorded only). A loop is the same intent at the same
 * state fingerprint with the same next action, where the previous turn did NOT
 * fail for real — a retry after a genuine error is never a loop.
 */
export interface LoopSample { intent_hash: string | null; state_fingerprint: string | null; expected_next_action: string | null; turn_error: string | null }

export function isLoop(prev: LoopSample | null, cur: LoopSample): boolean {
  if (!prev || !cur.intent_hash) return false;
  if (prev.turn_error) return false;
  return prev.intent_hash === cur.intent_hash && prev.state_fingerprint === cur.state_fingerprint && prev.expected_next_action === cur.expected_next_action;
}

export function normalizeIntent(message: string): string {
  return message.toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

export async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

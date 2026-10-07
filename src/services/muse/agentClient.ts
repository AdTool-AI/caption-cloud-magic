/**
 * Thin transport for the AdTool Agent.
 *
 * The only platform-specific parts are the endpoint URL and the way the access
 * token is obtained — swap `resolveEndpoint`/`resolveToken` to point the same
 * UI at a self-hosted agent backend.
 */

import { supabase } from '@/integrations/supabase/client';
import type { AgentEvent } from './types';

const AGENT_PATH = '/functions/v1/muse-agent';

function resolveEndpoint(): string {
  const base = import.meta.env.VITE_SUPABASE_URL as string;
  return `${base.replace(/\/+$/, '')}${AGENT_PATH}`;
}

async function resolveToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

export interface SendAgentMessageParams {
  message: string;
  conversationId?: string | null;
  language?: string;
  /** Durable idempotency key: the server processes each (user, requestId) at most once. */
  requestId?: string;
  signal?: AbortSignal;
  onEvent: (event: AgentEvent) => void;
}

export async function sendAgentMessage(params: SendAgentMessageParams): Promise<void> {
  const token = await resolveToken();
  if (!token) {
    params.onEvent({ type: 'error', message: 'You need to be signed in.' });
    params.onEvent({ type: 'done' });
    return;
  }

  const res = await fetch(resolveEndpoint(), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: params.message,
      conversationId: params.conversationId ?? null,
      language: params.language,
      requestId: params.requestId,
    }),
    signal: params.signal,
  });

  if (!res.ok || !res.body) {
    let message = `Request failed (${res.status}).`;
    let code: string | undefined;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
      if (typeof body?.code === 'string') code = body.code;
    } catch {
      /* keep default */
    }
    params.onEvent({ type: 'error', message, code });
    params.onEvent({ type: 'done' });
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const chunks = buffer.split('\n\n');
    buffer = chunks.pop() ?? '';
    for (const chunk of chunks) {
      const line = chunk.split('\n').find((l) => l.startsWith('data: '));
      if (!line) continue;
      try {
        params.onEvent(JSON.parse(line.slice(6)) as AgentEvent);
      } catch {
        /* ignore malformed frame */
      }
    }
  }
}

/** Records the user's decision on a quoted generation (server-side, single use). */
export async function decideAgentApproval(
  approvalId: string,
  decision: 'approve' | 'reject',
): Promise<{ ok: true } | { ok: false; error: string }> {
  return postDecision(decision, approvalId);
}

/** Records the user's decision on a campaign production budget (Phase B). */
export async function decideCampaignBudgetApproval(
  approvalId: string,
  decision: 'approve' | 'reject',
): Promise<{ ok: true } | { ok: false; error: string }> {
  return postDecision(decision === 'approve' ? 'approve-campaign-budget' : 'reject-campaign-budget', approvalId);
}

async function postDecision(action: string, approvalId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const token = await resolveToken();
  if (!token) return { ok: false, error: 'You need to be signed in.' };
  const res = await fetch(resolveEndpoint(), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ action, approvalId }),
  });
  if (res.ok) return { ok: true };
  const body = await res.json().catch(() => ({}));
  return { ok: false, error: body?.error ?? `Request failed (${res.status}).` };
}

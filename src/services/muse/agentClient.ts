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
    }),
    signal: params.signal,
  });

  if (!res.ok || !res.body) {
    let message = `Request failed (${res.status}).`;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {
      /* keep default */
    }
    params.onEvent({ type: 'error', message });
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

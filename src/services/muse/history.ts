/**
 * Loads persisted agent state (the backend is the source of truth).
 * Reads go through RLS-scoped tables; nothing is kept only in the browser.
 */
import { supabase } from '@/integrations/supabase/client';
import type { AgentApprovalQuote, AgentChatMessage, AgentOperation } from './types';

// New agent tables are not in the generated types yet.
// deno-lint-ignore no-explicit-any
const db = supabase as any;

export type ApprovalState = 'pending' | 'approved' | 'rejected' | 'expired' | 'error';
export type StoredApproval = AgentApprovalQuote & { state: ApprovalState; error?: string };

export interface AgentTask {
  id: string;
  generation_id: string;
  status: 'planning' | 'awaiting_approval' | 'generating' | 'waiting_for_generation' | 'analyzing' | 'completed' | 'failed';
  error: string | null;
  slow_since: string | null;
  result: { video_url?: string | null; summary?: string | null } | null;
  created_at: string;
}

export interface ConversationSummary {
  id: string;
  title: string | null;
  updated_at: string;
}

export interface ConversationSnapshot {
  messages: AgentChatMessage[];
  operations: AgentOperation[];
  approvals: StoredApproval[];
  tasks: AgentTask[];
  costUsd: number;
}

export async function listAgentConversations(limit = 20): Promise<ConversationSummary[]> {
  const { data } = await db
    .from('agent_conversations')
    .select('id, title, updated_at')
    .order('updated_at', { ascending: false })
    .limit(limit);
  return (data ?? []) as ConversationSummary[];
}

export async function loadAgentConversation(id: string): Promise<ConversationSnapshot | null> {
  const [convo, msgs, ops, apps, tasks] = await Promise.all([
    db.from('agent_conversations').select('id, estimated_ai_cost_usd').eq('id', id).maybeSingle(),
    db.from('agent_messages').select('id, role, content, internal, created_at').eq('conversation_id', id).order('created_at'),
    db.from('agent_operations').select('id, tool_name, status, arguments, result, generation_id, created_at').eq('conversation_id', id).order('created_at'),
    db.from('agent_generation_approvals').select('*').eq('conversation_id', id).order('created_at'),
    db.from('agent_tasks').select('id, generation_id, status, error, slow_since, result, created_at').eq('conversation_id', id).order('created_at'),
  ]);
  if (!convo.data) return null;

  const now = Date.now();
  return {
    costUsd: Number(convo.data.estimated_ai_cost_usd ?? 0),
    messages: (msgs.data ?? [])
      .filter((m: { internal?: boolean; role: string }) => !m.internal && (m.role === 'user' || m.role === 'assistant'))
      .map((m: { id: string; role: 'user' | 'assistant'; content: string }) => ({ id: m.id, role: m.role, text: m.content })),
    operations: (ops.data ?? []).map((o: Record<string, unknown>) => ({
      id: String(o.id),
      name: String(o.tool_name),
      status: o.status === 'running' ? 'running' : o.status === 'failed' ? 'failed' : 'succeeded',
      arguments: o.arguments,
      result: o.result,
      generationId: (o.generation_id as string) ?? undefined,
    })),
    approvals: (apps.data ?? []).map((a: Record<string, unknown>) => {
      const status = String(a.status);
      const expired = status === 'pending' && new Date(String(a.expires_at)).getTime() < now;
      const state: ApprovalState =
        expired ? 'expired'
        : status === 'pending' ? 'pending'
        : status === 'approved' || status === 'consumed' ? 'approved'
        : status === 'rejected' ? 'rejected'
        : 'expired';
      return {
        approval_id: String(a.id),
        model: String(a.model),
        duration: Number(a.duration_seconds),
        resolution: String(a.resolution),
        total_cost: Number(a.cost),
        max_total_cost: Number(a.max_total_cost ?? a.cost),
        retry_budget: Number(a.retry_budget ?? 0),
        currency: String(a.currency),
        approval_expires_at: String(a.expires_at),
        state,
      } satisfies StoredApproval;
    }),
    tasks: (tasks.data ?? []) as AgentTask[],
  };
}

/** Realtime subscription for one conversation (messages + tasks). */
export function subscribeAgentConversation(id: string, onChange: () => void): () => void {
  const channel = supabase
    .channel(`agent-convo-${id}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'agent_tasks', filter: `conversation_id=eq.${id}` }, onChange)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'agent_messages', filter: `conversation_id=eq.${id}` }, onChange)
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}

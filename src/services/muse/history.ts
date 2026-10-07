/**
 * Loads persisted agent state (the backend is the source of truth).
 * Reads go through RLS-scoped tables; nothing is kept only in the browser.
 */
import { supabase } from '@/integrations/supabase/client';
import type { AgentApprovalQuote, AgentChatMessage, AgentOperation, CampaignBudgetQuote } from './types';

// New agent tables are not in the generated types yet.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export type ApprovalState = 'pending' | 'approved' | 'rejected' | 'expired' | 'error';
export type StoredApproval = AgentApprovalQuote & { state: ApprovalState; error?: string; created_at?: string };
export type StoredCampaignApproval = CampaignBudgetQuote & { state: ApprovalState; error?: string; created_at?: string };

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
  campaignApprovals: StoredCampaignApproval[];
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
  const [convo, msgs, ops, apps, tasks, cApps] = await Promise.all([
    db.from('agent_conversations').select('id, estimated_ai_cost_usd').eq('id', id).maybeSingle(),
    db.from('agent_messages').select('id, role, content, internal, tool_calls, created_at').eq('conversation_id', id).order('created_at'),
    db.from('agent_operations').select('id, tool_name, status, arguments, result, generation_id, created_at').eq('conversation_id', id).order('created_at'),
    db.from('agent_generation_approvals').select('*').eq('conversation_id', id).order('created_at'),
    db.from('agent_tasks').select('id, generation_id, status, error, slow_since, result, created_at').eq('conversation_id', id).order('created_at'),
    db.from('campaign_budget_approvals').select('*').eq('conversation_id', id).order('created_at'),
  ]);
  if (!convo.data) return null;

  const now = Date.now();
  return {
    costUsd: Number(convo.data.estimated_ai_cost_usd ?? 0),
    messages: (msgs.data ?? [])
      .filter((m: { internal?: boolean; role: string }) => !m.internal && (m.role === 'user' || m.role === 'assistant'))
      .map((m: { id: string; role: 'user' | 'assistant'; content: string; created_at: string; tool_calls?: { turn_status?: string; error?: string } | null }) => ({
        id: m.id,
        role: m.role,
        text: m.content,
        createdAt: m.created_at,
        ...(m.tool_calls?.turn_status === 'interrupted' ? { status: 'interrupted' as const, error: m.tool_calls.error } : {}),
      })),
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
        created_at: String(a.created_at),
        state,
      } satisfies StoredApproval;
    }),
    tasks: (tasks.data ?? []) as AgentTask[],
    campaignApprovals: (cApps.data ?? []).map((a: Record<string, unknown>) => {
      const status = String(a.status);
      const expired = status === 'pending' && new Date(String(a.start_expires_at)).getTime() < now;
      const state: ApprovalState =
        expired ? 'expired'
        : status === 'pending' ? 'pending'
        : status === 'approved' || status === 'started' ? 'approved'
        : status === 'rejected' ? 'rejected'
        : 'expired';
      return {
        approval_id: String(a.id),
        campaign_id: String(a.campaign_id),
        shots: (a.scope as CampaignBudgetQuote['shots']) ?? [],
        estimated_total: Number(a.estimated_total),
        max_total: Number(a.max_total),
        retry_budget_per_shot: Number(a.retry_budget_per_shot ?? 0),
        retry_mode: (a.retry_mode as CampaignBudgetQuote['retry_mode']) ?? 'manual_retry',
        currency: '',
        start_expires_at: String(a.start_expires_at),
        execution_expires_at: String(a.execution_expires_at),
        created_at: String(a.created_at),
        state,
        kind: a.kind === 'retry' ? 'retry' : 'production',
        ...(a.kind === 'retry' && a.retry_binding ? (() => {
          const b = a.retry_binding as { shot_id: string; attempt_no: number; request?: Record<string, unknown> };
          const r = b.request ?? {};
          return { retry: { shot_id: String(b.shot_id), attempt_no: Number(b.attempt_no), model: String(r.model ?? ''), provider: String(r.provider ?? ''), duration_s: Number(r.duration_s ?? 0), resolution: String(r.resolution ?? ''), mode: String(r.mode ?? '') } };
        })() : {}),
      } satisfies StoredCampaignApproval;
    }),
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

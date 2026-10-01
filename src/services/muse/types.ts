/**
 * Shared agent types. Transport-agnostic so the UI keeps working when the
 * agent backend moves off Lovable.
 */

export type AgentEvent =
  | { type: 'conversation'; conversationId: string }
  | { type: 'tool_started'; name: string; arguments: unknown }
  | { type: 'tool_result'; name: string; result: unknown; generationId?: string }
  | { type: 'approval_required'; approval: AgentApprovalQuote }
  | { type: 'message'; text: string }
  | { type: 'usage'; inputTokens: number; outputTokens: number; costUsd: number }
  | { type: 'error'; message: string; code?: string }
  | { type: 'done' };

export interface AgentChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
}

export interface AgentOperation {
  id: string;
  name: string;
  status: 'running' | 'succeeded' | 'failed';
  arguments?: unknown;
  result?: unknown;
  generationId?: string;
}

export interface AgentApprovalQuote {
  approval_id: string;
  model: string;
  model_name?: string;
  duration: number;
  resolution: string;
  total_cost: number;
  max_total_cost: number;
  retry_budget: number;
  currency: string;
  sufficient_credits?: boolean;
  approval_expires_at?: string;
}

/** Phase B: one budget approval for a whole campaign production run. */
export interface CampaignBudgetQuote {
  approval_id: string;
  campaign_id: string;
  shots: Array<{ shot_id: string; model: string; duration_s: number; resolution: string; price: number }>;
  estimated_total: number;
  max_total: number;
  retry_budget_per_shot: number;
  retry_mode: 'manual_retry' | 'auto_retry_within_budget';
  currency: string;
  sufficient_credits?: boolean;
  start_expires_at?: string;
  execution_expires_at?: string;
}

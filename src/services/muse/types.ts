/**
 * Shared agent types. Transport-agnostic so the UI keeps working when the
 * agent backend moves off Lovable.
 */

export type AgentEvent =
  | { type: 'conversation'; conversationId: string }
  | { type: 'tool_started'; name: string; arguments: unknown }
  | { type: 'tool_result'; name: string; result: unknown; generationId?: string }
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

/**
 * Meta Model API client — Responses API (`POST {baseUrl}/responses`).
 *
 * Pure fetch, no runtime-specific dependencies, so this module moves to any
 * Node/Deno backend unchanged.
 */

import type { MuseConfig } from './config.ts';

export interface MuseFunctionTool {
  type: 'function';
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export type MuseInputItem =
  | { role: 'user' | 'assistant' | 'system'; content: string }
  | { type: 'function_call_output'; call_id: string; output: string };

export interface MuseToolCall {
  id?: string;
  call_id: string;
  name: string;
  arguments: string;
}

export interface MuseResponse {
  id: string;
  status: string;
  outputText: string;
  toolCalls: MuseToolCall[];
  usage: { input: number; output: number; total: number };
  raw: unknown;
}

export class MuseApiError extends Error {
  constructor(public status: number, public body: string) {
    super(`Meta Model API error ${status}: ${body.slice(0, 500)}`);
    this.name = 'MuseApiError';
  }
}

export async function createMuseResponse(
  config: MuseConfig,
  params: {
    input: MuseInputItem[];
    instructions?: string;
    tools?: MuseFunctionTool[];
    previousResponseId?: string | null;
    signal?: AbortSignal;
  },
): Promise<MuseResponse> {
  const body: Record<string, unknown> = {
    model: config.model,
    input: params.input,
    store: true,
  };
  if (params.instructions) body.instructions = params.instructions;
  if (params.tools?.length) {
    body.tools = params.tools;
    body.tool_choice = 'auto';
  }
  if (params.previousResponseId) body.previous_response_id = params.previousResponseId;

  const res = await fetch(`${config.baseUrl}/responses`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: params.signal,
  });

  const text = await res.text();
  if (!res.ok) throw new MuseApiError(res.status, text);

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new MuseApiError(res.status, `Unparsable response body: ${text.slice(0, 300)}`);
  }

  return normalizeResponse(parsed);
}

// deno-lint-ignore no-explicit-any
function normalizeResponse(parsed: any): MuseResponse {
  const output: any[] = Array.isArray(parsed.output) ? parsed.output : [];
  const textParts: string[] = [];
  const toolCalls: MuseToolCall[] = [];

  for (const item of output) {
    if (item?.type === 'message' && Array.isArray(item.content)) {
      for (const part of item.content) {
        if (part?.type === 'output_text' && typeof part.text === 'string') {
          textParts.push(part.text);
        }
      }
    }
  
    if (item?.type === 'function_call') {
      toolCalls.push({
        id: item.id,
        call_id: item.call_id ?? item.id,
        name: item.name,
        arguments: typeof item.arguments === 'string' ? item.arguments : JSON.stringify(item.arguments ?? {}),
      });
    }
  }

  const usage = parsed.usage ?? {};
  return {
    id: String(parsed.id ?? ''),
    status: String(parsed.status ?? 'completed'),
    outputText: outputText.trim(),
    toolCalls,
    usage: {
      input: Number(usage.input_tokens ?? 0),
      output: Number(usage.output_tokens ?? 0),
      total: Number(usage.total_tokens ?? 0),
    },
    raw: parsed,
  };
}

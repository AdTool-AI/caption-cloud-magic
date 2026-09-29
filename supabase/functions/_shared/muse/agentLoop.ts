/**
 * The bounded agent loop: Muse reasons, calls tools, reads results, and
 * answers. Persistence uses plain SQL tables (`agent_conversations`,
 * `agent_messages`, `agent_operations`) so the loop can be lifted to any
 * backend that talks to the same schema.
 */

import { createMuseResponse, type MuseInputItem } from './museClient.ts';
import { MUSE_TOOL_DEFINITIONS, MUSE_PAID_TOOLS } from './tools.ts';
import { buildSystemPrompt } from './systemPrompt.ts';
import { executeMuseTool, type ToolContext } from './toolRuntime.ts';
import { estimateMuseCostUsd, type MuseConfig } from './config.ts';

export type AgentEvent =
  | { type: 'conversation'; conversationId: string }
  | { type: 'tool_started'; name: string; arguments: unknown }
  | { type: 'tool_result'; name: string; result: unknown; generationId?: string }
  | { type: 'approval_required'; approval: Record<string, unknown> }
  | { type: 'message'; text: string }
  | { type: 'usage'; inputTokens: number; outputTokens: number; costUsd: number }
  | { type: 'error'; message: string; code?: string }
  | { type: 'done' };

export interface RunAgentParams {
  // deno-lint-ignore no-explicit-any
  admin: any;
  config: MuseConfig;
  userId: string;
  userJwt: string;
  supabaseUrl: string;
  anonKey: string;
  conversationId?: string | null;
  message: string;
  language?: string;
  emit: (event: AgentEvent) => void;
}

export async function runAgentTurn(params: RunAgentParams): Promise<void> {
  const { admin, config, userId, emit } = params;

  // ---- conversation record -------------------------------------------------
  let conversationId = params.conversationId ?? null;
  let previousResponseId: string | null = null;
  let regenerationsUsed = 0;

  if (conversationId) {
    const { data } = await admin
      .from('agent_conversations')
      .select('id, last_response_id')
      .eq('id', conversationId)
      .eq('user_id', userId)
      .maybeSingle();
    if (!data) {
      emit({ type: 'error', message: 'Conversation not found.', code: 'NOT_FOUND' });
      return;
    }
    previousResponseId = data.last_response_id ?? null;
    const { count } = await admin
      .from('agent_operations')
      .select('id', { count: 'exact', head: true })
      .eq('conversation_id', conversationId)
      .eq('tool_name', 'regenerate_video')
      .eq('status', 'succeeded');
    regenerationsUsed = count ?? 0;
  } else {
    const { data, error } = await admin
      .from('agent_conversations')
      .insert({
        user_id: userId,
        model: config.model,
        title: params.message.slice(0, 80),
      })
      .select('id')
      .single();
    if (error || !data) {
      emit({ type: 'error', message: 'Could not start a conversation.', code: 'DB_ERROR' });
      return;
    }
    conversationId = data.id;
  }

  emit({ type: 'conversation', conversationId: conversationId! });

  await admin.from('agent_messages').insert({
    conversation_id: conversationId,
    user_id: userId,
    role: 'user',
    content: params.message,
  });

  // ---- loop ----------------------------------------------------------------
  const ctx: ToolContext = {
    userId,
    conversationId: conversationId!,
    admin,
    userJwt: params.userJwt,
    supabaseUrl: params.supabaseUrl,
    anonKey: params.anonKey,
    museConfig: config,
    regenerationsUsed,
    maxRegenerations: config.maxRegenerations,
    maxTurnSpend: config.maxTurnSpend,
    spentThisTurn: 0,
  };

  let input: MuseInputItem[] = [{ role: 'user', content: params.message }];
  let totalIn = 0;
  let totalOut = 0;
  const generationIds: string[] = [];
  let finalText = '';

  for (let iteration = 0; iteration < config.maxToolIterations; iteration++) {
    let response;
    try {
      response = await createMuseResponse(config, {
        input,
        instructions: buildSystemPrompt({ language: params.language }),
        tools: MUSE_TOOL_DEFINITIONS,
        previousResponseId,
      });
    } catch (err) {
      emit({ type: 'error', message: err instanceof Error ? err.message : 'Muse request failed.' });
      break;
    }

    totalIn += response.usage.input;
    totalOut += response.usage.output;
    previousResponseId = response.id;

    if (response.outputText) {
      finalText = response.outputText;
      emit({ type: 'message', text: response.outputText });
    }

    if (response.toolCalls.length === 0) break;

    input = [];
    for (const call of response.toolCalls) {
      // deno-lint-ignore no-explicit-any
      let args: any = {};
      try {
        args = call.arguments ? JSON.parse(call.arguments) : {};
      } catch {
        args = {};
      }
      emit({ type: 'tool_started', name: call.name, arguments: args });

      const { data: opRow } = await admin
        .from('agent_operations')
        .insert({
          conversation_id: conversationId,
          user_id: userId,
          tool_name: call.name,
          arguments: args,
          status: 'running',
          attempt: call.name === 'regenerate_video' ? ctx.regenerationsUsed + 1 : 1,
        })
        .select('id')
        .single();

      let result;
      try {
        result = await executeMuseTool(ctx, call.name, args);
      } catch (err) {
        result = { output: { error: err instanceof Error ? err.message : 'Tool failed.', code: 'TOOL_ERROR' } };
      }

      const failed = !!(result.output && typeof result.output === 'object' && 'error' in result.output);

      if (!failed && MUSE_PAID_TOOLS.has(call.name)) {
        ctx.spentThisTurn += result.estimatedCost ?? 0;
        if (call.name === 'regenerate_video') ctx.regenerationsUsed += 1;
      }
      if (result.generationId) generationIds.push(result.generationId);

      if (opRow?.id) {
        await admin
          .from('agent_operations')
          .update({
            status: failed ? 'failed' : 'succeeded',
            result: result.output,
            error_message: failed ? String((result.output as Record<string, unknown>).error ?? '') : null,
            generation_id: result.generationId ?? null,
            estimated_cost: result.estimatedCost ?? null,
            estimated_cost_currency: result.estimatedCostCurrency ?? null,
          })
          .eq('id', opRow.id);
      }

      emit({ type: 'tool_result', name: call.name, result: result.output, generationId: result.generationId });
      if (call.name === 'estimate_video_cost' && result.output?.approval_required) {
        emit({ type: 'approval_required', approval: result.output });
      }

      input.push({
        type: 'function_call_output',
        call_id: call.call_id,
        output: JSON.stringify(result.output),
      });
    }
  }

  // ---- persist turn --------------------------------------------------------
  const costUsd = estimateMuseCostUsd(totalIn, totalOut);

  if (finalText) {
    await admin.from('agent_messages').insert({
      conversation_id: conversationId,
      user_id: userId,
      role: 'assistant',
      content: finalText,
      response_id: previousResponseId,
    });
  }

  const { data: convo } = await admin
    .from('agent_conversations')
    .select('last_response_id, total_input_tokens, total_output_tokens, estimated_ai_cost_usd, generation_ids')
    .eq('id', conversationId)
    .maybeSingle();

  await admin
    .from('agent_conversations')
    .update({
      last_response_id: previousResponseId,
      previous_response_id: convo ? convo.last_response_id ?? null : null,
      model: config.model,
      total_input_tokens: Number(convo?.total_input_tokens ?? 0) + totalIn,
      total_output_tokens: Number(convo?.total_output_tokens ?? 0) + totalOut,
      estimated_ai_cost_usd: Number(convo?.estimated_ai_cost_usd ?? 0) + costUsd,
      generation_ids: Array.from(new Set([...(convo?.generation_ids ?? []), ...generationIds])),
    })
    .eq('id', conversationId);

  emit({ type: 'usage', inputTokens: totalIn, outputTokens: totalOut, costUsd });
  emit({ type: 'done' });
}

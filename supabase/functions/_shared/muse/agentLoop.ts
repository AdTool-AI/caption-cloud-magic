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
import { CLARIFY_CONTINUATION_INSTRUCTION, guardToolCall, PLANNING_INSTRUCTION, READ_ONLY_INSTRUCTION, toolAllowedInMode, type TurnMode } from './turnPolicy.ts';

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
  /** Test-only: simulate a Meta failure right after the first tool batch. */
  faultInjectAfterTools?: boolean;
  /** Background resume: the message is an internal instruction, hidden from the chat. */
  internal?: boolean;
  /** Hard server-side tool allow-list (definitions AND execution). */
  allowedTools?: Set<string>;
  /** Links the assistant reply to an agent_tasks row (unique → never duplicated). */
  resumeTaskId?: string;
  /** Background resume authenticates internal calls for this user with the service key. */
  internalAuthUserId?: string;
  /** Test-only (admin-gated by caller): rename the first tool call Muse makes, to exercise the allow-list. */
  testRewriteFirstToolCallTo?: string;
  /** Server-decided turn mode. read_only = only reading tools exist and execute. */
  mode?: TurnMode;
  /** Server decided this continuation has no clear context: ask instead of acting. */
  needsClarification?: boolean;
  /** Test-only (admin-gated by caller): fail before the first model call — no Muse, no provider. */
  faultInjectBeforeModel?: boolean;
}

interface PendingOutput {
  call_id: string;
  output: string;
}

function log(stage: string, data: Record<string, unknown>) {
  console.log(`[muse-recovery] ${stage}`, JSON.stringify(data));
}

export async function runAgentTurn(params: RunAgentParams): Promise<void> {
  const { admin, config, userId, emit } = params;

  // ---- conversation record -------------------------------------------------
  let conversationId = params.conversationId ?? null;
  let previousResponseId: string | null = null;
  let regenerationsUsed = 0;
  let recoveredOutputs: PendingOutput[] = [];

  if (conversationId) {
    const { data } = await admin
      .from('agent_conversations')
      .select('id, last_response_id, pending_tool_outputs, pending_response_id')
      .eq('id', conversationId)
      .eq('user_id', userId)
      .maybeSingle();
    if (!data) {
      emit({ type: 'error', message: 'Conversation not found.', code: 'NOT_FOUND' });
      return;
    }
    previousResponseId = data.last_response_id ?? null;
    const pending = Array.isArray(data.pending_tool_outputs) ? data.pending_tool_outputs as PendingOutput[] : [];
    if (pending.length > 0 && data.pending_response_id) {
      // Tools already ran; only their outputs were never acknowledged by Meta.
      // Replay the stored outputs against the response that requested them —
      // never re-execute the tools.
      const seen = new Set<string>();
      recoveredOutputs = pending.filter((p) => p?.call_id && !seen.has(p.call_id) && seen.add(p.call_id));
      previousResponseId = data.pending_response_id;
      log('resuming_pending_outputs', { conversationId, responseId: previousResponseId, callIds: recoveredOutputs.map((p) => p.call_id) });
    }
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
    internal: !!params.internal,
    resume_task_id: params.resumeTaskId ?? null,
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
    internalAuthUserId: params.internalAuthUserId,
    turnMode: params.mode ?? 'normal',
  };
  const mode: TurnMode = params.mode ?? 'normal';
  const toolDefs = MUSE_TOOL_DEFINITIONS
    .filter((t) => !params.allowedTools || params.allowedTools.has(t.name))
    .filter((t) => toolAllowedInMode(mode, t.name));
  const modeInstruction = mode === 'read_only'
    ? `\n\n${READ_ONLY_INSTRUCTION}${params.needsClarification ? `\n${CLARIFY_CONTINUATION_INSTRUCTION}` : ''}`
    : mode === 'planning' ? `\n\n${PLANNING_INSTRUCTION}` : '';
  const instructions = buildSystemPrompt({ language: params.language }) + modeInstruction;
  if (mode !== 'normal') log(`${mode}_turn`, { conversationId, tools: toolDefs.map((t) => t.name) });

  let input: MuseInputItem[] = [
    ...recoveredOutputs.map((p) => ({ type: 'function_call_output' as const, call_id: p.call_id, output: p.output })),
    { role: 'user', content: params.message },
  ];
  let totalIn = 0;
  let totalOut = 0;
  const generationIds: string[] = [];
  let finalText = '';
  let pendingOutputs = false;
  let hasUndelivered = recoveredOutputs.length > 0;
  let faultPending = !!params.faultInjectAfterTools;
  let toolBatches = 0;
  let turnError: string | null = null;

  const persistPending = async (items: MuseInputItem[], responseId: string | null) => {
    const outputs: PendingOutput[] = [];
    const seen = new Set<string>();
    for (const it of items) {
      // deno-lint-ignore no-explicit-any
      const i = it as any;
      if (i.type === 'function_call_output' && !seen.has(i.call_id)) {
        seen.add(i.call_id);
        outputs.push({ call_id: i.call_id, output: i.output });
      }
    }
    // Full replacement (not append) keeps this idempotent across repeated failures.
    await admin
      .from('agent_conversations')
      .update({ pending_tool_outputs: outputs, pending_response_id: responseId, last_response_id: responseId })
      .eq('id', conversationId);
    log('output_pending_delivery', { conversationId, responseId, callIds: outputs.map((o) => o.call_id) });
  };

  const clearPending = async (deliveredVia: string) => {
    await admin
      .from('agent_conversations')
      .update({ pending_tool_outputs: [], pending_response_id: null })
      .eq('id', conversationId);
    log('output_delivered', { conversationId, acceptedBy: deliveredVia });
    hasUndelivered = false;
  };

  for (let iteration = 0; iteration < config.maxToolIterations; iteration++) {
    let response;
    try {
      if (params.faultInjectBeforeModel && iteration === 0) {
        throw new Error('Simulated agent failure before the model call (test fault injection). Nothing was started.');
      }
      if (faultPending && (toolBatches > 0 || recoveredOutputs.length > 0)) {
        faultPending = false;
        throw new Error('Simulated Meta Model API error 503 (fault injection).');
      }
      response = await createMuseResponse(config, {
        input,
        instructions,
        tools: toolDefs,
        previousResponseId,
      });
    } catch (err) {
      if (hasUndelivered) log('meta_failed_will_resume', { conversationId, responseId: previousResponseId, error: err instanceof Error ? err.message : String(err) });
      turnError = err instanceof Error ? err.message : 'Muse request failed.';
      emit({ type: 'error', message: turnError });
      break;
    }

    totalIn += response.usage.input;
    totalOut += response.usage.output;
    previousResponseId = response.id;
    if (hasUndelivered) await clearPending(response.id);

    if (response.outputText) {
      finalText = response.outputText;
      emit({ type: 'message', text: response.outputText });
    }

    if (response.toolCalls.length === 0) break;
    if (params.testRewriteFirstToolCallTo && toolBatches === 0) {
      response.toolCalls[0] = { ...response.toolCalls[0], name: params.testRewriteFirstToolCallTo };
      log('test_rewrite_tool_call', { conversationId, to: params.testRewriteFirstToolCallTo });
    }

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
        const blocked = guardToolCall(params.mode ?? 'normal', call.name);
        if (blocked) {
          result = { output: blocked };
          log('read_only_blocked', { conversationId, tool: call.name });
        } else if (params.allowedTools && !params.allowedTools.has(call.name)) {
          result = { output: { error: `Tool "${call.name}" is not available in a background turn. Paid generation needs a new user approval in the foreground.`, code: 'TOOL_NOT_ALLOWED' } };
        } else {
          result = await executeMuseTool(ctx, call.name, args);
        }
      } catch (err) {
        result = { output: { error: err instanceof Error ? err.message : 'Tool failed.', code: 'TOOL_ERROR' } };
      }

      const failed = !!(result.output && typeof result.output === 'object' && 'error' in result.output);

      if (!failed && MUSE_PAID_TOOLS.has(call.name)) {
        ctx.spentThisTurn += result.estimatedCost ?? 0;
        if (call.name === 'regenerate_video') ctx.regenerationsUsed += 1;
      }
      if (result.generationId) generationIds.push(result.generationId);

      // Durable async task: the agent resumes this conversation once the render finishes.
      if (!failed && MUSE_PAID_TOOLS.has(call.name) && result.generationId) {
        const { error: taskErr } = await admin.from('agent_tasks').upsert(
          {
            conversation_id: conversationId,
            user_id: userId,
            generation_id: result.generationId,
            approval_id: (result.output as Record<string, unknown>)?.approval_id ?? null,
            status: 'waiting_for_generation',
            language: params.language ?? null,
            intent: String(args?.prompt ?? params.message).slice(0, 2000),
          },
          { onConflict: 'generation_id', ignoreDuplicates: true },
        );
        if (taskErr) console.error('[muse-task] could not persist task', taskErr.message);
      }

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
      if ((call.name === 'estimate_campaign_budget' || call.name === 'request_retry_approval') && result.output?.campaign_approval_required) {
        emit({ type: 'approval_required', approval: { ...result.output, kind: 'campaign_budget' } });
      }

      input.push({
        type: 'function_call_output',
        call_id: call.call_id,
        output: JSON.stringify(result.output),
      });
    }
    toolBatches += 1;
    log('tools_executed', { conversationId, responseId: previousResponseId, count: input.length });
    await persistPending(input, previousResponseId);
    hasUndelivered = true;
    if (iteration === config.maxToolIterations - 1) pendingOutputs = true;
  }

  // Iteration cap hit with tool outputs not yet delivered: close the pending
  // function calls (no further tools) so the next turn can continue the chain.
  if (pendingOutputs && input.length > 0) {
    try {
      const closing = await createMuseResponse(config, {
        input: [
          ...input,
          { role: 'user', content: 'Tool step limit for this turn reached. Summarize the current state briefly; the user can continue in the next message.' },
        ],
        instructions,
        previousResponseId,
      });
      totalIn += closing.usage.input;
      totalOut += closing.usage.output;
      previousResponseId = closing.id;
      await clearPending(closing.id);
      if (closing.outputText) {
        finalText = closing.outputText;
        emit({ type: 'message', text: closing.outputText });
      }
    } catch (err) {
      log('meta_failed_will_resume', { conversationId, responseId: previousResponseId, error: err instanceof Error ? err.message : String(err) });
      turnError = err instanceof Error ? err.message : 'Muse request failed.';
      emit({ type: 'error', message: turnError });
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
      resume_task_id: params.resumeTaskId ?? null,
    });
  } else if (!params.internal) {
    // Every processed user request gets a persisted, visible outcome. No
    // fabricated answer: an explicit "interrupted" status the UI renders with
    // a recovery action, so a reload never shows an unanswered question.
    await admin.from('agent_messages').insert({
      conversation_id: conversationId,
      user_id: userId,
      role: 'assistant',
      content: 'The agent could not finish answering this request.',
      tool_calls: { turn_status: 'interrupted', error: (turnError ?? 'No answer was produced.').slice(0, 500) },
      response_id: previousResponseId,
      resume_task_id: params.resumeTaskId ?? null,
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

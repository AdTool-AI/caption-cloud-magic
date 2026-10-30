/**
 * The bounded agent loop: Muse reasons, calls tools, reads results, and
 * answers. Persistence uses plain SQL tables (`agent_conversations`,
 * `agent_messages`, `agent_operations`) so the loop can be lifted to any
 * backend that talks to the same schema.
 */

import { observeShadowTurn, runShadowSafely } from './workflow/shadow.ts';
import { supabaseStore } from './workflow/repo.ts';
import type { ObservedCall } from './workflow/compare.ts';
import { getVideoWorkspaceState } from './state/workspaceState.ts';
import { createMuseResponse, type MuseInputItem } from './museClient.ts';
import { MUSE_TOOL_DEFINITIONS, MUSE_PAID_TOOLS } from './tools.ts';
import { buildSystemPrompt } from './systemPrompt.ts';
import { executeMuseTool, type ToolContext } from './toolRuntime.ts';
import { estimateMuseCostUsd, type MuseConfig } from './config.ts';
import { CLARIFY_CONTINUATION_INSTRUCTION, guardToolCall, PLANNING_INSTRUCTION, PLANNING_MAX_TOOL_ITERATIONS, PLANNING_MAX_AUTO_CONTINUES, PLANNING_CONTINUE_INPUT, asksToContinue, PLANNING_JOB_MAX_CONTINUATIONS, PLANNING_JOB_MAX_COST_USD, READ_ONLY_INSTRUCTION, toolAllowedInMode, ANTI_LOOP_INSTRUCTION, ANTI_LOOP_BLOCK_TEXT, deferredToNextTurn, type TurnMode } from './turnPolicy.ts';

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
  /** Server: the user requested this explicit action again / after a deferral — never defer again. */
  repeatedIntent?: boolean;
  /** Set when this turn is a stored background planning job (no further job is queued from it). */
  planningJobId?: string;
  /** Test-only (admin-gated by caller): fail before the first model call — no Muse, no provider. */
  faultInjectBeforeModel?: boolean;
  /** Elapsed-time budget for planning turns (ms); stops cleanly below the platform hard timeout. */
  timeBudgetMs?: number;
  /** Client request id (idempotency key); used only to tag shadow observations. */
  requestId?: string | null;
  /** Test seams: clock, model call and tool execution (production uses the real ones). */
  now?: () => number;
  museRespond?: typeof createMuseResponse;
  executeTool?: typeof executeMuseTool;
}

/** Planning turns stop at ~4.5 min, well below the Edge Function wall-clock limit. */
export const PLANNING_TURN_TIME_BUDGET_MS = 270_000;

interface PendingOutput {
  call_id: string;
  output: string;
}

function log(stage: string, data: Record<string, unknown>) {
  console.log(`[muse-recovery] ${stage}`, JSON.stringify(data));
}

export interface AgentTurnOutcome { conversationId: string | null; stepLimitHit: boolean; timeLimitHit?: boolean; costUsd: number; answered: boolean; error: string | null }

export async function runAgentTurn(params: RunAgentParams): Promise<AgentTurnOutcome> {
  const { admin, config, userId, emit } = params;
  const now = params.now ?? Date.now;
  const startedAt = now();
  const museRespond = params.museRespond ?? createMuseResponse;
  const runTool = params.executeTool ?? executeMuseTool;
  const timeBudgetMs = params.timeBudgetMs ?? PLANNING_TURN_TIME_BUDGET_MS;
  const completedTools: string[] = [];
  const observedCalls: ObservedCall[] = [];
  let modelCalls = 0;
  let timeLimitHit = false;

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
      return { conversationId, stepLimitHit: false, costUsd: 0, answered: false, error: 'NOT_FOUND' };
    }
    // Cost control: each turn starts a fresh provider chain (no re-billing of the
    // whole conversation); a compact recent-history digest is sent instead.
    previousResponseId = null;
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
      return { conversationId: null, stepLimitHit: false, costUsd: 0, answered: false, error: 'DB_ERROR' };
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
    : mode === 'planning' ? `\n\n${PLANNING_INSTRUCTION}`
    : params.repeatedIntent ? `\n\n${ANTI_LOOP_INSTRUCTION}` : '';
  const instructions = buildSystemPrompt({ language: params.language }) + modeInstruction;
  if (mode !== 'normal') log(`${mode}_turn`, { conversationId, tools: toolDefs.map((t) => t.name) });

  const digest = recoveredOutputs.length === 0 && params.conversationId
    ? await loadRecentDigest(admin, conversationId!, userId)
    : '';
  let input: MuseInputItem[] = [
    ...(digest ? [{ role: 'user' as const, content: digest }] : []),
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

  // Planning jobs finish in one authorized turn (no repeated "weiter"), with a hard step cap.
  const maxIterations = mode === 'planning' ? Math.max(config.maxToolIterations, PLANNING_MAX_TOOL_ITERATIONS) : config.maxToolIterations;
  let stepLimitHit = false;
  let autoContinues = 0;
  for (let iteration = 0; iteration < maxIterations; iteration++) {
    let response;
    // Planning time budget: stop cleanly before the platform kills the worker.
    // Tool outputs of the last batch stay in pending_tool_outputs for the continuation.
    if (mode === 'planning' && toolBatches > 0 && now() - startedAt >= timeBudgetMs) {
      timeLimitHit = true;
      log('planning_time_budget_reached', { conversationId, elapsedMs: now() - startedAt, toolBatches });
      break;
    }
    try {
      if (params.faultInjectBeforeModel && iteration === 0) {
        throw new Error('Simulated agent failure before the model call (test fault injection). Nothing was started.');
      }
      if (faultPending && (toolBatches > 0 || recoveredOutputs.length > 0)) {
        faultPending = false;
        throw new Error('Simulated Meta Model API error 503 (fault injection).');
      }
      response = await museRespond(config, {
        input,
        instructions,
        tools: toolDefs,
        previousResponseId,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // The provider forgot the response the stored outputs belong to — replay can
      // never succeed. Drop the stale outputs (tools are never re-run) and answer
      // this turn on a fresh chain with the recent-history digest instead.
      if (iteration === 0 && recoveredOutputs.length > 0 && /referenced response not found or expired/i.test(msg)) {
        log('pending_outputs_expired', { conversationId, responseId: previousResponseId, callIds: recoveredOutputs.map((p) => p.call_id) });
        await clearPending('expired');
        recoveredOutputs = [];
        previousResponseId = null;
        const fresh = await loadRecentDigest(admin, conversationId!, userId);
        input = [...(fresh ? [{ role: 'user' as const, content: fresh }] : []), { role: 'user', content: params.message }];
        iteration = -1;
        continue;
      }
      if (hasUndelivered) log('meta_failed_will_resume', { conversationId, responseId: previousResponseId, error: msg });
      turnError = err instanceof Error ? err.message : 'Muse request failed.';
      emit({ type: 'error', message: turnError });
      break;
    }

    totalIn += response.usage.input;
    totalOut += response.usage.output;
    modelCalls += 1;
    void recordModelCall(admin, { conversationId: conversationId!, userId, mode, internal: !!params.internal, step: iteration, chained: !!previousResponseId, usage: response.usage });
    previousResponseId = response.id;
    if (hasUndelivered) await clearPending(response.id);

    if (response.outputText) {
      finalText = response.outputText;
      emit({ type: 'message', text: response.outputText });
    }

    if (response.toolCalls.length === 0) {
      // Planning job: never hand the job back with "say weiter" while steps remain.
      if (mode === 'planning' && autoContinues < PLANNING_MAX_AUTO_CONTINUES && iteration < maxIterations - 1 && asksToContinue(response.outputText ?? '')) {
        autoContinues += 1;
        log('planning_auto_continue', { conversationId, autoContinues });
        input = [{ role: 'user', content: PLANNING_CONTINUE_INPUT }];
        continue;
      }
      // Anti-loop: a repeated explicit action must not be deferred to "another turn" again.
      if (mode === 'normal' && params.repeatedIntent && toolBatches === 0 && deferredToNextTurn(finalText)) {
        log('anti_loop_block', { conversationId });
        finalText = ANTI_LOOP_BLOCK_TEXT[params.language ?? 'en'] ?? ANTI_LOOP_BLOCK_TEXT.en;
        emit({ type: 'message', text: finalText });
      }
      break;
    }
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
          result = await runTool(ctx, call.name, args);
        }
      } catch (err) {
        result = { output: { error: err instanceof Error ? err.message : 'Tool failed.', code: 'TOOL_ERROR' } };
      }

      const failed = !!(result.output && typeof result.output === 'object' && 'error' in result.output);
      if (!failed) completedTools.push(call.name);
      observedCalls.push({ name: call.name, video_id: typeof args?.video_id === 'string' ? args.video_id : null, failed });

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
    if (iteration === maxIterations - 1) { pendingOutputs = true; stepLimitHit = true; }
  }

  // Iteration cap hit with tool outputs not yet delivered: close the pending
  // function calls (no further tools) so the next turn can continue the chain.
  if (pendingOutputs && input.length > 0 && !timeLimitHit) {
    try {
      const closing = await museRespond(config, {
        input: [
          ...input,
          { role: 'user', content: mode === 'planning'
            ? 'Tool step limit for this run reached. Summarize briefly what is stored and what is still open; the server continues the authorized planning job automatically within its fixed limits — do not ask the user to say "weiter".'
            : 'Tool step limit for this turn reached. Summarize the current state briefly; the user can continue in the next message.' },
        ],
        instructions,
        previousResponseId,
      });
      totalIn += closing.usage.input;
      totalOut += closing.usage.output;
      modelCalls += 1;
      void recordModelCall(admin, { conversationId: conversationId!, userId, mode, internal: !!params.internal, step: -1, chained: !!previousResponseId, usage: closing.usage });
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

  const lang = (params.language ?? 'en').slice(0, 2);
  const insertAssistant = async (content: string, toolCalls: Record<string, unknown>) => {
    const { error } = await admin.from('agent_messages').insert({
      conversation_id: conversationId,
      user_id: userId,
      role: 'assistant',
      content,
      response_id: previousResponseId,
      resume_task_id: params.resumeTaskId ?? null,
      // tool_calls is NOT NULL in the DB: never write null.
      tool_calls: toolCalls ?? {},
    });
    if (error) console.error('[muse-agent] assistant message insert failed', JSON.stringify({ conversationId, code: error.code, message: error.message }));
    return !error;
  };
  const interruptedRow = (reason: string) => ({
    turn_status: 'interrupted', error: reason.slice(0, 500), completed_tools: completedTools,
  });

  let saved = false;
  if (timeLimitHit) {
    // Explicit status (not a fabricated answer): what ran, and that the job continues.
    const text = (TIME_LIMIT_TEXT[lang] ?? TIME_LIMIT_TEXT.en)(completedTools, !params.planningJobId);
    saved = await insertAssistant(finalText ? `${finalText}\n\n${text}` : text, {
      turn_status: 'time_limit', completed_tools: completedTools, elapsed_ms: now() - startedAt,
    });
  } else if (finalText) {
    saved = await insertAssistant(finalText, stepLimitHit ? { turn_status: 'step_limit', max_steps: maxIterations } : {});
  }
  if (!saved && !params.internal) {
    // Every processed user request gets a persisted, visible outcome. No
    // fabricated answer: an explicit "interrupted" status the UI renders with
    // a recovery action, so a reload never shows an unanswered question.
    const reason = finalText || timeLimitHit ? 'The final answer could not be saved.' : (turnError ?? 'No answer was produced.');
    await insertAssistant('The agent could not finish answering this request.', interruptedRow(reason));
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

  // Planning job hit its step cap: queue ONE bounded server-side continuation
  // (planning mode stored on the job; never more than one active per chat).
  if (mode === 'planning' && (stepLimitHit || timeLimitHit) && !params.planningJobId && conversationId) {
    await admin.from('agent_planning_jobs').insert({
      user_id: userId, conversation_id: conversationId, language: params.language ?? null,
      cost_usd: costUsd, steps_done: 1,
      max_continuations: PLANNING_JOB_MAX_CONTINUATIONS, max_cost_usd: PLANNING_JOB_MAX_COST_USD,
    }).then(({ error }: { error: { message: string } | null }) => { if (error && !/duplicate|unique/i.test(error.message)) console.error('[muse-plan-job] queue failed', error.message); });
    log('planning_job_queued', { conversationId, reason: timeLimitHit ? 'time_limit' : 'step_limit' });
  }

  // workflow_engine_v1 shadow: observe only, after the answer is persisted; never affects the turn.
  if (conversationId && !params.internal) {
    await runShadowSafely(() => observeShadowTurn(
      { store: supabaseStore(admin), loadState: (videoId) => getVideoWorkspaceState({ admin, userId }, videoId) },
      { userId, conversationId: conversationId!, requestId: params.requestId ?? null, message: params.message, mode, observed: observedCalls, modelCalls, turnError },
    ));
  }

  emit({ type: 'usage', inputTokens: totalIn, outputTokens: totalOut, costUsd });
  emit({ type: 'done' });
  return { conversationId, stepLimitHit: stepLimitHit || timeLimitHit, timeLimitHit, costUsd, answered: !!finalText && !timeLimitHit, error: turnError };
}

const TIME_LIMIT_TEXT: Record<string, (tools: string[], queued: boolean) => string> = {
  de: (t, q) => `Planung pausiert: Das Zeitlimit dieses Durchlaufs wurde erreicht. Abgeschlossene Planungsschritte: ${t.join(', ') || '–'}. ${q ? 'Der Server setzt die Planung automatisch in begrenzten Schritten fort.' : 'Die Fortsetzung läuft im bestehenden Planungsauftrag.'}`,
  en: (t, q) => `Planning paused: this run reached its time limit. Completed planning steps: ${t.join(', ') || '–'}. ${q ? 'The server continues the planning automatically in bounded steps.' : 'The existing planning job continues.'}`,
  es: (t, q) => `Planificación en pausa: se alcanzó el límite de tiempo. Pasos completados: ${t.join(', ') || '–'}. ${q ? 'El servidor continúa la planificación automáticamente en pasos limitados.' : 'El trabajo de planificación existente continúa.'}`,
};

// ---- cost control helpers ---------------------------------------------------

const DIGEST_MESSAGES = 8;
const DIGEST_CHARS = 700;

/** Pure: compact, bounded summary of the recent visible conversation. */
export function buildTurnDigest(rows: Array<{ role: string; content: string | null }>): string {
  const lines = rows
    .filter((r) => r.content && r.content.trim())
    .map((r) => {
      const t = r.content!.replace(/\s+/g, ' ').trim();
      return `${r.role === 'user' ? 'User' : 'Agent'}: ${t.length > DIGEST_CHARS ? t.slice(0, DIGEST_CHARS) + '…' : t}`;
    });
  if (lines.length === 0) return '';
  return `CONTEXT (earlier turns of this chat, summarized; full tool outputs are not repeated — call get_campaign / status tools for current stored state):\n${lines.join('\n')}`;
}

// deno-lint-ignore no-explicit-any
async function loadRecentDigest(admin: any, conversationId: string, userId: string): Promise<string> {
  try {
    const { data } = await admin
      .from('agent_messages')
      .select('role, content')
      .eq('conversation_id', conversationId)
      .eq('user_id', userId)
      .eq('internal', false)
      .order('created_at', { ascending: false })
      .limit(DIGEST_MESSAGES);
    return buildTurnDigest(((data ?? []) as Array<{ role: string; content: string | null }>).reverse());
  } catch {
    return '';
  }
}

// deno-lint-ignore no-explicit-any
async function recordModelCall(admin: any, r: { conversationId: string; userId: string; mode: string; internal: boolean; step: number; chained: boolean; usage: { input: number; output: number; cached?: number | null } }) {
  try {
    await admin.from('agent_model_calls').insert({
      conversation_id: r.conversationId, user_id: r.userId, turn_mode: r.mode, internal: r.internal, step: r.step, chained: r.chained,
      input_tokens: r.usage.input, output_tokens: r.usage.output, cached_tokens: r.usage.cached ?? null,
      cost_usd: estimateMuseCostUsd(r.usage.input, r.usage.output),
    });
  } catch { /* telemetry only */ }
}

/**
 * POST /muse-agent — the AdTool Agent endpoint.
 *
 * Authenticates the caller, runs one bounded Muse agent turn and streams
 * progress back as SSE. All Meta credentials stay server-side.
 */

import { createClient } from 'npm:@supabase/supabase-js@2';
import { loadMuseConfig } from '../_shared/muse/config.ts';
import { runAgentTurn, type AgentEvent } from '../_shared/muse/agentLoop.ts';
import { prepareShotRetry } from '../_shared/muse/campaign/production.ts';
import { decideTurnMode, requestFingerprint } from '../_shared/muse/turnPolicy.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

  const authHeader = req.headers.get('Authorization') ?? '';
  const jwt = authHeader.replace(/^Bearer\s+/i, '');
  if (!jwt) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const anon = createClient(supabaseUrl, anonKey);
  const { data: authData, error: authError } = await anon.auth.getUser(jwt);
  if (authError || !authData?.user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let body: { message?: string; conversationId?: string | null; language?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // ---- Campaign budget approval action (Phase B) --------------------------
  // deno-lint-ignore no-explicit-any
  const action = (body as any).action;

  // ---- Prepare retry plans (free; never dispatches or charges) -----------
  if (action === 'prepare-shot-retries') {
    // deno-lint-ignore no-explicit-any
    const ids = Array.isArray((body as any).shotIds) ? (body as any).shotIds.map(String).filter((s: string) => /^[0-9a-f-]{36}$/i.test(s)).slice(0, 10) : [];
    if (!ids.length) {
      return new Response(JSON.stringify({ error: 'shotIds required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const adminClient = createClient(supabaseUrl, serviceKey);
    const ctx = {
      userId: authData.user.id, conversationId: '', admin: adminClient, userJwt: jwt, supabaseUrl, anonKey,
      museConfig: { apiKey: '', baseUrl: '', model: '', maxToolIterations: 0, maxRegenerations: 0, maxTurnSpend: 0 },
      regenerationsUsed: 0, maxRegenerations: 0, maxTurnSpend: 0, spentThisTurn: 0,
    };
    const plans = [];
    for (const id of ids) plans.push((await prepareShotRetry(ctx, { shot_id: id })).output);
    return new Response(JSON.stringify({ plans }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
  if (action === 'approve-campaign-budget' || action === 'reject-campaign-budget') {
    // deno-lint-ignore no-explicit-any
    const approvalId = String((body as any).approvalId ?? '');
    if (!/^[0-9a-f-]{36}$/i.test(approvalId)) {
      return new Response(JSON.stringify({ error: 'approvalId required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const adminClient = createClient(supabaseUrl, serviceKey);
    const nowIso = new Date().toISOString();
    const update = action === 'approve-campaign-budget' ? { status: 'approved' } : { status: 'rejected' };
    const { data } = await adminClient
      .from('campaign_budget_approvals')
      .update(update)
      .eq('id', approvalId)
      .eq('user_id', authData.user.id)
      .eq('status', 'pending')
      .gt('start_expires_at', nowIso)
      .select('id, status, estimated_total, max_total, retry_mode, retry_budget_per_shot, start_expires_at, execution_expires_at');
    if (!data || data.length !== 1) {
      return new Response(JSON.stringify({ error: 'This campaign budget is no longer valid. Ask the agent for a new estimate.', code: 'APPROVAL_INVALID' }), {
        status: 409,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ campaign_approval: data[0] }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // ---- Approval action: user confirms a quoted generation cost -----------
  if (action === 'approve' || action === 'reject') {
    // deno-lint-ignore no-explicit-any
    const approvalId = String((body as any).approvalId ?? '');
    if (!/^[0-9a-f-]{36}$/i.test(approvalId)) {
      return new Response(JSON.stringify({ error: 'approvalId required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const adminClient = createClient(supabaseUrl, serviceKey);
    const now = new Date();
    const update = action === 'approve'
      ? { status: 'approved', approved_at: now.toISOString(), expires_at: new Date(now.getTime() + 15 * 60_000).toISOString() }
      : { status: 'rejected' };
    const { data } = await adminClient
      .from('agent_generation_approvals')
      .update(update)
      .eq('id', approvalId)
      .eq('user_id', authData.user.id)
      .eq('status', 'pending')
      .gt('expires_at', now.toISOString())
      .select('id, status, model, duration_seconds, resolution, cost, currency, retry_budget, max_total_cost, expires_at');
    if (!data || data.length !== 1) {
      return new Response(JSON.stringify({ error: 'This quote is no longer valid. Ask the agent for a new one.', code: 'APPROVAL_INVALID' }), {
        status: 409,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ approval: data[0] }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const message = typeof body.message === 'string' ? body.message.trim() : '';
  if (!message || message.length > 8000) {
    return new Response(JSON.stringify({ error: 'message must be 1-8000 characters' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  const language = ['en', 'de', 'es'].includes(String(body.language)) ? String(body.language) : undefined;

  let config;
  try {
    config = loadMuseConfig();
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Agent is not configured.', code: 'NOT_CONFIGURED' }),
      { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  const admin = createClient(supabaseUrl, serviceKey);
  // deno-lint-ignore no-explicit-any
  const raw = body as any;
  const userId = authData.user.id;

  // ---- Durable idempotency: one turn per (user, requestId), across parallel
  // requests, reloads and function restarts. Same id + other content → reject.
  const requestId = typeof raw.requestId === 'string' && /^[A-Za-z0-9:_-]{8,120}$/.test(raw.requestId) ? raw.requestId : null;
  if (raw.requestId !== undefined && !requestId) {
    return new Response(JSON.stringify({ error: 'Invalid requestId.', code: 'INVALID_REQUEST_ID' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
  if (requestId) {
    const fingerprint = await requestFingerprint(body.conversationId ?? null, message);
    const { error: claimErr } = await admin.from('agent_request_ids').insert({
      user_id: userId, request_id: requestId, fingerprint, conversation_id: body.conversationId ?? null,
    });
    if (claimErr) {
      if (claimErr.code !== '23505') {
        return new Response(JSON.stringify({ error: 'Could not register the request. Nothing was started.', code: 'DB_ERROR' }), { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      const { data: prev } = await admin.from('agent_request_ids').select('fingerprint, status').eq('user_id', userId).eq('request_id', requestId).maybeSingle();
      const mismatch = prev && prev.fingerprint !== fingerprint;
      return new Response(JSON.stringify(mismatch
        ? { error: 'This request id was already used for a different message.', code: 'REQUEST_ID_REUSED' }
        : { error: 'This request was already received; it is not processed twice.', code: 'DUPLICATE_REQUEST', status: prev?.status ?? null }), {
        status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  }

  // ---- Server-decided turn mode. The client flag can only turn read-only ON.
  // Continuations ("weiter") are judged against the previous user requests of the
  // SAME conversation as stored on the server — never against client state.
  let priorUserMessages: string[] = [];
  if (body.conversationId) {
    const { data: prior } = await admin.from('agent_messages').select('content, tool_calls')
      .eq('conversation_id', body.conversationId).eq('user_id', userId).eq('role', 'user')
      .order('created_at', { ascending: false }).limit(12);
    priorUserMessages = (prior ?? [])
      // deno-lint-ignore no-explicit-any
      .filter((m: any) => !m.tool_calls?.internal)
      // deno-lint-ignore no-explicit-any
      .map((m: any) => String(m.content ?? ''));
  }
  const decision = decideTurnMode({ message, clientReadOnly: raw.readOnly, priorUserMessages });
  const mode = decision.mode;
  console.log('[muse-agent] turn_mode', JSON.stringify({ conversationId: body.conversationId ?? null, mode, reason: decision.reason }));
  if (requestId) await admin.from('agent_request_ids').update({ mode, mode_reason: decision.reason }).eq('user_id', userId).eq('request_id', requestId);

  // Admin-only test hooks (no paid calls): fault injection and tool-call rewrite.
  let isAdmin = false;
  if (raw.faultInject || raw.testRewriteFirstToolCallTo) {
    const { data } = await admin.rpc('has_role', { _user_id: userId, _role: 'admin' });
    isAdmin = data === true;
  }
  const faultInjectAfterTools = isAdmin && raw.faultInject === 'after_tools';
  const faultInjectBeforeModel = isAdmin && raw.faultInject === 'before_model';
  const testRewriteFirstToolCallTo = isAdmin && typeof raw.testRewriteFirstToolCallTo === 'string' ? String(raw.testRewriteFirstToolCallTo).slice(0, 64) : undefined;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const emit = (event: AgentEvent) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          /* client disconnected */
        }
      };
      emit({ type: 'turn_mode', mode, reason: decision.reason } as unknown as AgentEvent);
      try {
        await runAgentTurn({
          admin,
          config,
          userId: authData.user.id,
          userJwt: jwt,
          supabaseUrl,
          anonKey,
          conversationId: body.conversationId ?? null,
          message,
          language,
          emit,
          faultInjectAfterTools,
          faultInjectBeforeModel,
          testRewriteFirstToolCallTo,
          mode,
          needsClarification: decision.needsClarification,
        });
        if (requestId) await admin.from('agent_request_ids').update({ status: 'done', updated_at: new Date().toISOString() }).eq('user_id', userId).eq('request_id', requestId);
      } catch (err) {
        console.error('[muse-agent] turn failed', err);
        emit({ type: 'error', message: err instanceof Error ? err.message : 'Agent failed.' });
        emit({ type: 'done' });
        if (requestId) await admin.from('agent_request_ids').update({ status: 'failed', updated_at: new Date().toISOString() }).eq('user_id', userId).eq('request_id', requestId);
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      ...corsHeaders,
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
});

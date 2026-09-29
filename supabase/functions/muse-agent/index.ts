/**
 * POST /muse-agent — the AdTool Agent endpoint.
 *
 * Authenticates the caller, runs one bounded Muse agent turn and streams
 * progress back as SSE. All Meta credentials stay server-side.
 */

import { createClient } from 'npm:@supabase/supabase-js@2';
import { loadMuseConfig } from '../_shared/muse/config.ts';
import { runAgentTurn, type AgentEvent } from '../_shared/muse/agentLoop.ts';

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

  // ---- Approval action: user confirms a quoted generation cost -----------
  // deno-lint-ignore no-explicit-any
  const action = (body as any).action;
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
        });
      } catch (err) {
        console.error('[muse-agent] turn failed', err);
        emit({ type: 'error', message: err instanceof Error ? err.message : 'Agent failed.' });
        emit({ type: 'done' });
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

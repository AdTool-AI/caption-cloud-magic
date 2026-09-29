/**
 * agent-task-resume — durable background continuation for the AdTool Agent.
 *
 * Called by pg_cron (only while waiting tasks exist). For every agent_tasks row
 * waiting on a video generation it reads the existing `ai_video_generations`
 * record (kept up to date by replicate-webhook / modelark-poll) and:
 *   • completed → atomically claims the task (waiting → analyzing, at most once)
 *     and runs one restricted Muse turn in the SAME conversation: full-video QA
 *     and the final recommendation. Paid tools are not available.
 *   • failed    → marks the task failed and posts one assistant message.
 * It never calls a provider or a generate-* function, so it cannot charge the
 * wallet or start a duplicate generation.
 */

import { createClient } from 'npm:@supabase/supabase-js@2';
import { loadMuseConfig } from '../_shared/muse/config.ts';
import { runAgentTurn } from '../_shared/muse/agentLoop.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const RESUME_TOOLS = new Set([
  'get_user_context',
  'get_available_video_models',
  'get_video_status',
  'analyze_asset',
  'estimate_video_cost', // prepares a NEW quote only; generation still needs a foreground Confirm
]);
const HARD_CEILING_MS = 24 * 60 * 60 * 1000;

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

const FAIL_TEXT: Record<string, (e: string) => string> = {
  de: (e) => `Die Videoerstellung ist fehlgeschlagen: ${e}. Es wurde nichts erneut gestartet — sag mir, ob ich ein neues Angebot erstellen soll.`,
  es: (e) => `La generación del vídeo ha fallado: ${e}. No se ha reiniciado nada; dime si preparo una nueva oferta.`,
  en: (e) => `The video generation failed: ${e}. Nothing was restarted — tell me if you want a new quote.`,
};

function resumeInstruction(t: { generation_id: string; intent: string | null }, videoUrl: string) {
  return [
    'INTERNAL SYSTEM EVENT (not written by the user; do not quote it).',
    `The video generation ${t.generation_id} you started earlier in this conversation has finished: ${videoUrl}`,
    t.intent ? `Original production intent: ${t.intent}` : '',
    `Now call analyze_asset with generation_id "${t.generation_id}" to run the full-video QA, then give the user the final result and your recommendation.`,
    'You cannot start or regenerate videos in this turn. If a retry is clearly warranted, call estimate_video_cost so the user can confirm a new quote.',
  ].filter(Boolean).join('\n');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' });

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const bearer = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!bearer || (bearer !== anonKey && bearer !== serviceKey)) return json(401, { error: 'Unauthorized' });

  const admin = createClient(supabaseUrl, serviceKey);

  // Test-only hooks: honored only for a verified admin JWT and one named task.
  let test: { taskId?: string; rewriteToolTo?: string; throwAfterQa?: boolean } | null = null;
  const testJwt = req.headers.get('x-agent-test-jwt');
  if (testJwt) {
    const body = await req.json().catch(() => ({}));
    const { data: u } = await admin.auth.getUser(testJwt);
    const { data: isAdmin } = u?.user ? await admin.rpc('has_role', { _user_id: u.user.id, _role: 'admin' }) : { data: false };
    if (isAdmin === true && body?.test?.taskId) test = body.test;
    else return json(403, { error: 'Test hooks require admin' });
  }
  const timeoutMin = Math.max(5, Number(Deno.env.get('MUSE_AGENT_TASK_TIMEOUT_MINUTES') ?? 60) || 60);
  const summary = { waiting: 0, failed: 0, resumed: 0, slow: 0, stale_analyzing: 0 };

  const { data: waiting } = await admin
    .from('agent_tasks')
    .select('id, conversation_id, user_id, generation_id, language, created_at, slow_since')
    .eq('status', 'waiting_for_generation')
    .order('created_at')
    .limit(50);
  summary.waiting = waiting?.length ?? 0;

  if (waiting && waiting.length > 0) {
    // Advance in-flight Seedance 2.5 tasks through the existing idempotent poller.
    await fetch(`${supabaseUrl}/functions/v1/modelark-poll`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
      body: '{}',
    }).catch(() => undefined);

    const ids = waiting.map((w) => w.generation_id);
    const { data: gens } = await admin.from('ai_video_generations').select('id, status, error_message').in('id', ids);
    const byId = new Map((gens ?? []).map((g) => [g.id, g]));

    for (const t of waiting) {
      const g = byId.get(t.generation_id);
      const age = Date.now() - new Date(t.created_at).getTime();
      const status = String(g?.status ?? '');
      if (g && status === 'failed') {
        const { data: claimed } = await admin
          .from('agent_tasks')
          .update({ status: 'failed', error: g.error_message ?? 'Generation failed', finished_at: new Date().toISOString() })
          .eq('id', t.id).eq('status', 'waiting_for_generation').select('id');
        if (claimed?.length === 1) {
          const fn = FAIL_TEXT[t.language ?? 'en'] ?? FAIL_TEXT.en;
          await admin.from('agent_messages').insert({
            conversation_id: t.conversation_id, user_id: t.user_id, role: 'assistant',
            content: fn(g.error_message ?? 'unknown error'), resume_task_id: t.id,
          });
          summary.failed += 1;
        }
      } else if (!g || (status !== 'completed' && age > HARD_CEILING_MS)) {
        // Record missing or stuck for 24h: stop waiting (never retried automatically).
        const { data: claimed } = await admin
          .from('agent_tasks')
          .update({ status: 'failed', error: g ? 'Generation did not finish within 24 hours.' : 'Generation record not found.', finished_at: new Date().toISOString() })
          .eq('id', t.id).eq('status', 'waiting_for_generation').select('id');
        if (claimed?.length === 1) {
          const fn = FAIL_TEXT[t.language ?? 'en'] ?? FAIL_TEXT.en;
          await admin.from('agent_messages').insert({
            conversation_id: t.conversation_id, user_id: t.user_id, role: 'assistant',
            content: fn(g ? 'no result after 24 hours' : 'record not found'), resume_task_id: t.id,
          });
          summary.failed += 1;
        }
      } else if (status !== 'completed' && age > timeoutMin * 60_000 && !t.slow_since) {
        // Slow but still legitimately processing: flag only, keep waiting.
        await admin.from('agent_tasks').update({ slow_since: new Date().toISOString() }).eq('id', t.id).eq('status', 'waiting_for_generation');
        summary.slow += 1;
      }
    }
  }

  // Analyzing tasks whose worker died are never re-run (QA at most once): close them.
  const { data: stale } = await admin
    .from('agent_tasks')
    .update({ status: 'failed', error: 'Background analysis was interrupted.', finished_at: new Date().toISOString() })
    .eq('status', 'analyzing').lt('lease_until', new Date().toISOString()).select('id');
  summary.stale_analyzing = stale?.length ?? 0;

  // Completed generations: atomic claim (waiting → analyzing, SKIP LOCKED).
  const { data: claimedTasks, error: claimErr } = await admin.rpc('claim_agent_tasks', { _limit: 3 });
  if (claimErr) console.error('[agent-task-resume] claim failed', claimErr.message);

  let config;
  try {
    config = loadMuseConfig();
  } catch (err) {
    console.error('[agent-task-resume] muse not configured', err);
  }

  for (const t of claimedTasks ?? []) {
    const { data: g } = await admin.from('ai_video_generations').select('video_url').eq('id', t.generation_id).maybeSingle();
    if (!config) {
      await admin.from('agent_tasks').update({ status: 'failed', error: 'Agent not configured', finished_at: new Date().toISOString() }).eq('id', t.id);
      continue;
    }
    const hooks = test && test.taskId === t.id ? test : null;
    const events: Array<Record<string, unknown>> = [];
    let lastMessage = '';
    try {
      await runAgentTurn({
        admin, config,
        userId: t.user_id,
        userJwt: serviceKey,
        internalAuthUserId: t.user_id,
        supabaseUrl, anonKey,
        conversationId: t.conversation_id,
        message: resumeInstruction(t, g?.video_url ?? ''),
        language: t.language ?? undefined,
        internal: true,
        allowedTools: RESUME_TOOLS,
        resumeTaskId: t.id,
        testRewriteFirstToolCallTo: hooks?.rewriteToolTo,
        emit: (e) => {
          if (hooks?.throwAfterQa && e.type === 'tool_result' && e.name === 'analyze_asset') {
            throw new Error('Simulated worker interruption after QA (test hook).');
          }
          if (e.type === 'message') lastMessage = e.text;
          if (e.type === 'tool_result' || e.type === 'error') events.push(e as Record<string, unknown>);
        },
      });
      const qa = events.find((e) => e.type === 'tool_result' && e.name === 'analyze_asset');
      const err = events.find((e) => e.type === 'error');
      await admin.from('agent_tasks').update({
        status: lastMessage ? 'completed' : 'failed',
        result: { video_url: g?.video_url ?? null, qa: qa?.result ?? null, summary: lastMessage || null },
        error: lastMessage ? null : String(err?.message ?? 'No agent response'),
        finished_at: new Date().toISOString(),
      }).eq('id', t.id).eq('status', 'analyzing');
      summary.resumed += 1;
    } catch (err) {
      console.error('[agent-task-resume] resume failed', t.id, err);
      await admin.from('agent_tasks').update({
        status: 'failed', error: err instanceof Error ? err.message : 'Resume failed',
        result: { video_url: g?.video_url ?? null }, finished_at: new Date().toISOString(),
      }).eq('id', t.id).eq('status', 'analyzing');
    }
  }

  console.log('[agent-task-resume]', JSON.stringify(summary));
  return json(200, summary);
});

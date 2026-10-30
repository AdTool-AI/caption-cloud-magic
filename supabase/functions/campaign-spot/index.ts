// Campaign spot workspace API (manual UI). Uses the same runtime as the agent tools.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import {
  approveAction, confirmContent, getSpot, prepareAction, refreshClipUrls, refreshExport, runAction, saveEdit, selectAttempt, SpotError,
  type SpotCtx,
} from '../_shared/muse/campaign/spotRuntime.ts';
import { setCampaignVoiceoverVoice } from '../_shared/muse/campaign/voiceSelection.ts';
import { checkProvidersFromEnv } from '../_shared/muse/campaign/checkProviders.ts';
import { getAssembly, prepareAssembly, rejectAssembly, startAssemblyAndDispatch } from '../_shared/muse/campaign/assembly.ts';

const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
const KINDS = ['voiceover', 'music', 'sfx', 'subtitles', 'export'];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    const url = Deno.env.get('SUPABASE_URL')!;
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: u } = await admin.auth.getUser(jwt);
    if (!u?.user) return json({ error: 'Unauthorized' }, 401);
    const ctx: SpotCtx = { admin, userId: u.user.id, userJwt: jwt, supabaseUrl: url, anonKey: anon, providers: await checkProvidersFromEnv() };

    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? '');
    const videoId = typeof body.video_id === 'string' ? body.video_id : '';
    const needVideo = !['approve', 'run', 'start_assembly', 'reject_assembly', 'get_assembly_by_id', 'list_conversation_assemblies', 'resume_assembly'].includes(action);
    if (needVideo && !/^[0-9a-f-]{36}$/i.test(videoId)) return json({ error: 'video_id required' }, 400);

    switch (action) {
      case 'get': return json(await getSpot(ctx, videoId));
      case 'refresh_clip_urls': return json(await refreshClipUrls(ctx, videoId));
      case 'refresh_export': return json(await refreshExport(ctx, videoId));
      case 'select_attempt': return json(await selectAttempt(ctx, videoId, String(body.shot_id), String(body.attempt_id)));
      case 'save_edit': return json(await saveEdit(ctx, videoId, body.patch ?? {}, Number.isInteger(body.expected_revision) ? body.expected_revision : null));
      case 'prepare':
        if (!KINDS.includes(body.kind)) return json({ error: 'bad kind' }, 400);
        return json(await prepareAction(ctx, videoId, body.kind, body.params ?? {}, 'user'));
      case 'approve': return json(await approveAction(ctx, String(body.action_id)));
      case 'run': return json(await runAction(ctx, String(body.action_id)));
      case 'set_voice': return json(await setCampaignVoiceoverVoice(ctx, { ...body, video_id: videoId }));
      case 'get_assembly': return json({ assembly: await getAssembly(ctx, videoId) });
      case 'prepare_assembly': return json(await prepareAssembly(ctx, videoId, body.params ?? {}, 'user'));
      // Single execution path for chat card AND workspace.
      case 'start_assembly':
        return json(await startAssemblyAndDispatch(ctx, String(body.assembly_id), () => {
          // Kick the background worker now; the cron tick continues it if this call is lost.
          fetch(`${url}/functions/v1/agent-task-resume`, { method: 'POST', headers: { Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`, 'Content-Type': 'application/json' }, body: '{}' }).catch(() => undefined);
        }));
      case 'reject_assembly': return json(await rejectAssembly(ctx, String(body.assembly_id)));
      case 'get_assembly_by_id': {
        const { data } = await admin.from('campaign_assembly_jobs').select('id, status, steps, max_cost, scope, error, created_at, approved_at, rejected_at, finished_at, edit_revision, video_id, current_step')
          .eq('id', String(body.assembly_id)).eq('user_id', ctx.userId).maybeSingle();
        let video_export_status: string | null = null;
        if (data?.video_id) video_export_status = (await admin.from('campaign_videos').select('export_status').eq('id', data.video_id).eq('user_id', ctx.userId).maybeSingle()).data?.export_status ?? null;
        return json({ assembly: data ? { ...data, video_export_status } : null });
      }
      // Narrow wake-up: owner's running assembly whose export already finished. Creates nothing; the worker lease prevents double runs.
      case 'resume_assembly': {
        const { data } = await admin.from('campaign_assembly_jobs').select('id, status, video_id').eq('id', String(body.assembly_id)).eq('user_id', ctx.userId).maybeSingle();
        if (!data || data.status !== 'running') return json({ kicked: false, reason: 'NOT_RUNNING' });
        const v = await admin.from('campaign_videos').select('export_status').eq('id', data.video_id).eq('user_id', ctx.userId).maybeSingle();
        if (v.data?.export_status !== 'done') return json({ kicked: false, reason: 'EXPORT_NOT_DONE' });
        await fetch(`${url}/functions/v1/agent-task-resume`, { method: 'POST', headers: { Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`, 'Content-Type': 'application/json' }, body: '{}' }).catch(() => undefined);
        return json({ kicked: true });
      }
      // Read-only discovery so a pending assembly shows in chat even without its prepare operation row.
      case 'list_conversation_assemblies': {
        const conv = String(body.conversation_id ?? '');
        if (!/^[0-9a-f-]{36}$/i.test(conv)) return json({ error: 'conversation_id required' }, 400);
        const { data: camps } = await admin.from('agent_campaigns').select('id').eq('conversation_id', conv).eq('user_id', ctx.userId);
        const ids = (camps ?? []).map((c: { id: string }) => c.id);
        if (!ids.length) return json({ assemblies: [] });
        const { data } = await admin.from('campaign_assembly_jobs').select('id, status, video_id, campaign_id, created_at')
          .in('campaign_id', ids).eq('user_id', ctx.userId).order('created_at', { ascending: false }).limit(20);
        return json({ assemblies: data ?? [] });
      }
      case 'confirm_content': return json(await confirmContent(ctx, videoId, Number(body.revision), body.checks ?? {}));
      default: return json({ error: 'unknown action' }, 400);
    }
  } catch (e) {
    if (e instanceof SpotError) return json({ error: e.message, code: e.code }, e.code === 'NOT_FOUND' ? 404 : 409);
    console.error('[campaign-spot]', e);
    return json({ error: (e as Error).message }, 500);
  }
});

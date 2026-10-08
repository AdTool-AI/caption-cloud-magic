// Campaign spot workspace API (manual UI). Uses the same runtime as the agent tools.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import {
  approveAction, confirmContent, getSpot, prepareAction, refreshExport, runAction, saveEdit, selectAttempt, SpotError,
  type SpotCtx,
} from '../_shared/muse/campaign/spotRuntime.ts';

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
    const ctx: SpotCtx = { admin, userId: u.user.id, userJwt: jwt, supabaseUrl: url, anonKey: anon };

    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? '');
    const videoId = typeof body.video_id === 'string' ? body.video_id : '';
    const needVideo = !['approve', 'run'].includes(action);
    if (needVideo && !/^[0-9a-f-]{36}$/i.test(videoId)) return json({ error: 'video_id required' }, 400);

    switch (action) {
      case 'get': return json(await getSpot(ctx, videoId));
      case 'refresh_export': return json(await refreshExport(ctx, videoId));
      case 'select_attempt': return json(await selectAttempt(ctx, videoId, String(body.shot_id), String(body.attempt_id)));
      case 'save_edit': return json(await saveEdit(ctx, videoId, body.patch ?? {}, Number.isInteger(body.expected_revision) ? body.expected_revision : null));
      case 'prepare':
        if (!KINDS.includes(body.kind)) return json({ error: 'bad kind' }, 400);
        return json(await prepareAction(ctx, videoId, body.kind, body.params ?? {}, 'user'));
      case 'approve': return json(await approveAction(ctx, String(body.action_id)));
      case 'run': return json(await runAction(ctx, String(body.action_id)));
      case 'confirm_content': return json(await confirmContent(ctx, videoId, Number(body.revision), body.checks ?? {}));
      default: return json({ error: 'unknown action' }, 400);
    }
  } catch (e) {
    if (e instanceof SpotError) return json({ error: e.message, code: e.code }, e.code === 'NOT_FOUND' ? 404 : 409);
    console.error('[campaign-spot]', e);
    return json({ error: (e as Error).message }, 500);
  }
});

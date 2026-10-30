import { assertEquals, assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { fakeDb } from '../campaign/spotTestKit.ts';
import { getVideoWorkspaceState } from './workspaceState.ts';
import { getSpot } from '../campaign/spotRuntime.ts';
import { getAssembly } from '../campaign/assembly.ts';

const U = 'u1';
function seed() {
  const edit = { aspect: '9:16', branding_mode: 'text_only', clips: [{ shot_id: 's1', attempt_id: 'a1', url: 'https://x/1.mp4', trim_start: 0, trim_end: 5 }], overlays: [], endcard: { cta: 'Komm vorbei' } };
  return {
    campaign_videos: [{ id: 'v1', user_id: U, campaign_id: 'c1', title: 'Pancake', edit, edit_revision: 10, export_status: 'done', export_url: 'https://x/e.mp4', export_revision: 9,
      final_ai_qa: { revision: 9, verdict: 'needs_work', score: 6 }, post_production: { voiceover_voice_id: 'XrEx', voiceover_voice_name: 'Hannah', voiceover_language: 'de', voiceover_voice_user_confirmed: true } }],
    campaign_shots: [{ id: 's1', video_id: 'v1', campaign_id: 'c1', shot_index: 1, status: 'needs_retry', selected_attempt_id: 'a1', retry_plan: { model: 'kling' } }],
    campaign_shot_attempts: [{ id: 'a1', shot_id: 's1', campaign_id: 'c1', user_id: U, attempt_no: 1, generation_id: 'g1', model: 'kling', qa_verdict: 'fail' }],
    agent_campaigns: [{ id: 'c1', video_duration_s: 30 }],
    campaign_assets: [], campaign_post_actions: [],
    ai_video_generations: [{ id: 'g1', user_id: U, video_url: 'https://x/1.mp4', duration_seconds: 5, status: 'completed' }],
    campaign_assembly_jobs: [{ id: 'as1', video_id: 'v1', user_id: U, status: 'pending', edit_revision: 10, max_cost: { wallet_usd: 0.3 }, steps: [], created_at: '2026-10-13T10:00:00Z' }],
    campaign_budget_approvals: [],
  };
}
const ctx = (admin: unknown) => ({ admin, userId: U, userJwt: '', supabaseUrl: '', anonKey: '' });

Deno.test('workspace state: one read covers the whole video and flags stale QA/export', async () => {
  const tables = seed();
  const db = fakeDb(tables as never);
  const before = JSON.stringify(tables);
  const s = await getVideoWorkspaceState(ctx(db), 'v1');
  assertEquals(JSON.stringify(tables), before, 'never writes');
  assertEquals(s.edit_revision, 10);
  assertEquals(s.export_revision, 9);
  assert(s.stale_flags.includes('EXPORT_OLDER_THAN_CUT'));
  assertEquals(s.voice?.name, 'Hannah');
  assertEquals(s.assembly?.id, 'as1');
  assertEquals(s.open_approvals[0].kind, 'assembly');
  assertEquals(s.recommended_next_action, 'approve_pending_approval');
  assertEquals(s.retry_plans.length, 1);
  assertEquals(s.clips[0].has_clip, true);
});

Deno.test('workspace state agrees with get_spot_edit and get_spot_assembly (same loaders)', async () => {
  const db = fakeDb(seed() as never);
  const s = await getVideoWorkspaceState(ctx(db), 'v1');
  const spot = await getSpot(ctx(db) as never, 'v1');
  const asm = await getAssembly(ctx(db) as never, 'v1');
  assertEquals(spot.revision, s.edit_revision);
  assertEquals(spot.export.revision, s.export_revision);
  assertEquals(spot.stage, s.video.stage);
  assertEquals(asm?.id, s.assembly?.id);
});

Deno.test('workspace state: missing cut is reported, not created', async () => {
  const t = seed(); (t.campaign_videos[0] as Record<string, unknown>).edit = null;
  const db = fakeDb(t as never);
  const s = await getVideoWorkspaceState(ctx(db), 'v1');
  assert(s.blocking_reasons.includes('NO_CUT'));
  assertEquals(t.campaign_videos[0].edit, null);
});

Deno.test('workspace state: other user cannot read the video', async () => {
  const db = fakeDb(seed() as never);
  let code = '';
  try { await getVideoWorkspaceState({ admin: db, userId: 'other' }, 'v1'); } catch (e) { code = (e as { code: string }).code; }
  assertEquals(code, 'NOT_FOUND');
});

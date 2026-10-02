import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { approvedShotIds, budgetTotals, buildScope, checkApprovalStartable, filterDispatchable, scopeShotsToVideos } from './scope.ts';

const C = 'camp-1';
const mk = (id: string, video_id: string, price: number, campaign_id = C) =>
  ({ id, video_id, campaign_id, selected_model: 'kling-3', duration_s: price === 0.5 ? 5 : 8, resolution: '1080p', estimated_cost: price });
// v1: 2×0.50 + 3×0.80 = 3.40 ; v2: 5×0.80 = 4.00
const shots = [
  mk('a', 'v1', 0.5), mk('b', 'v1', 0.5), mk('c', 'v1', 0.8), mk('d', 'v1', 0.8), mk('e', 'v1', 0.8),
  mk('f', 'v2', 0.8), mk('g', 'v2', 0.8), mk('h', 'v2', 0.8), mk('i', 'v2', 0.8), mk('j', 'v2', 0.8),
];

Deno.test('single-video estimate counts only that video', () => {
  const r = scopeShotsToVideos(shots, ['v1']);
  assert(r.ok);
  assertEquals(r.shots.length, 5);
  const t = budgetTotals(buildScope(r.shots), 1);
  assertEquals(t.estimatedTotal, 3.4);
  assertEquals(t.maxTotal, 6.8);
  assert(buildScope(r.shots).every((s) => s.video_id === 'v1'));
});

Deno.test('full-campaign estimate unchanged when video_ids omitted', () => {
  for (const v of [undefined, null]) {
    const r = scopeShotsToVideos(shots, v);
    assert(r.ok);
    assertEquals(r.videoIds, null);
    assertEquals(r.shots.length, 10);
    assertEquals(budgetTotals(buildScope(r.shots), 1), { estimatedTotal: 7.4, maxTotal: 14.8 });
  }
});

Deno.test('invalid or unknown video_ids are rejected', () => {
  assertEquals(scopeShotsToVideos(shots, []).ok, false);
  assertEquals(scopeShotsToVideos(shots, [1]).ok, false);
  assertEquals(scopeShotsToVideos(shots, ['v9']).ok, false);
});

Deno.test('production cannot execute shots outside the approved scope', () => {
  const scope = buildScope(scopeShotsToVideos(shots, ['v1']).ok ? shots.slice(0, 5) : []);
  const approval = { scope, campaign_id: C };
  const foreign = mk('x', 'v1', 0.5, 'other-campaign');
  const out = filterDispatchable(approval, [...shots, foreign]);
  assertEquals(out.map((s) => s.id), ['a', 'b', 'c', 'd', 'e']);
  assert(!approvedShotIds(scope).has('f'));
});

Deno.test('expired old full-campaign approval cannot be reused', () => {
  const now = Date.parse('2026-10-02T18:00:00Z');
  const old = { status: 'approved', start_expires_at: '2026-10-02T09:11:00Z', execution_expires_at: '2026-10-09T08:41:00Z' };
  const r = checkApprovalStartable(old, now);
  assertEquals(r.ok, false);
  if (!r.ok) assertEquals(r.code, 'APPROVAL_EXPIRED');
  assertEquals(checkApprovalStartable({ ...old, status: 'pending', start_expires_at: '2026-10-02T18:30:00Z' }, now).ok, false);
  assertEquals(checkApprovalStartable({ ...old, status: 'rejected' }, now).ok, false);
  assertEquals(checkApprovalStartable({ ...old, start_expires_at: '2026-10-02T18:30:00Z' }, now).ok, true);
});

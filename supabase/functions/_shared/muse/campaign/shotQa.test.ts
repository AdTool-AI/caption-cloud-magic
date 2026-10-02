import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { classifyIssues, parseQaResponse, reconcilePendingShotQa, runShotQa } from './shotQa.ts';

/** In-memory model of the SQL claim/fail/finalize contract. */
function fakeDb(shot: Record<string, unknown>, genCompleted = true) {
  const calls: string[] = [];
  const stats: unknown[] = [];
  const s = { qa_attempts: 0, qa_claim_id: null as string | null, qa_stats_generation_id: null as string | null, ...shot } as Record<string, any>;
  let n = 0;
  const admin = {
    rpc: async (name: string, a: Record<string, any>) => {
      calls.push(name);
      if (name === 'claim_shot_qa') {
        const eligible = genCompleted && s.qa_attempts < 5 && (['generating', 'qa_pending'].includes(s.status) || (s.status === 'qa' && s.lease_expired));
        if (!eligible) return { data: [] };
        s.status = 'qa'; s.qa_claim_id = `c${++n}`; s.qa_attempts += 1; s.lease_expired = false;
        return { data: [{ shot_id: s.id, claim_id: s.qa_claim_id, generation_id: s.current_generation_id, user_id: 'u' }] };
      }
      if (name === 'fail_shot_qa') {
        if (s.status !== 'qa' || s.qa_claim_id !== a._claim_id) return { data: null };
        s.status = s.qa_attempts >= (a._max_attempts ?? 5) ? 'qa_failed' : 'qa_pending'; s.qa_claim_id = null;
        return { data: s.status };
      }
      if (name === 'finalize_shot_qa') {
        if (s.status !== 'qa' || s.qa_claim_id !== a._claim_id) return { data: false };
        s.status = a._client_ready ? 'client_ready' : 'needs_retry'; s.client_ready = a._client_ready; s.qa_claim_id = null;
        if (s.qa_stats_generation_id !== s.current_generation_id) { stats.push(a); s.qa_stats_generation_id = s.current_generation_id; }
        return { data: true };
      }
      throw new Error(`unexpected rpc ${name}`);
    },
    from: (_t: string) => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { english_prompt: 'p', purpose: 'x' } }) }) }) }),
  };
  return { admin, s, calls, stats };
}

const okBody = { analysis_available: true, qa: { verdict: 'acceptable', scores: { prompt_adherence: 8, motion_artifacts: 8 }, issues: [] } };
const okFetch = (async () => new Response(JSON.stringify(okBody), { status: 200 })) as typeof fetch;
const badFetch = (async () => new Response(JSON.stringify({ code: 'QA_UNAVAILABLE', reason: 'rate_limited' }), { status: 429 })) as typeof fetch;
const t = (fetchFn: typeof fetch) => ({ supabaseUrl: 'http://x', jwt: 'j', anonKey: 'a', fetchFn });

Deno.test('parser reads the nested qa object (no bogus 0/10)', () => {
  const p = parseQaResponse(okBody);
  assertEquals(p.verdict, 'acceptable');
  assertEquals(p.overall, 8);
  assertEquals(p.issues, {});
  assert(p.clientReady);
  // Schema key names in the response must not count as issues.
  assertEquals(classifyIssues(undefined), {});
});

Deno.test('generation completed + QA interrupted (stale qa lease) -> resumable QA', async () => {
  const db = fakeDb({ id: 's4', status: 'qa', lease_expired: true, current_generation_id: 'g4' });
  const out = await runShotQa(db.admin, t(okFetch), 's4');
  assertEquals(out.state, 'final');
  assertEquals(db.s.status, 'client_ready');
});

Deno.test('duplicate QA resume is idempotent (stats exactly once)', async () => {
  const db = fakeDb({ id: 's2', status: 'generating', current_generation_id: 'g2' });
  await runShotQa(db.admin, t(okFetch), 's2');
  const again = await runShotQa(db.admin, t(okFetch), 's2');
  await reconcilePendingShotQa(db.admin, t(okFetch));
  assertEquals(again.state, 'not_claimed');
  assertEquals(db.stats.length, 1);
});

Deno.test('provider transient failure -> qa_pending, never "generating"', async () => {
  const db = fakeDb({ id: 's5', status: 'generating', current_generation_id: 'g5' });
  const out = await runShotQa(db.admin, t(badFetch), 's5');
  assertEquals(out.state, 'qa_pending');
  assertEquals(db.s.status, 'qa_pending');
  const retry = await runShotQa(db.admin, t(okFetch), 's5');
  assertEquals(retry.state, 'final');
  assertEquals(db.stats.length, 1);
});

Deno.test('final QA persists verdict once; stale claim holder cannot overwrite', async () => {
  const db = fakeDb({ id: 's1', status: 'generating', current_generation_id: 'g1' });
  await runShotQa(db.admin, t(okFetch), 's1');
  const r = await db.admin.rpc('finalize_shot_qa', { _shot_id: 's1', _claim_id: 'c1', _client_ready: false });
  assertEquals(r.data, false);
  assertEquals(db.s.status, 'client_ready');
});

Deno.test('repair flow never calls a paid generation tool', async () => {
  const urls: string[] = [];
  const spy = (async (u: string) => { urls.push(String(u)); return new Response(JSON.stringify(okBody), { status: 200 }); }) as unknown as typeof fetch;
  const db = fakeDb({ id: 's3', status: 'qa_pending', current_generation_id: 'g3' });
  await reconcilePendingShotQa(db.admin, t(spy));
  assertEquals(urls, ['http://x/functions/v1/agent-video-qa']);
  assert(db.calls.every((c) => ['claim_shot_qa', 'fail_shot_qa', 'finalize_shot_qa'].includes(c)));
  const src = await Deno.readTextFile(new URL('./shotQa.ts', import.meta.url));
  assert(!/generate-|retry_shot|reserve_campaign_spend|campaign_ledger_entry|deduct/.test(src.replace(/\/\*\*[\s\S]*?\*\//g, '')));
});

Deno.test('file above analyzer limits -> qa_failed at once (no retry loop)', async () => {
  const big = (async () => new Response(JSON.stringify({ code: 'QA_UNAVAILABLE', reason: 'gateway_rejected_content+fallback_skipped_input_too_large_or_unreachable' }), { status: 502 })) as typeof fetch;
  const db = fakeDb({ id: 's6', status: 'generating', current_generation_id: 'g6' });
  const out = await runShotQa(db.admin, t(big), 's6');
  assertEquals(out.state, 'qa_failed');
  assertEquals(db.stats.length, 0);
});

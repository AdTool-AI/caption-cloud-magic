// Regression: agent turn completion / recovery (campaign 99912862 "weiter" incident).
// Fully mocked: in-memory database, fake model, fake tools. No provider, no wallet.
import { assert, assertEquals } from 'jsr:@std/assert@1';
import { runAgentTurn } from './agentLoop.ts';

type Row = Record<string, unknown>;

/** Minimal chainable stand-in for the Supabase client, enforcing tool_calls NOT NULL. */
function fakeDb() {
  const tables: Record<string, Row[]> = {};
  const t = (n: string) => (tables[n] ??= []);
  let seq = 0;
  // deno-lint-ignore no-explicit-any
  const builder = (name: string): any => {
    let op: 'select' | 'insert' | 'update' | 'upsert' = 'select';
    let payload: Row | Row[] | null = null;
    const filters: Array<(r: Row) => boolean> = [];
    let single = false;
    const run = () => {
      if (op === 'insert' || op === 'upsert') {
        const rows = (Array.isArray(payload) ? payload : [payload!]).map((r) => ({ id: `id-${++seq}`, created_at: new Date(Date.now() + seq).toISOString(), ...r }));
        for (const r of rows) {
          if (name === 'agent_messages' && (r.tool_calls === null || r.tool_calls === undefined)) {
            return { data: null, error: { code: '23502', message: 'null value in column "tool_calls" violates not-null constraint' } };
          }
          if (name === 'agent_planning_jobs' && t(name).some((x) => x.conversation_id === r.conversation_id && ['queued', 'running'].includes(String(x.status ?? 'queued')))) {
            return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } };
          }
        }
        t(name).push(...rows);
        return { data: single ? rows[0] : rows, error: null };
      }
      const hits = t(name).filter((r) => filters.every((f) => f(r)));
      if (op === 'update') { hits.forEach((r) => Object.assign(r, payload)); return { data: hits, error: null, count: hits.length }; }
      return { data: single ? hits[0] ?? null : hits, error: null, count: hits.length };
    };
    const b = {
      select: () => b, order: () => b, limit: () => b, range: () => b, is: () => b, not: () => b, in: () => b, gte: () => b, lt: () => b, or: () => b, neq: () => b,
      eq: (k: string, v: unknown) => { filters.push((r) => r[k] === v); return b; },
      insert: (p: Row | Row[]) => { op = 'insert'; payload = p; return b; },
      upsert: (p: Row | Row[]) => { op = 'upsert'; payload = p; return b; },
      update: (p: Row) => { op = 'update'; payload = p; return b; },
      single: () => { single = true; return b; },
      maybeSingle: () => { single = true; return b; },
      then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(run()).then(res, rej),
    };
    return b;
  };
  return { tables, admin: { from: builder, rpc: () => Promise.resolve({ data: null, error: null }) } };
}

const config = { apiKey: 'k', baseUrl: 'https://mock.local', model: 'm', maxToolIterations: 12, maxRegenerations: 0, maxTurnSpend: 0 };
const usage = { input: 10, output: 5 };
const toolCall = (name: string, i: number) => ({ id: `c${i}`, call_id: `call-${i}`, name, arguments: '{}' });

function base(db: ReturnType<typeof fakeDb>) {
  db.tables.agent_conversations = [{ id: 'conv-1', user_id: 'u1', estimated_ai_cost_usd: 0 }];
  return {
    admin: db.admin, config, userId: 'u1', userJwt: 'j', supabaseUrl: 'https://mock.local', anonKey: 'a',
    conversationId: 'conv-1', message: 'weiter', language: 'de', mode: 'planning' as const, emit: () => undefined,
    // deno-lint-ignore no-explicit-any
    executeTool: (async (_ctx: unknown, name: string) => ({ output: { ok: true, tool: name } })) as any,
  };
}

Deno.test('normal planning turn with several tool calls persists the answer (non-null tool_calls) and survives reload', async () => {
  const db = fakeDb();
  const tools = ['record_research_findings', 'research_business', 'get_campaign'];
  let n = 0;
  // deno-lint-ignore no-explicit-any
  const museRespond = (async () => (n++ < tools.length
    ? { id: `r${n}`, usage, outputText: '', toolCalls: [toolCall(tools[n - 1], n)] }
    : { id: `r${n}`, usage, outputText: 'Planung abgeschlossen.', toolCalls: [] })) as any;
  const out = await runAgentTurn({ ...base(db), museRespond });
  assertEquals(out.answered, true);
  const answers = (db.tables.agent_messages ?? []).filter((m) => m.role === 'assistant');
  assertEquals(answers.length, 1);
  assertEquals(answers[0].content, 'Planung abgeschlossen.');
  assert(answers[0].tool_calls !== null && typeof answers[0].tool_calls === 'object');
  assertEquals((db.tables.agent_planning_jobs ?? []).length, 0);
  // "Reload" = read back from the store.
  assertEquals(db.tables.agent_messages.filter((m) => m.role === 'assistant' && m.content === 'Planung abgeschlossen.').length, 1);
});

Deno.test('time budget stops planning cleanly: status row, one planning job, no duplicate job on a second interruption', async () => {
  const db = fakeDb();
  let clock = 0;
  let n = 0;
  // deno-lint-ignore no-explicit-any
  const museRespond = (async () => { clock += 200_000; n++; return { id: `r${n}`, usage, outputText: '', toolCalls: [toolCall('record_research_findings', n)] }; }) as any;
  const out = await runAgentTurn({ ...base(db), museRespond, now: () => clock, timeBudgetMs: 270_000 });
  assertEquals(out.timeLimitHit, true);
  assertEquals(out.stepLimitHit, true);
  const rows = db.tables.agent_messages.filter((m) => m.role === 'assistant');
  assertEquals(rows.length, 1);
  // deno-lint-ignore no-explicit-any
  assertEquals((rows[0].tool_calls as any).turn_status, 'time_limit');
  // deno-lint-ignore no-explicit-any
  assert(((rows[0].tool_calls as any).completed_tools as string[]).includes('record_research_findings'));
  assert(String(rows[0].content).includes('Zeitlimit'), String(rows[0].content));
  assertEquals(db.tables.agent_planning_jobs.length, 1);
  assertEquals(db.tables.agent_planning_jobs[0].conversation_id, 'conv-1');
  // Second interrupted turn on the same chat must not create another job.
  clock = 0; n = 0;
  await runAgentTurn({ ...base(db), museRespond, now: () => clock, timeBudgetMs: 270_000 });
  assertEquals(db.tables.agent_planning_jobs.length, 1);
});

Deno.test('a rejected primary save falls back to an explicit interrupted row', async () => {
  const db = fakeDb();
  const realFrom = db.admin.from;
  let rejectOnce = true;
  // deno-lint-ignore no-explicit-any
  (db.admin as any).from = (name: string) => {
    const b = realFrom(name);
    if (name !== 'agent_messages') return b;
    const ins = b.insert;
    b.insert = (p: Row) => (p.role === 'assistant' && rejectOnce ? (rejectOnce = false, ins({ ...p, tool_calls: null })) : ins(p));
    return b;
  };
  // deno-lint-ignore no-explicit-any
  const museRespond = (async () => ({ id: 'r', usage, outputText: 'Antwort', toolCalls: [] })) as any;
  await runAgentTurn({ ...base(db), museRespond });
  const rows = db.tables.agent_messages.filter((m) => m.role === 'assistant');
  assertEquals(rows.length, 1);
  // deno-lint-ignore no-explicit-any
  assertEquals((rows[0].tool_calls as any).turn_status, 'interrupted');
});

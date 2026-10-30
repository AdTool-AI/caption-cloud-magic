// Café Buur loop regression: explicit quote / approval-request commands must run
// as normal turns, questions stay read-only, and the approval gate is unchanged.
import { assert, assertEquals } from 'jsr:@std/assert@1';
import { decideTurnMode, deferredToNextTurn, detectActionIntent, guardToolCall } from './turnPolicy.ts';
import { runAgentTurn } from './agentLoop.ts';

const mode = (m: string, extra: Record<string, unknown> = {}) => decideTurnMode({ message: m, ...extra });

Deno.test('exact Café Buur phrases', () => {
  assertEquals(mode('Video 1 Retries neu quoten').mode, 'normal');
  assertEquals(mode('Retry-Freigabe für Video 1 anfordern').mode, 'normal');
  assertEquals(mode('Was kosten die Retries für Video 1?').mode, 'read_only');
  assertEquals(mode('Zeige mir den gespeicherten Retry-Plan').mode, 'read_only');
});

Deno.test('quote / approval-request vocabulary in DE/EN/ES is normal', () => {
  for (const m of ['neu quoten', 'Retries quoten', 'Retry-Freigabe anfordern', 'Freigabe anfordern', 'Quote erstellen', 'Budgetfreigabe anfordern', 'neue Retry-Quote erstellen',
    'quote the retries for video 1', 'request retry approval for video 1', 'create a retry quote', 'request approval',
    'cotiza los reintentos del video 1', 'solicita la aprobación del reintento', 'crea una cotización de reintento']) {
    assertEquals(mode(m).mode, 'normal', m);
    assert(detectActionIntent(m), m);
  }
});

Deno.test('questions and negations stay read-only', () => {
  for (const m of ['Wie viel würde eine Freigabe anfordern kosten?', 'nichts starten, keine Freigabe anfordern', 'What would a retry quote cost?', '¿Cuánto cuesta el reintento?']) {
    assertEquals(mode(m).mode, 'read_only', m);
  }
  assertEquals(mode('Retry-Freigabe anfordern', { clientReadOnly: true }).mode, 'read_only');
});

Deno.test('handoff: explicit action after a deferring/interrupted turn stays normal; "weiter" stays at most planning', () => {
  const deferral = 'Das kann ich in diesem Turn nicht. Bitte frag im nächsten Turn erneut nach der Freigabe.';
  assert(deferredToNextTurn(deferral));
  assert(deferredToNextTurn('Please ask in the next turn.'));
  const d = mode('Retry-Freigabe für Video 1 anfordern', { priorAssistantMessage: deferral, priorUserMessages: ['Video 1 Retries neu quoten'] });
  assertEquals(d.mode, 'normal');
  assertEquals(d.repeatedIntent, true);
  assertEquals(mode('Freigabe anfordern', { priorTurnStatus: 'interrupted' }).repeatedIntent, true);
  const w = mode('weiter', { priorAssistantMessage: deferral, priorUserMessages: ['Retry-Freigabe anfordern'] });
  assert(w.mode !== 'normal');
});

Deno.test('repeated same intent sets the anti-loop flag', () => {
  assertEquals(mode('Freigabe anfordern', { priorUserMessages: ['Retry-Freigabe für Video 1 anfordern'] }).repeatedIntent, true);
  assertEquals(mode('Freigabe anfordern', { priorUserMessages: ['Was kostet das?'] }).repeatedIntent, false);
});

Deno.test('approval gate unchanged: retry tools blocked outside normal mode', () => {
  for (const t of ['prepare_shot_retry', 'request_retry_approval', 'retry_shot']) {
    assert(guardToolCall('read_only', t));
    assert(guardToolCall('planning', t));
  }
});

// ---- Integration: the Video 1 flow with a mocked model + tool dispatcher. ----
type Row = Record<string, unknown>;
function fakeDb() {
  const tables: Record<string, Row[]> = { agent_conversations: [{ id: 'conv-1', user_id: 'u1', estimated_ai_cost_usd: 0 }] };
  let seq = 0;
  // deno-lint-ignore no-explicit-any
  const builder = (name: string): any => {
    let op = 'select'; let payload: Row | Row[] | null = null; let single = false;
    const filters: Array<(r: Row) => boolean> = [];
    const run = () => {
      const t = (tables[name] ??= []);
      if (op === 'insert' || op === 'upsert') {
        const rows = (Array.isArray(payload) ? payload : [payload!]).map((r) => ({ id: `id-${++seq}`, created_at: new Date(Date.now() + seq).toISOString(), ...r }));
        t.push(...rows); return { data: single ? rows[0] : rows, error: null };
      }
      const hits = t.filter((r) => filters.every((f) => f(r)));
      if (op === 'update') { hits.forEach((r) => Object.assign(r, payload)); return { data: hits, error: null }; }
      return { data: single ? hits[0] ?? null : hits, error: null };
    };
    const b = {
      select: () => b, order: () => b, limit: () => b, range: () => b, is: () => b, not: () => b, in: () => b, gte: () => b, lt: () => b, or: () => b, neq: () => b,
      eq: (k: string, v: unknown) => { filters.push((r) => r[k] === v); return b; },
      insert: (p: Row) => { op = 'insert'; payload = p; return b; }, upsert: (p: Row) => { op = 'upsert'; payload = p; return b; },
      update: (p: Row) => { op = 'update'; payload = p; return b; },
      single: () => { single = true; return b; }, maybeSingle: () => { single = true; return b; },
      then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(run()).then(res, rej),
    };
    return b;
  };
  return { tables, admin: { from: builder, rpc: () => Promise.resolve({ data: null, error: null }) } };
}

Deno.test('Video 1 flow: quote → prepare_shot_retry, approval request → request_retry_approval, no retry_shot, no "weiter"', async () => {
  const db = fakeDb();
  const executed: string[] = [];
  const approvals: Row[] = [];
  // deno-lint-ignore no-explicit-any
  const executeTool = (async (_c: unknown, name: string) => {
    executed.push(name);
    if (name === 'prepare_shot_retry') return { output: { ok: true, retry_plans: 5, price_source: 'videoPricingCatalog' } };
    if (name === 'request_retry_approval') { approvals.push({ status: 'pending' }); return { output: { ok: true, approval_status: 'pending' } }; }
    return { output: { error: 'unexpected', code: 'X' } };
  }) as any;
  const turn = async (message: string, tool: string, priorUserMessages: string[]) => {
    const decision = decideTurnMode({ message, priorUserMessages });
    assertEquals(decision.mode, 'normal');
    let n = 0;
    // deno-lint-ignore no-explicit-any
    const museRespond = (async () => (n++ === 0
      ? { id: `r${n}`, usage: { input: 1, output: 1 }, outputText: '', toolCalls: [{ id: 'c', call_id: `call-${tool}`, name: tool, arguments: '{"video_index":1}' }] }
      : { id: `r${n}`, usage: { input: 1, output: 1 }, outputText: 'Erledigt.', toolCalls: [] })) as any;
    await runAgentTurn({
      admin: db.admin, config: { apiKey: 'k', baseUrl: 'https://mock.local', model: 'm', maxToolIterations: 12, maxRegenerations: 0, maxTurnSpend: 0 },
      userId: 'u1', userJwt: 'j', supabaseUrl: 'https://mock.local', anonKey: 'a', conversationId: 'conv-1', message, language: 'de',
      mode: decision.mode, repeatedIntent: decision.repeatedIntent, emit: () => undefined, museRespond, executeTool,
    // deno-lint-ignore no-explicit-any
    } as any);
  };
  await turn('Video 1 Retries neu quoten', 'prepare_shot_retry', []);
  await turn('Retry-Freigabe für Video 1 anfordern', 'request_retry_approval', ['Video 1 Retries neu quoten']);
  assertEquals(executed, ['prepare_shot_retry', 'request_retry_approval']);
  assertEquals(approvals.map((a) => a.status), ['pending']);
  assert(!executed.includes('retry_shot'));
});

Deno.test('anti-loop: repeated intent + "ask again" answer without a tool is replaced by a blocking error', async () => {
  const db = fakeDb();
  // deno-lint-ignore no-explicit-any
  const museRespond = (async () => ({ id: 'r', usage: { input: 1, output: 1 }, outputText: 'Bitte frag im nächsten Turn erneut.', toolCalls: [] })) as any;
  await runAgentTurn({
    admin: db.admin, config: { apiKey: 'k', baseUrl: 'https://mock.local', model: 'm', maxToolIterations: 12, maxRegenerations: 0, maxTurnSpend: 0 },
    userId: 'u1', userJwt: 'j', supabaseUrl: 'https://mock.local', anonKey: 'a', conversationId: 'conv-1', message: 'Freigabe anfordern', language: 'de',
    mode: 'normal', repeatedIntent: true, emit: () => undefined, museRespond,
  // deno-lint-ignore no-explicit-any
  } as any);
  const a = (db.tables.agent_messages ?? []).filter((m) => m.role === 'assistant');
  assertEquals(a.length, 1);
  assert(String(a[0].content).includes('ANTI_LOOP_NO_TOOL'));
});

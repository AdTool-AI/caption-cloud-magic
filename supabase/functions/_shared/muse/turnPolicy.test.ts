import { assert, assertEquals } from 'jsr:@std/assert@1';
import { classifyReadOnly, guardToolCall, READ_ONLY_TOOLS, requestFingerprint, resolveTurnMode } from './turnPolicy.ts';
import { MUSE_TOOL_DEFINITIONS } from './tools.ts';
import { executeMuseTool, type ToolContext } from './toolRuntime.ts';

const STATUS_QUESTIONS = [
  'Was ist der aktuelle Stand von S2?',
  'Was würde ein einzelner Retry von S2 kosten und brauche ich dafür eine neue Freigabe?',
  'Zeig mir den Retry-Plan für S2.',
  'Status of shot 2 please',
  'How much would a retry of S2 cost?',
  'Nur lesen: welche QA-Probleme hatte S2? Bitte nichts starten und nichts generieren.',
  '¿Cuánto costaría reintentar la toma 2?',
];
const ACTIONS = [
  'Starte den Retry für S2.',
  'Generiere S2 neu mit Seedance.',
  'Please start production now',
  'Go ahead and retry S2',
  'Erstelle eine neue Freigabe für S2',
  'Kannst du S2 neu generieren?',
  'Inicia la producción',
];

Deno.test('status questions are read-only on the server', () => {
  for (const q of STATUS_QUESTIONS) assert(classifyReadOnly(q), `should be read-only: ${q}`);
});
Deno.test('explicit action requests are not read-only', () => {
  for (const q of ACTIONS) assert(!classifyReadOnly(q), `should be normal: ${q}`);
});
Deno.test('a missing or manipulated client flag cannot turn read-only off', () => {
  for (const q of STATUS_QUESTIONS) {
    assertEquals(resolveTurnMode({ message: q }), 'read_only');
    assertEquals(resolveTurnMode({ message: q, clientReadOnly: false }), 'read_only');
    assertEquals(resolveTurnMode({ message: q, clientReadOnly: 'false' }), 'read_only');
    assertEquals(resolveTurnMode({ message: q, clientReadOnly: 0 }), 'read_only');
  }
  // The flag can only switch read-only ON.
  assertEquals(resolveTurnMode({ message: 'Starte den Retry für S2.', clientReadOnly: true }), 'read_only');
  assertEquals(resolveTurnMode({ message: 'Starte den Retry für S2.', clientReadOnly: 'yes' }), 'normal');
});
Deno.test('read-only allows only reading tools; every other tool is blocked', () => {
  const all = MUSE_TOOL_DEFINITIONS.map((t) => t.name);
  for (const name of all) {
    const g = guardToolCall('read_only', name);
    if (READ_ONLY_TOOLS.has(name)) assertEquals(g, null, name);
    else assertEquals(g?.code, 'READ_ONLY_TURN', name);
  }
  for (const paid of ['generate_video', 'regenerate_video', 'start_campaign_production', 'retry_shot', 'estimate_video_cost', 'estimate_campaign_budget', 'request_retry_approval', 'prepare_shot_retry']) {
    assertEquals(guardToolCall('read_only', paid)?.code, 'READ_ONLY_TURN', paid);
  }
  assertEquals(guardToolCall('normal', 'retry_shot'), null);
});
Deno.test('executeMuseTool refuses blocked tools before touching the database or provider', async () => {
  let touched = 0;
  const admin = new Proxy({}, { get: () => { touched++; throw new Error('database must not be touched'); } });
  const ctx = {
    userId: 'u', conversationId: 'c', admin, userJwt: 'j', supabaseUrl: 'https://mock.local', anonKey: 'a',
    museConfig: { apiKey: '', baseUrl: '', model: '', maxToolIterations: 0, maxRegenerations: 0, maxTurnSpend: 0 },
    regenerationsUsed: 0, maxRegenerations: 0, maxTurnSpend: 0, spentThisTurn: 0, turnMode: 'read_only',
    fetchImpl: () => { throw new Error('provider must not be called'); },
  } as unknown as ToolContext;
  for (const name of ['generate_video', 'retry_shot', 'start_campaign_production', 'estimate_campaign_budget', 'request_retry_approval']) {
    const r = await executeMuseTool(ctx, name, { shot_id: 'x' });
    assertEquals(r.output.code, 'READ_ONLY_TURN');
  }
  assertEquals(touched, 0);
});
Deno.test('request fingerprint differs for different content and conversation', async () => {
  const a = await requestFingerprint('c1', 'hello');
  assertEquals(a, await requestFingerprint('c1', 'hello'));
  assert(a !== await requestFingerprint('c1', 'hello!'));
  assert(a !== await requestFingerprint('c2', 'hello'));
});

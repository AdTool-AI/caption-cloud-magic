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

// ---- Planning mode + continuations ----------------------------------------
import { decideTurnMode, isContinuation, PLANNING_FORBIDDEN, PLANNING_TOOLS, PLANNING_TOOL_AUDIT } from './turnPolicy.ts';

const CORDIAL_ORDER = 'Starte eine neue, eigenständige Testkampagne für CORDIAL – we are cables. Übernimm keine Inhalte, Assets oder Freigaben aus Café Buur. Ziel: Ein hochwertiges 30-Sekunden-Video. Recherche, Planung und Speichern sind erlaubt. Keine Mediengenerierung, keine Produktionsjobs, keine Retries, keine Budgetfreigaben, keine Wallet-Abbuchungen.';

Deno.test('continuations are recognized in EN/DE/ES', () => {
  for (const m of ['weiter', 'Weiter!', 'weiter mit Planung speichern', 'continue', 'go on', 'sigue', 'continúa por favor', 'ok weiter']) assert(isContinuation(m), m);
  for (const m of ['Was ist der Stand?', 'Starte die Produktion', 'Weiterhin keine Retries starten und den Plan bitte vollständig speichern, inklusive aller Shots und Fakten mit Quellen und der Zielgruppe für die Kampagne.']) assert(!isContinuation(m), m);
});
Deno.test('"weiter" after a planning order runs as planning (CORDIAL regression)', () => {
  assertEquals(decideTurnMode({ message: CORDIAL_ORDER }).mode, 'planning');
  assertEquals(decideTurnMode({ message: 'weiter', priorUserMessages: [CORDIAL_ORDER] }).mode, 'planning');
  assertEquals(decideTurnMode({ message: 'weiter', priorUserMessages: ['weiter', CORDIAL_ORDER] }).mode, 'planning');
  assertEquals(decideTurnMode({ message: 'weiter mit Planung speichern', priorUserMessages: [CORDIAL_ORDER] }).mode, 'planning');
});
Deno.test('"weiter" after a status question stays read-only', () => {
  assertEquals(decideTurnMode({ message: 'weiter', priorUserMessages: ['Was ist der aktuelle Stand von S2?'] }).mode, 'read_only');
});
Deno.test('"weiter" after a production / retry order is capped at planning', () => {
  for (const p of ['Starte die Produktion für Video 1.', 'Starte den Retry für S2.', 'Generiere S2 neu mit Seedance.', 'Please start production now']) {
    const d = decideTurnMode({ message: 'weiter', priorUserMessages: [p] });
    assertEquals(d.mode, 'planning', p);
    assert(d.mode !== 'normal');
  }
});
Deno.test('"weiter" without context stays read-only and asks', () => {
  const d = decideTurnMode({ message: 'weiter', priorUserMessages: [] });
  assertEquals(d.mode, 'read_only');
  assertEquals(d.needsClarification, true);
});
Deno.test('explicit status question after a planning order stays read-only', () => {
  assertEquals(decideTurnMode({ message: 'Was ist der aktuelle Stand der Kampagne?', priorUserMessages: [CORDIAL_ORDER] }).mode, 'read_only');
  assertEquals(decideTurnMode({ message: 'Zeig mir den Status von S2.', priorUserMessages: [CORDIAL_ORDER] }).mode, 'read_only');
});
Deno.test('client flag can only lower the mode', () => {
  assertEquals(decideTurnMode({ message: 'weiter', clientReadOnly: true, priorUserMessages: [CORDIAL_ORDER] }).mode, 'read_only');
  assertEquals(decideTurnMode({ message: 'Was ist der Stand?', clientReadOnly: false, priorUserMessages: [CORDIAL_ORDER] }).mode, 'read_only');
  assertEquals(decideTurnMode({ message: 'weiter', clientReadOnly: 'normal' as unknown, priorUserMessages: ['Starte den Retry für S2.'] }).mode, 'planning');
});
Deno.test('planning list is explicit and excludes every paid / approval / production tool', () => {
  const defined = new Set(MUSE_TOOL_DEFINITIONS.map((t) => t.name));
  for (const name of PLANNING_TOOLS) {
    assert(defined.has(name), `unknown planning tool ${name}`);
    assert(PLANNING_TOOL_AUDIT[name].writes.length > 0 && PLANNING_TOOL_AUDIT[name].internalCost.length > 0);
  }
  for (const name of PLANNING_FORBIDDEN) {
    assert(!PLANNING_TOOLS.has(name), name);
    assertEquals(guardToolCall('planning', name)?.code, 'PLANNING_TURN', name);
  }
  for (const name of defined) {
    if (!PLANNING_TOOLS.has(name)) assertEquals(guardToolCall('planning', name)?.code, 'PLANNING_TURN', name);
  }
  assert(/generat|retry|approv|budget|production|regenerat/i.test(PLANNING_FORBIDDEN.join(' ')));
});
Deno.test('planning turn refuses paid tools before touching the database or provider', async () => {
  let touched = 0;
  const admin = new Proxy({}, { get: () => { touched++; throw new Error('database must not be touched'); } });
  const ctx = {
    userId: 'u', conversationId: 'c', admin, userJwt: 'j', supabaseUrl: 'https://mock.local', anonKey: 'a',
    museConfig: { apiKey: '', baseUrl: '', model: '', maxToolIterations: 0, maxRegenerations: 0, maxTurnSpend: 0 },
    regenerationsUsed: 0, maxRegenerations: 0, maxTurnSpend: 0, spentThisTurn: 0, turnMode: 'planning',
    fetchImpl: () => { throw new Error('provider must not be called'); },
  } as unknown as ToolContext;
  for (const name of PLANNING_FORBIDDEN) {
    const r = await executeMuseTool(ctx, name, { shot_id: 'x', campaign_id: 'x' });
    assertEquals(r.output.code, 'PLANNING_TURN', name);
  }
  assertEquals(touched, 0);
});

Deno.test('save/complete/route commands are planning, not read-only', () => {
  for (const m of ['weiter: Website und Zielgruppe ergänzen, gespeicherte Planung per get_campaign prüfen, Shots routen und die USD-Kostenschätzung nennen', 'Speichere die Planung.', 'Bitte die Website ergänzen.', 'Update the audience and save the plan']) {
    assertEquals(decideTurnMode({ message: m }).mode, 'planning', m);
  }
  // A save word next to a production word stays normal (approval-gated), never planning.
  assertEquals(decideTurnMode({ message: 'Speichere den Plan und starte die Produktion' }).mode, 'normal');
});

Deno.test('asksToContinue: detects hand-back, ignores normal text', async () => {
  const { asksToContinue } = await import('./turnPolicy.ts');
  if (!asksToContinue('Offen: 3. zweites Routing – bitte mit „weiter“ fortfahren.')) throw new Error('de');
  if (!asksToContinue('Reply with "continue" to proceed.')) throw new Error('en');
  if (asksToContinue('Alle 6 Shots sind gespeichert. Die Kosten liegen bei 9,10 USD.')) throw new Error('fp');
});

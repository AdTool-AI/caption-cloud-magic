// Chat/workspace assembly approval: one execution path, explicit UI action only.
import { assert, assertEquals, assertRejects } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { prepareAssembly, rejectAssembly, startAssembly, startAssemblyAndDispatch, tickAssembly } from './assembly.ts';
import { getSpot, saveEdit } from './spotRuntime.ts';
import { setup } from './spotTestKit.ts';
import { decideTurnMode, PLANNING_TOOLS, READ_ONLY_TOOLS } from '../turnPolicy.ts';
import { SPOT_TOOL_DEFINITIONS } from './spotTools.ts';

const params = {
  branding_mode: 'text_only',
  voiceover: { text: 'Kräftig gewürzt.', voice_id: 'voice-de', language: 'de', start: 0.5 },
  music: { prompt: 'warm acoustic', tier: 'minimax-15' },
  sfx: { prompt: 'pan sizzle', start: 0, duration: 2 },
};
async function ready() {
  const s = setup();
  await getSpot(s.ctx, 'v1');
  await saveEdit(s.ctx, 'v1', { endcard: { headline: 'CORDIAL', cta: 'Jetzt ansehen', duration: 3 } }, null);
  const p = await prepareAssembly(s.ctx, 'v1', params, 'agent');
  return { ...s, id: p.assembly_id, prep: p };
}

Deno.test('prepare returns full card data, no shot regeneration', async () => {
  const { prep } = await ready();
  assertEquals(prep.card.branding_mode, 'text_only');
  assertEquals(prep.card.voice.voice_id, 'voice-de');
  assertEquals(prep.card.regenerates_shots, false);
  assertEquals(prep.steps.length, 10);
  assert(Number.isInteger(prep.card.edit_revision));
});

Deno.test('chat and workspace start the SAME row via the same function', async () => {
  const { ctx, tables, id } = await ready();
  const src = await Deno.readTextFile(new URL('../../../campaign-spot/index.ts', import.meta.url));
  assertEquals(src.match(/startAssemblyAndDispatch\(/g)?.length, 1); // one execution path in the backend
  const ui = await Deno.readTextFile(new URL('../../../../../src/services/muse/assemblyClient.ts', import.meta.url));
  assert(ui.includes("'start_assembly'"));
  const r = await startAssembly(ctx, id);
  assertEquals(r.assembly_id, id);
  assertEquals(tables.campaign_assembly_jobs.filter((j) => j.status === 'running').length, 1);
});

Deno.test('concurrent double click: exactly one claim and exactly one worker dispatch', async () => {
  const { ctx, tables, id } = await ready();
  let dispatches = 0;
  const res = await Promise.allSettled([
    startAssemblyAndDispatch(ctx, id, () => { dispatches++; }),
    startAssemblyAndDispatch(ctx, id, () => { dispatches++; }),
    startAssemblyAndDispatch(ctx, id, () => { dispatches++; }),
  ]);
  assertEquals(res.filter((r) => r.status === 'fulfilled').length, 1);
  assertEquals(dispatches, 1);
  assertEquals(tables.campaign_assembly_jobs.filter((j) => j.status === 'running').length, 1);
  await assertRejects(() => startAssembly(ctx, id)); // once only
  assertEquals((tables.campaign_post_actions ?? []).length, 0);
});

Deno.test('text messages cannot approve or start: no tool reaches start/reject in any mode', () => {
  const all = [...SPOT_TOOL_DEFINITIONS.map((t) => t.name), ...READ_ONLY_TOOLS, ...PLANNING_TOOLS];
  for (const n of all) assert(!/(start|approve|reject).*assembl|assembl.*(start|approve|reject)/.test(n), n);
  for (const m of ['weiter', 'ok', 'continue', 'start', 'starte die Montage']) decideTurnMode({ message: m, priorUserMessages: ['prepare_spot_assembly'] });
});

Deno.test('text cannot start: no agent code path calls startAssembly or the claim RPC', async () => {
  const dir = new URL('../', import.meta.url);
  const offenders: string[] = [];
  async function walk(u: URL) {
    for await (const e of Deno.readDir(u)) {
      const c = new URL(e.name + (e.isDirectory ? '/' : ''), u);
      if (e.isDirectory) { await walk(c); continue; }
      if (!e.name.endsWith('.ts') || e.name.endsWith('.test.ts') || e.name === 'assembly.ts' || e.name === 'spotTestKit.ts') continue;
      const s = await Deno.readTextFile(c);
      if (/startAssembly|start_assembly_job|rejectAssembly/.test(s)) offenders.push(c.pathname);
    }
  }
  await walk(dir);
  const agent = await Deno.readTextFile(new URL('../../../muse-agent/index.ts', import.meta.url));
  if (/startAssembly|start_assembly/.test(agent)) offenders.push('muse-agent');
  assertEquals(offenders, []);
});

Deno.test('stale edit revision blocks start BEFORE claim; row stays pending', async () => {
  const { ctx, tables, id } = await ready();
  await saveEdit(ctx, 'v1', { overlays: [{ id: 'x', text: 'neu', start: 1, end: 2 }] }, null);
  const e = await assertRejects(() => startAssembly(ctx, id));
  assertEquals((e as { code: string }).code, 'EDIT_CHANGED');
  assertEquals(tables.campaign_assembly_jobs[0].status, 'pending');
});

Deno.test('cost/scope fingerprint mismatch blocks start BEFORE claim', async () => {
  const { ctx, tables, id, calls } = await ready();
  tables.campaign_assembly_jobs[0].scope = { ...tables.campaign_assembly_jobs[0].scope, tampered: { wallet_usd_max: 99 } };
  const e = await assertRejects(() => startAssembly(ctx, id));
  assertEquals((e as { code: string }).code, 'SCOPE_MISMATCH');
  assertEquals(tables.campaign_assembly_jobs[0].status, 'pending');
  assertEquals(calls.length, 0);
});

Deno.test('reject: rejected_at set, zero provider calls, cannot start afterwards', async () => {
  const { ctx, tables, id, calls } = await ready();
  const r = await rejectAssembly(ctx, id);
  assertEquals(r.status, 'rejected');
  assert(tables.campaign_assembly_jobs[0].rejected_at);
  await assertRejects(() => startAssembly(ctx, id));
  await assertRejects(() => rejectAssembly(ctx, id));
  assertEquals((await tickAssembly(ctx, id, Date.now() + 5000)).status, 'rejected');
  assertEquals(calls.length, 0);
  assertEquals((tables.campaign_post_actions ?? []).length, 0);
});

Deno.test('other user cannot start or reject', async () => {
  const { ctx, id } = await ready();
  const other = { ...ctx, userId: 'user-2' };
  await assertRejects(() => startAssembly(other, id));
  await assertRejects(() => rejectAssembly(other, id));
});

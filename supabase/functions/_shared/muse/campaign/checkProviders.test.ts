import { assert, assertEquals } from 'jsr:@std/assert@1';
import { createCheckProviders as providerFactory, MAX_INLINE_VIDEO_BYTES, MAX_STILLS } from './checkProviders.ts';
import { judgeFrames, planFrameProbes } from './frameCheck.ts';
import { parseSpotQa } from './spotQa.ts';
import type { SpotEdit } from './spot.ts';

const createCheckProviders = (deps: Omit<Parameters<typeof providerFactory>[0], 'baseUrl' | 'model'>) =>
  providerFactory({ baseUrl: 'https://qa.example.test/v1', model: 'test/vision', ...deps });

const edit = { aspect: '9:16', branding_mode: 'text_only', clips: [{ trim_in: 0, trim_out: 30 }], overlays: [{ id: 'ov-1', text: 'Frisch aus der Pfanne', start: 19, end: 21.5 }], endcard: { duration: 3, headline: 'Café Buur', cta: 'Komm vorbei' }, logo: { url: 'x', width: 100, height: 50 } } as unknown as SpotEdit;

function gw(answer: string, calls: unknown[]) {
  return (async (_u: string, init: RequestInit) => { calls.push(JSON.parse(String(init.body))); return new Response(JSON.stringify({ choices: [{ message: { content: answer } }], usage: { prompt_tokens: 900, completion_tokens: 40, total_tokens: 940 } }), { headers: { 'x-request-id': 'run-1' } }); }) as typeof fetch;
}
const still = (frames: number[]) => async (_v: string, _t: number, f: number) => { frames.push(f); return new Uint8Array([0x89, 1, 2]); };

Deno.test('step 9: stills from the export at overlay/endcard midpoints, no logo in text_only, one batched read', async () => {
  const frames: number[] = []; const calls: unknown[] = [];
  const p = createCheckProviders({ apiKey: 'k', renderStill: still(frames), fetchImpl: gw('{"frames":[{"id":"ov-1","text":"FRISCH AUS DER PFANNE"},{"id":"endcard","text":"Café Buur"}]}', calls) });
  const probes = planFrameProbes(edit);
  assertEquals(probes.map((x) => x.kind), ['text', 'endcard']);
  const fc = judgeFrames(3, probes, await p.observeFrames('https://x/export.mp4', probes, null));
  assertEquals(frames, [608, 855]);
  assertEquals(calls.length, 1);
  assertEquals(fc.items[0].status, 'visible'); assertEquals(fc.items[0].observed, 'FRISCH AUS DER PFANNE');
  assertEquals(fc.items[1].status, 'not_visible'); // CTA missing => fails
  assertEquals(fc.passed, false);
  const u = p.usage(); assertEquals(u[0].total_tokens, 940); assertEquals(u[0].run_id, 'run-1'); assertEquals(p.usage().length, 0);
});

Deno.test('step 9: failed still => not_checkable, never visible; capped stills', async () => {
  const calls: unknown[] = [];
  const p = createCheckProviders({ apiKey: 'k', renderStill: async () => { throw new Error('lambda'); }, fetchImpl: gw('{}', calls) });
  const probes = planFrameProbes(edit);
  const fc = judgeFrames(3, probes, await p.observeFrames('u', probes, null));
  assert(fc.items.every((i) => i.status === 'not_checkable')); assertEquals(calls.length, 0); assertEquals(fc.passed, false);
  const many = Array.from({ length: 20 }, (_, i) => ({ element_id: `o${i}`, kind: 'text' as const, t: i, expected: 'a' }));
  const fr: number[] = [];
  await createCheckProviders({ apiKey: 'k', renderStill: still(fr), fetchImpl: gw('{"frames":[]}', []) }).observeFrames('u', many, null);
  assertEquals(fr.length, MAX_STILLS);
});

const media = (n = 4) => async () => new Response(new Uint8Array(n).fill(7), { headers: { 'content-length': String(n) } });

Deno.test('step 10: video sent inline as data:video/mp4 (never a plain .mp4 link), structured result, usage stored', async () => {
  const calls: any[] = [];
  const p = createCheckProviders({ apiKey: 'k', renderStill: still([]), mediaFetch: media(), fetchImpl: gw('{"score":6,"verdict":"needs_work","issues":[{"category":"subtitle","severity":"medium","at_s":12,"detail":"late"},{"category":"audio","severity":"low","at_s":null,"detail":"music loud"},{"category":"visual","severity":"high","at_s":4,"detail":"morph"}],"audio":{"present":true,"balance":"music slightly loud"},"summary":"s","recommendation":"fix shots"}', calls) });
  const qa = parseSpotQa(await p.analyzeSpot('https://x/export.mp4', 'prompt'));
  assertEquals(calls.length, 1);
  const url: string = calls[0].messages[0].content[1].image_url.url;
  assert(url.startsWith('data:video/mp4;base64,')); assert(!/^https?:/.test(url));
  assertEquals(qa.text_branding_issues.length, 1); assertEquals(qa.audio_issues.length, 1); assertEquals(qa.recommendation, 'fix shots'); assertEquals(qa.audio.present, true);
  assertEquals(p.usage()[0].call, 'spot_ai_qa');
});

Deno.test('step 10 regression: gateway 400 "invalid argument" fails with CHECK_GATEWAY_400, once, shape logged without secrets', async () => {
  let n = 0; const logs: string[] = []; const orig = console.warn; console.warn = (s: string) => logs.push(s);
  try {
    const bad = createCheckProviders({ apiKey: 'SECRETKEY', renderStill: still([]), mediaFetch: media(), fetchImpl: (async () => { n++; return new Response('{"error":{"message":"Request contains an invalid argument.","type":"upstream_error"}}', { status: 400 }); }) as typeof fetch });
    let err = ''; try { await bad.analyzeSpot('https://x/export.mp4', 'p'); } catch (e) { err = (e as Error).message; }
    assert(err.startsWith('CHECK_GATEWAY_400')); assertEquals(n, 1);
    const log = logs.join('\n'); assert(log.includes('"kind":"data_url"')); assert(log.includes('video/mp4'));
    assert(!log.includes('SECRETKEY')); assert(!log.includes('BwcH'));
  } finally { console.warn = orig; }
});

Deno.test('step 10: oversized export => CHECK_INPUT_TOO_LARGE with zero gateway calls; 402 still throws', async () => {
  let n = 0;
  const big = createCheckProviders({ apiKey: 'k', renderStill: still([]), mediaFetch: async () => new Response('x', { headers: { 'content-length': String(MAX_INLINE_VIDEO_BYTES + 1) } }), fetchImpl: (async () => { n++; return new Response('{}'); }) as typeof fetch });
  let err = ''; try { await big.analyzeSpot('https://x/e.mp4', 'p'); } catch (e) { err = (e as Error).message; }
  assert(err.startsWith('CHECK_INPUT_TOO_LARGE')); assertEquals(n, 0);
  const bad = createCheckProviders({ apiKey: 'k', renderStill: still([]), mediaFetch: media(), fetchImpl: (async () => new Response('no', { status: 402 })) as typeof fetch });
  err = ''; try { await bad.analyzeSpot('u', 'p'); } catch (e) { err = (e as Error).message; }
  assert(err.startsWith('CHECK_GATEWAY_402'));
});

Deno.test('step 9 payload unchanged: stills stay data:image parts', async () => {
  const calls: any[] = [];
  await createCheckProviders({ apiKey: 'k', renderStill: still([]), fetchImpl: gw('{"frames":[]}', calls) }).observeFrames('u', planFrameProbes(edit), null);
  assert(calls[0].messages[0].content.filter((c: any) => c.type === 'image_url').every((c: any) => c.image_url.url.startsWith('data:image/png;base64,')));
});

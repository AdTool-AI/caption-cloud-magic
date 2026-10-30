import { assert, assertEquals } from 'jsr:@std/assert@1';
import { buildTurnDigest } from './agentLoop.ts';

Deno.test('digest is bounded and empty for no history', () => {
  assertEquals(buildTurnDigest([]), '');
  const long = 'x'.repeat(5000);
  const d = buildTurnDigest([{ role: 'user', content: long }, { role: 'assistant', content: 'ok' }]);
  assert(d.length < 1000);
  assert(d.includes('Agent: ok'));
});

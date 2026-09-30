import { assert, assertEquals } from 'jsr:@std/assert@1';
import { computeSocialCompleteness, handleMatchesCompany, looksBlocked, parseProfileUrl } from './social.ts';

Deno.test('profile URLs vs posts', () => {
  assertEquals(parseProfileUrl('https://www.instagram.com/cafebuur/', 'instagram')?.handle, 'cafebuur');
  assertEquals(parseProfileUrl('https://www.instagram.com/p/ABC/', 'instagram'), null);
  assertEquals(parseProfileUrl('https://www.tiktok.com/@cafe.buur/video/1', 'tiktok')?.url, 'https://www.tiktok.com/@cafe.buur');
  assertEquals(parseProfileUrl('https://www.youtube.com/watch?v=x', 'youtube'), null);
  assertEquals(parseProfileUrl('https://m.facebook.com/cafebuur', 'facebook')?.handle, 'cafebuur');
  assertEquals(parseProfileUrl('https://www.facebook.com/sharer.php', 'facebook'), null);
});

Deno.test('company match rejects unrelated handles', () => {
  assert(handleMatchesCompany('cafe.buur', 'Café Buur'));
  assert(!handleMatchesCompany('bestbrunchkoeln', 'Café Buur'));
});

Deno.test('login walls are not_accessible, not absent', () => {
  assert(looksBlocked(null));
  assert(looksBlocked('Log in to see photos and videos from friends. ' + 'x'.repeat(500)));
  assert(!looksBlocked('Café Buur posts: brunch reel 12k views, pancakes carousel… '.repeat(20)));
});

Deno.test('social_research_complete requires every platform terminal', () => {
  const all = ['instagram', 'tiktok', 'facebook', 'youtube'];
  assert(computeSocialCompleteness(all.map((p, i) => ({ platform: p, status: ['analyzed', 'not_found', 'not_accessible', 'analyzed'][i] }))).complete);
  const r = computeSocialCompleteness([{ platform: 'instagram', status: 'found_not_analyzed' }, { platform: 'tiktok', status: 'not_found' }]);
  assertEquals(r.complete, false);
  assertEquals(r.missing, ['instagram', 'facebook', 'youtube']);
});

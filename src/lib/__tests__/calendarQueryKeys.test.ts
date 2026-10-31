import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { calendarClientsQueryKey, calendarEventsQueryKey, calendarMembersQueryKey } from '../calendarQueryKeys';
describe('private calendar cache ownership', () => {
  it('does not reuse fresh event rows for another account in the same workspace', async () => {
    const client = new QueryClient();
    const a = calendarEventsQueryKey('a', 'shared-workspace', '', '');
    const b = calendarEventsQueryKey('b', 'shared-workspace', '', '');
    await client.fetchQuery({ queryKey: a, queryFn: async () => ['private-a'], staleTime: Infinity });
    expect(await client.fetchQuery({ queryKey: b, queryFn: async () => ['private-b'], staleTime: Infinity })).toEqual(['private-b']);
    expect(client.getQueryData(a)).toEqual(['private-a']); client.clear();
  });
  it('keeps a late account-A response out of account-B data', async () => {
    const client = new QueryClient();
    const a = calendarEventsQueryKey('a', 'workspace', '', '');
    const b = calendarEventsQueryKey('b', 'workspace', '', '');
    let resolve!: (rows: string[]) => void;
    const pending = client.fetchQuery({ queryKey: a, queryFn: () => new Promise<string[]>(done => { resolve = done; }) });
    await client.fetchQuery({ queryKey: b, queryFn: async () => ['b'] });
    resolve(['late-a']); await pending; expect(client.getQueryData(b)).toEqual(['b']); client.clear();
  });
  it('isolates client/member caches and signed-out state', () => {
    const client = new QueryClient();
    for (const key of [calendarClientsQueryKey, calendarMembersQueryKey]) {
      client.setQueryData(key('a', 'workspace'), ['private-a']);
      expect(client.getQueryData(key('b', 'workspace'))).toBeUndefined();
      expect(client.getQueryData(key(undefined, 'workspace'))).toBeUndefined();
    }
    client.clear();
  });
  it('updates only the intended filtered optimistic cache', () => {
    const client = new QueryClient();
    const first = calendarEventsQueryKey('a', 'workspace', 'one', 'brand');
    const other = calendarEventsQueryKey('a', 'workspace', 'two', 'brand');
    client.setQueryData(first, ['first']); client.setQueryData(other, ['other']); client.setQueryData(first, ['updated']);
    expect(client.getQueryData(other)).toEqual(['other']); client.clear();
  });
});

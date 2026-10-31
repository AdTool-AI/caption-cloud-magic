import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { usePlannerRequestScope, usePlannerScopedState } from '../usePlannerRequestScope';

function useRows(actor: string | undefined, workspace: string | null) {
  const scope = usePlannerRequestScope(actor, workspace);
  const [rows, setRows] = usePlannerScopedState<string[]>(scope, () => []);
  return { scope, rows, setRows };
}

describe('planner request ownership', () => {
  it('removes previous account rows immediately and ignores late setters', () => {
    const hook = renderHook(({ actor }) => useRows(actor, 'workspace'), { initialProps: { actor: 'a' } });
    act(() => hook.result.current.setRows(['private-a']));
    const old = hook.result.current;
    hook.rerender({ actor: 'b' });
    expect(hook.result.current.rows).toEqual([]);
    act(() => old.setRows(['late-private-a']));
    expect(hook.result.current.rows).toEqual([]);
    act(() => hook.result.current.setRows(['private-b']));
    expect(hook.result.current.rows).toEqual(['private-b']);
  });
  it('fences workspace switches within the same account', () => {
    const hook = renderHook(({ workspace }) => useRows('a', workspace), { initialProps: { workspace: 'one' } });
    act(() => hook.result.current.setRows(['one']));
    const commit = hook.result.current.scope.startRequest('posts');
    hook.rerender({ workspace: 'two' });
    expect(commit()).toBe(false); expect(hook.result.current.rows).toEqual([]);
  });
  it('keeps a request current across ordinary rerenders', () => {
    const hook = renderHook(() => useRows('a', 'one'));
    const commit = hook.result.current.scope.startRequest('posts');
    hook.rerender();
    expect(commit()).toBe(true);
  });
  it('accepts only the newest request in each lane', () => {
    const hook = renderHook(() => useRows('a', 'one'));
    const first = hook.result.current.scope.startRequest('posts');
    const second = hook.result.current.scope.startRequest('posts');
    expect(first()).toBe(false); expect(second()).toBe(true);
  });
  it('does not cancel an independent request lane', () => {
    const hook = renderHook(() => useRows('a', 'one'));
    const posts = hook.result.current.scope.startRequest('posts');
    const templates = hook.result.current.scope.startRequest('templates');
    expect(posts()).toBe(true); expect(templates()).toBe(true);
  });
  it('rejects completions after logout and unmount', () => {
    const hook = renderHook(({ actor }) => useRows(actor, 'one'), { initialProps: { actor: 'a' as string | undefined } });
    const old = hook.result.current.scope.startRequest('posts');
    hook.rerender({ actor: undefined });
    expect(old()).toBe(false); expect(hook.result.current.scope.startRequest('posts')()).toBe(false);
    const scope = hook.result.current.scope;
    hook.unmount(); expect(scope.isCurrent()).toBe(false);
  });
  it('does not resurrect an old request when switching back to the same account', () => {
    const hook = renderHook(({ actor }) => useRows(actor, 'one'), { initialProps: { actor: 'a' } });
    const old = hook.result.current.scope.startRequest('posts');
    hook.rerender({ actor: 'b' }); hook.rerender({ actor: 'a' });
    expect(old()).toBe(false);
  });
  it('applies updater callbacks to the current scope initial state', () => {
    const hook = renderHook(({ actor }) => useRows(actor, 'one'), { initialProps: { actor: 'a' } });
    act(() => hook.result.current.setRows(['a']));
    hook.rerender({ actor: 'b' });
    act(() => hook.result.current.setRows(rows => [...rows, 'b']));
    expect(hook.result.current.rows).toEqual(['b']);
  });
  it('ignores a late promise without erasing newer rows', async () => {
    const hook = renderHook(() => useRows('a', 'one'));
    let resolve!: (value: string[]) => void;
    const deferred = new Promise<string[]>(done => { resolve = done; });
    const old = hook.result.current;
    const canCommit = old.scope.startRequest('posts');
    const pending = deferred.then(rows => { if (canCommit()) old.setRows(rows); });
    hook.result.current.scope.startRequest('posts');
    act(() => hook.result.current.setRows(['newer']));
    await act(async () => { resolve(['older']); await pending; });
    expect(hook.result.current.rows).toEqual(['newer']);
  });
});

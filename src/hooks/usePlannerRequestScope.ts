import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';

/** UI response ownership only; backend JWT/RLS authorization remains authoritative. */
export interface PlannerRequestScope {
  readonly actorId: string | undefined;
  readonly workspaceId: string | null;
  isCurrent(): boolean;
  startRequest(lane: string): () => boolean;
}

export function usePlannerRequestScope(actorId: string | undefined, workspaceId: string | null = null): PlannerRequestScope {
  const current = useRef<PlannerRequestScope | null>(null);
  const mounted = useRef(true);
  const scope = useMemo<PlannerRequestScope>(() => {
    const revisions = new Map<string, number>();
    const value: PlannerRequestScope = {
      actorId, workspaceId,
      isCurrent: () => mounted.current && current.current === value,
      startRequest(lane) {
        const revision = (revisions.get(lane) ?? 0) + 1;
        revisions.set(lane, revision);
        return () => Boolean(actorId) && value.isCurrent() && revisions.get(lane) === revision;
      },
    };
    return value;
  }, [actorId, workspaceId]);
  current.current = scope;
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  return scope;
}

/** Hide previous-scope data during render, before cleanup effects can run. */
export function usePlannerScopedState<T>(scope: PlannerRequestScope, initial: () => T): [T, Dispatch<SetStateAction<T>>] {
  const factory = useRef(initial); factory.current = initial;
  const empty = useMemo(() => factory.current(), [scope]);
  const [record, setRecord] = useState(() => ({ scope, value: empty }));
  const setValue = useCallback<Dispatch<SetStateAction<T>>>(next => {
    if (!scope.isCurrent()) return;
    setRecord(previous => {
      if (!scope.isCurrent()) return previous;
      const value = previous.scope === scope ? previous.value : empty;
      return { scope, value: typeof next === 'function' ? (next as (value: T) => T)(value) : next };
    });
  }, [scope, empty]);
  return [record.scope === scope ? record.value : empty, setValue];
}

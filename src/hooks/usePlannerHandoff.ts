import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { createPlannerHandoffWriter, PlannerHandoffError, type PlannerHandoffSource } from '@/lib/plannerHandoff';

export function usePlannerHandoff(workspaceId: string | null) {
  const { user, session } = useAuth();
  const sessionReady = Boolean(session?.access_token && session.user.id === user?.id);
  const scope = useMemo(() => ({ actor: user?.id, workspaceId, sessionReady }), [user?.id, workspaceId, sessionReady]);
  const current = useRef<typeof scope | null>(scope); current.current = scope;
  const writer = useMemo(() => createPlannerHandoffWriter(), [scope]);
  const busy = useRef(false);
  const [pending, setPending] = useState(false);
  useEffect(() => {
    current.current = scope; busy.current = false; setPending(false);
    return () => { writer.clear(); if (current.current === scope) current.current = null; };
  }, [writer, scope]);
  async function transfer(rows: PlannerHandoffSource[]) {
    if (busy.current) return null;
    if (!scope.actor || !scope.workspaceId || !scope.sessionReady || session?.user.id !== scope.actor || !session.access_token) throw new PlannerHandoffError('UNAUTHORIZED');
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    busy.current = true; setPending(true);
    try {
      const result = await writer.transfer(scope.actor, scope.workspaceId, timezone, rows, body => {
        if (current.current !== scope) throw new PlannerHandoffError('HANDOFF_SCOPE_CHANGED');
        return supabase.functions.invoke('planner-to-calendar', { body, headers: { Authorization: 'Bearer ' + session.access_token } });
      });
      return current.current === scope ? result : null;
    } catch (error) {
      if (current.current !== scope) return null;
      throw error;
    } finally {
      if (current.current === scope) { busy.current = false; setPending(false); }
    }
  }
  return { transfer, pending, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone };
}

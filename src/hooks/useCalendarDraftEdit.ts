import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { CalendarDraftEditError, createCalendarDraftWriter, type CalendarDraftSource, type CalendarDraftPatch } from '@/lib/calendarDraftEdit';

export function useCalendarDraftEdit(workspaceId: string | null) {
  const { user, session } = useAuth();
  const ready = Boolean(session?.access_token && session.user.id === user?.id);
  const scope = useMemo(() => ({ actor: user?.id, workspaceId, ready, busy: false }), [user?.id, workspaceId, ready]);
  const current = useRef<typeof scope | null>(scope); current.current = scope;
  const writer = useMemo(() => createCalendarDraftWriter(), [scope]);
  const [busyScope, setBusyScope] = useState<typeof scope | null>(null);
  useEffect(() => {
    current.current = scope;
    return () => { writer.clear(); if (current.current === scope) current.current = null; };
  }, [scope, writer]);
  async function edit(row: CalendarDraftSource, patch: CalendarDraftPatch) {
    if (current.current !== scope) return null;
    if (!scope.actor || !scope.workspaceId || !scope.ready || !session?.access_token || session.user.id !== scope.actor) throw new CalendarDraftEditError('UNAUTHORIZED');
    if (scope.busy) return null;
    scope.busy = true; setBusyScope(scope);
    try {
      const receipt = await writer.edit(scope.actor, scope.workspaceId, row, patch, body => {
        if (current.current !== scope) throw new CalendarDraftEditError('DRAFT_SCOPE_CHANGED');
        return supabase.functions.invoke('calendar-edit-draft', { body, headers: { Authorization: 'Bearer ' + session.access_token } });
      });
      return current.current === scope ? receipt : null;
    } catch (error) {
      if (current.current !== scope) return null;
      throw error;
    } finally {
      scope.busy = false;
      if (current.current === scope) setBusyScope(null);
    }
  }
  return { edit, pending: busyScope === scope };
}

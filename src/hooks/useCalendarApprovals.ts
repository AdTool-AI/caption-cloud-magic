import { useEffect, useMemo } from 'react';
import { usePlannerRequestScope, usePlannerScopedState } from '@/hooks/usePlannerRequestScope';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { CalendarApprovalError, createCalendarApprovalWriter, approvalUuid, type ApprovalContext, type ApprovalEvent } from '@/lib/calendarApprovalWrite';

// Email and role labels are presentation only. Requests designate existing member IDs.
export interface ApprovalRequest { user_id: string; email: string; }
export const APPROVAL_READ_FIELDS = 'id,event_id,approver_id,status,stage,comment,created_at,reviewed_at,token_expires_at' as const;
const messages: Record<string, string> = {
  UNAUTHORIZED: 'Sign in to review this request.',
  APPROVAL_FORBIDDEN: 'You do not have permission for this review.',
  APPROVAL_CONFLICT: 'The content or review changed. Reload it before continuing.',
  APPROVAL_EXPIRED: 'This review request has expired.',
  APPROVAL_RECORD_NOT_FOUND: 'This review is unavailable.',
  APPROVAL_VERSION_REQUIRED: 'Reload the event to get its current version.',
  REQUEST_ID_REUSED: 'This request identity belongs to different content. Reload the review.',
  INVALID_APPROVAL_REQUEST: 'Check the reviewers, expiry and comment.',
  DUPLICATE_APPROVERS: 'Choose each reviewer once.',
};

export function useCalendarApprovals() {
  const { user, session } = useAuth();
  const scope = usePlannerRequestScope(user?.id);
  const { toast } = useToast();
  const [pending, setPending] = usePlannerScopedState(scope, () => 0);
  const writer = useMemo(() => createCalendarApprovalWriter(), [user?.id]);
  useEffect(() => () => writer.clear(), [writer]);
  const invoke = async (slug: 'calendar-request-approval' | 'calendar-approve-stage' | 'calendar-reject-approval', body: Record<string, unknown>) => {
    if (!user?.id || !scope.isCurrent() || session?.user.id !== user.id || !session.access_token) throw new CalendarApprovalError('APPROVAL_SCOPE_CHANGED');
    return supabase.functions.invoke(slug, { body, headers: { Authorization: 'Bearer ' + session.access_token } });
  };
  async function run<T>(action: () => Promise<T>, title: string): Promise<T | null> {
    if (!user?.id || !scope.isCurrent()) return null;
    setPending(count => count + 1);
    try {
      const result = await action();
      if (!scope.isCurrent()) return null;
      toast({ title, description: 'Review recorded. Publishing and event status are unchanged.' });
      return result;
    } catch (error) {
      const code = error instanceof CalendarApprovalError ? error.code : 'APPROVAL_RETRY_REQUIRED';
      if (scope.isCurrent() && code !== 'APPROVAL_SCOPE_CHANGED') toast({ title: 'Review not confirmed', description: messages[code] ?? 'The outcome is not confirmed. Retry the same action without editing it, or reload the review history.', variant: 'destructive' });
      return null;
    } finally { setPending(count => Math.max(0, count - 1)); }
  }
  const requestApproval = (event: ApprovalEvent, approvers: ApprovalRequest[], expiresAt: string) => run(
    () => writer.request(user?.id ?? '', event, approvers.map(row => row.user_id), expiresAt, invoke), 'Review requested');
  const approveStage = (context: ApprovalContext, comment?: string) => run(
    () => writer.decide(user?.id ?? '', context, 'approved', comment, invoke), 'Approval recorded');
  const rejectApproval = (context: ApprovalContext, comment?: string) => run(
    () => writer.decide(user?.id ?? '', context, 'rejected', comment, invoke), 'Changes requested');
  async function getApprovals(eventId: string) {
    const canCommit = scope.startRequest('approval-history');
    if (!user || !canCommit()) throw new CalendarApprovalError('UNAUTHORIZED');
    if (!approvalUuid(eventId)) throw new CalendarApprovalError('APPROVAL_RECORD_NOT_FOUND');
    const { data, error } = await supabase.from('calendar_approvals').select(APPROVAL_READ_FIELDS).eq('event_id', eventId).order('created_at', { ascending: false });
    if (!canCommit()) throw new CalendarApprovalError('APPROVAL_SCOPE_CHANGED');
    if (error || !Array.isArray(data) || data.some(row => row.event_id !== eventId)) throw new CalendarApprovalError('APPROVAL_RETRY_REQUIRED');
    return data;
  }
  return { loading: pending > 0, requestApproval, approveStage, rejectApproval, getApprovals };
}

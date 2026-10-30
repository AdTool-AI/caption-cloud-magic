// Request identity belongs to the caller; authorization and approval state belong to the backend.
export type ApprovalEvent = { id: string; workspace_id: string; updated_at: string; version: number };
export type ApprovalContext = { approval_id: string; event_id: string; workspace_id: string; approver_id: string };
export type ApprovalReceipt = { batch_id: string; event_id: string; approvals: { approval_id: string; approver_id: string }[]; expires_at: string; publication_enabled: false };
export type DecisionReceipt = { approval_id: string; event_id: string; decision: 'approved' | 'rejected'; all_approved: boolean; publication_enabled: false };
export type ApprovalSlug = 'calendar-request-approval' | 'calendar-approve-stage' | 'calendar-reject-approval';
type Invoke = (slug: ApprovalSlug, body: Record<string, unknown>) => Promise<{ data?: unknown; error?: unknown }>;
export class CalendarApprovalError extends Error { constructor(public code: string) { super(code); } }
const fail = (code: string): never => { throw new CalendarApprovalError(code); };
export const approvalUuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
export function approvalInstant(value: unknown): value is string {
  if (typeof value !== 'string' || !/^20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return false;
  const day = new Date(value.slice(0,10) + 'T00:00:00Z');
  return Number.isFinite(day.getTime()) && day.toISOString().slice(0,10) === value.slice(0,10) &&
    Number(value.slice(11,13)) < 24 && Number(value.slice(14,16)) < 60 && Number(value.slice(17,19)) < 60 && Number.isFinite(Date.parse(value));
}
export function approvalEvent(value: unknown): ApprovalEvent {
  const row = value as ApprovalEvent;
  if (!row || !approvalUuid(row.id) || !approvalUuid(row.workspace_id) || !approvalInstant(row.updated_at) || !Number.isInteger(row.version) || row.version < 1 || row.version > 2147483647) fail('APPROVAL_VERSION_REQUIRED');
  return { id: row.id.toLowerCase(), workspace_id: row.workspace_id.toLowerCase(), updated_at: row.updated_at, version: row.version };
}
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item)
    ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
}
async function responseError(error: unknown): Promise<CalendarApprovalError> {
  try {
    const context = (error as { context?: unknown })?.context;
    if (context instanceof Response) {
      const value = await context.clone().json();
      if (['APPROVAL_FORBIDDEN','APPROVAL_CONFLICT','APPROVAL_EXPIRED','APPROVAL_RECORD_NOT_FOUND','REQUEST_ID_REUSED','INVALID_APPROVAL_REQUEST','UNAUTHORIZED'].includes(value?.error)) return new CalendarApprovalError(value.error);
    }
  } catch { /* Keep request identity when the outcome cannot be established. */ }
  return new CalendarApprovalError('APPROVAL_RETRY_REQUIRED');
}
export function createCalendarApprovalWriter(newId: () => string = () => crypto.randomUUID()) {
  const entries = new Map<string, { requestId: string; pending?: Promise<unknown> }>();
  let generation = 0;
  function send<T>(actor: string, slug: ApprovalSlug, body: Record<string, unknown>, invoke: Invoke, project: (raw: unknown) => T): Promise<T> {
    if (!approvalUuid(actor)) fail('UNAUTHORIZED');
    const key = canonical([actor.toLowerCase(), slug, body]);
    let entry = entries.get(key);
    if (entry?.pending) return entry.pending as Promise<T>;
    if (!entry) {
      if (entries.size >= 64) fail('APPROVAL_REQUEST_LIMIT');
      const requestId = newId(); if (!approvalUuid(requestId)) fail('INVALID_REQUEST_ID');
      entry = { requestId }; entries.set(key, entry);
    }
    const current = entry, scope = generation;
    const request = Object.freeze({ ...body, request_id: current.requestId });
    const pending = Promise.resolve().then(async () => {
      if (scope !== generation) fail('APPROVAL_SCOPE_CHANGED');
      let response: Awaited<ReturnType<Invoke>>;
      try { response = await invoke(slug, request); }
      catch { return fail(scope !== generation ? 'APPROVAL_SCOPE_CHANGED' : 'APPROVAL_RETRY_REQUIRED'); }
      if (scope !== generation) fail('APPROVAL_SCOPE_CHANGED');
      if (response.error) {
        const error = await responseError(response.error);
        if (scope !== generation) fail('APPROVAL_SCOPE_CHANGED');
        throw error;
      }
      const result = project(response.data);
      return result;
    }).finally(() => { current.pending = undefined; });
    current.pending = pending;
    return pending;
  }
  return {
    clear() { generation++; entries.clear(); },
    request(actor: string, source: ApprovalEvent, reviewers: string[], expiresAt: string, invoke: Invoke): Promise<ApprovalReceipt> {
      const event = approvalEvent(source);
      if (!Array.isArray(reviewers) || reviewers.length < 1 || reviewers.length > 10 || reviewers.some(id => !approvalUuid(id)) || !approvalInstant(expiresAt)) fail('INVALID_APPROVAL_REQUEST');
      const ids = reviewers.map(id => id.toLowerCase()).sort();
      if (new Set(ids).size !== ids.length) fail('DUPLICATE_APPROVERS');
      const body = { workspace_id: event.workspace_id, event_id: event.id, expected_updated_at: event.updated_at, expected_version: event.version, approver_ids: Object.freeze(ids), expires_at: expiresAt };
      return send(actor, 'calendar-request-approval', body, invoke, value => {
        const row = value as ApprovalReceipt;
        if (!row || row.publication_enabled !== false || !approvalUuid(row.batch_id) || !approvalUuid(row.event_id) || row.event_id.toLowerCase() !== event.id || !approvalInstant(row.expires_at) || Date.parse(row.expires_at) !== Date.parse(expiresAt) || !Array.isArray(row.approvals) || row.approvals.length !== ids.length) fail('APPROVAL_RETRY_REQUIRED');
        const remaining = new Set(ids), seen = new Set<string>();
        const approvals = row.approvals.map(item => {
          if (!approvalUuid(item?.approval_id) || !approvalUuid(item?.approver_id) || !remaining.delete(item.approver_id.toLowerCase()) || seen.has(item.approval_id.toLowerCase())) fail('APPROVAL_RETRY_REQUIRED');
          seen.add(item.approval_id.toLowerCase());
          return { approval_id: item.approval_id, approver_id: item.approver_id };
        });
        return { batch_id: row.batch_id, event_id: row.event_id, approvals, expires_at: row.expires_at, publication_enabled: false as const };
      });
    },
    decide(actor: string, context: ApprovalContext, decision: 'approved' | 'rejected', comment: string | undefined, invoke: Invoke): Promise<DecisionReceipt> {
      if (!approvalUuid(actor) || !context || !approvalUuid(context.approval_id) || !approvalUuid(context.event_id) || !approvalUuid(context.workspace_id) || !approvalUuid(context.approver_id) || context.approver_id.toLowerCase() !== actor.toLowerCase()) fail('APPROVAL_FORBIDDEN');
      if (!['approved','rejected'].includes(decision) || (comment !== undefined && (typeof comment !== 'string' || comment.length > 4000))) fail('INVALID_APPROVAL_REQUEST');
      const body = { workspace_id: context.workspace_id.toLowerCase(), approval_id: context.approval_id.toLowerCase(), ...(comment === undefined ? {} : { comment }) };
      return send(actor, decision === 'approved' ? 'calendar-approve-stage' : 'calendar-reject-approval', body, invoke, value => {
        const row = value as DecisionReceipt;
        if (!row || row.publication_enabled !== false || !approvalUuid(row.approval_id) || !approvalUuid(row.event_id) || row.approval_id.toLowerCase() !== body.approval_id || row.event_id?.toLowerCase() !== context.event_id.toLowerCase() || row.decision !== decision || typeof row.all_approved !== 'boolean') fail('APPROVAL_RETRY_REQUIRED');
        return { approval_id: row.approval_id, event_id: row.event_id, decision: row.decision, all_approved: row.all_approved, publication_enabled: false as const };
      });
    },
  };
}

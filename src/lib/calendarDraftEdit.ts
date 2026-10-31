import { handoffInstant } from './plannerHandoff';

export interface CalendarDraftSource {
  id: string; workspace_id: string; status: string; version: number; updated_at: string;
  title: string; brief?: string | null; caption?: string | null;
  start_at?: string | null; end_at?: string | null; timezone: string;
}
export type CalendarDraftPatch = Partial<Pick<CalendarDraftSource, 'title' | 'brief' | 'caption' | 'start_at' | 'end_at' | 'timezone'>>;
export interface CalendarDraftReceipt {
  request_id: string; workspace_id: string; event: CalendarDraftSource;
  draft_only: true; publication_enabled: false; availability_reserved: false;
}
export class CalendarDraftEditError extends Error {
  constructor(public code: string) { super(code); }
}
const fail = (code: string): never => { throw new CalendarDraftEditError(code); };
const uuid = (x: unknown): x is string => typeof x === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x);
function micros(x: string): bigint {
  if (!handoffInstant(x)) fail('INVALID_DRAFT_EDIT');
  const fraction = /\.(\d{1,6})(?:Z|[+-])/.exec(x)?.[1] ?? '';
  return BigInt(Date.parse(x)) * 1000n + BigInt(fraction.padEnd(6, '0').slice(3));
}
function instant(x: bigint): string {
  const ms = x / 1000n, remainder = x % 1000n;
  const value = new Date(Number(ms)).toISOString().replace(/\.(\d{3})Z$/, (_, part) => '.' + part + remainder.toString().padStart(3, '0') + 'Z');
  if (!handoffInstant(value)) fail('INVALID_DRAFT_EDIT');
  return value;
}
/** A drag changes both endpoints, retaining the loaded duration and submillisecond precision. */
export function calendarDraftMove(row: CalendarDraftSource, date: Date): CalendarDraftPatch {
  if (!row.start_at || !row.end_at || !Number.isFinite(date.getTime())) fail('DRAFT_RANGE_REQUIRED');
  const start = micros(row.start_at), end = micros(row.end_at);
  if (end <= start || end - start > 604800000000n) fail('INVALID_DRAFT_EDIT');
  const moved = BigInt(date.getTime()) * 1000n + start % 1000n;
  return { start_at: instant(moved), end_at: instant(moved + end - start) };
}
export function draftPatch(value: CalendarDraftPatch): CalendarDraftPatch {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('INVALID_DRAFT_EDIT');
  const keys = Object.keys(value).sort();
  if (!keys.length || keys.some(k => !['title','brief','caption','start_at','end_at','timezone'].includes(k))) fail('INVALID_DRAFT_EDIT');
  const patch = Object.fromEntries(keys.map(k => [k, (value as Record<string, unknown>)[k]]));
  for (const [key, v] of Object.entries(patch)) {
    if (key === 'title' && (typeof v !== 'string' || !v.trim() || [...v].length > 500)) fail('INVALID_DRAFT_EDIT');
    if (['brief','caption'].includes(key) && v !== null && (typeof v !== 'string' || [...v].length > 20000)) fail('INVALID_DRAFT_EDIT');
    if (key === 'timezone') {
      if (typeof v !== 'string' || !v || v.length > 100) fail('INVALID_DRAFT_EDIT');
      try { new Intl.DateTimeFormat('en', { timeZone: v as string }).format(0); } catch { fail('INVALID_DRAFT_EDIT'); }
    }
  }
  if (('start_at' in patch) !== ('end_at' in patch)) fail('INVALID_DRAFT_EDIT');
  if ('start_at' in patch && !(patch.start_at === null && patch.end_at === null)) {
    if (!handoffInstant(patch.start_at) || !handoffInstant(patch.end_at)) fail('INVALID_DRAFT_EDIT');
    const duration = micros(patch.end_at as string) - micros(patch.start_at as string);
    if (duration <= 0n || duration > 604800000000n) fail('INVALID_DRAFT_EDIT');
  }
  return Object.freeze(patch) as CalendarDraftPatch;
}
type Invoke = (body: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
async function boundedError(error: unknown) {
  try {
    const context = (error as { context?: unknown })?.context;
    if (context instanceof Response) {
      if (context.status === 401) return new CalendarDraftEditError('UNAUTHORIZED');
      const body = await context.clone().json();
      if (['DRAFT_EDIT_FORBIDDEN','DRAFT_NOT_FOUND','REQUEST_ID_REUSED','DRAFT_EDIT_CONFLICT','INVALID_DRAFT_EDIT'].includes(body?.error)) return new CalendarDraftEditError(body.error);
    }
  } catch { /* An unknown outcome must retain its request ID. */ }
  return new CalendarDraftEditError('DRAFT_EDIT_RETRY_REQUIRED');
}
export function createCalendarDraftWriter(newId = () => crypto.randomUUID()) {
  const entries = new Map<string, { id: string; pending?: Promise<CalendarDraftReceipt> }>();
  let generation = 0;
  return {
    clear() { generation++; entries.clear(); },
    edit(actor: string, workspace: string, row: CalendarDraftSource, input: CalendarDraftPatch, invoke: Invoke): Promise<CalendarDraftReceipt> {
      if (!uuid(actor)) fail('UNAUTHORIZED');
      if (!uuid(workspace) || !uuid(row?.id) || row.workspace_id?.toLowerCase() !== workspace.toLowerCase()) fail('DRAFT_SCOPE_CHANGED');
      if (row.status !== 'briefing') fail('DRAFT_REQUIRED');
      if (!handoffInstant(row.updated_at) || !Number.isInteger(row.version) || row.version < 1 || row.version >= 2147483647) fail('DRAFT_VERSION_REQUIRED');
      const payload = Object.freeze({ workspace_id: workspace.toLowerCase(), event_id: row.id.toLowerCase(), expected_updated_at: row.updated_at, expected_version: row.version, patch: draftPatch(input) });
      const key = JSON.stringify([actor.toLowerCase(), payload]);
      let entry = entries.get(key);
      if (entry?.pending) return entry.pending;
      if (!entry) {
        if (entries.size >= 64) fail('DRAFT_REQUEST_LIMIT');
        const id = newId(); if (!uuid(id)) fail('INVALID_REQUEST_ID');
        entry = { id }; entries.set(key, entry);
      }
      const current = entry, scope = generation;
      const pending = Promise.resolve().then(async () => {
        if (scope !== generation) fail('DRAFT_SCOPE_CHANGED');
        let response: Awaited<ReturnType<Invoke>>;
        try { response = await invoke(Object.freeze({ ...payload, request_id: current.id })); }
        catch { return fail(scope === generation ? 'DRAFT_EDIT_RETRY_REQUIRED' : 'DRAFT_SCOPE_CHANGED'); }
        if (scope !== generation) fail('DRAFT_SCOPE_CHANGED');
        if (response.error) {
          const error = await boundedError(response.error);
          if (scope !== generation) fail('DRAFT_SCOPE_CHANGED');
          throw error;
        }
        const data = response.data as CalendarDraftReceipt, e = data?.event;
        if (!data || data.request_id !== current.id || !uuid(data.workspace_id) || data.workspace_id.toLowerCase() !== payload.workspace_id ||
          data.draft_only !== true || data.publication_enabled !== false || data.availability_reserved !== false ||
          !e || !uuid(e.id) || e.id.toLowerCase() !== payload.event_id || !uuid(e.workspace_id) || e.workspace_id.toLowerCase() !== payload.workspace_id ||
          e.status !== 'briefing' || e.version !== payload.expected_version + 1 || !handoffInstant(e.updated_at) || micros(e.updated_at) <= micros(payload.expected_updated_at) ||
          typeof e.title !== 'string' || !e.title.trim() || [...e.title].length > 500 ||
          !(e.brief === null || typeof e.brief === 'string') || !(e.caption === null || typeof e.caption === 'string') || typeof e.timezone !== 'string') fail('DRAFT_EDIT_RETRY_REQUIRED');
        if (!((e.start_at === null && e.end_at === null) || (handoffInstant(e.start_at) && handoffInstant(e.end_at) && micros(e.end_at) > micros(e.start_at)))) fail('DRAFT_EDIT_RETRY_REQUIRED');
        for (const [k, v] of Object.entries(payload.patch)) {
          const got = (e as unknown as Record<string, unknown>)[k];
          if (['start_at','end_at'].includes(k) && v !== null) {
            if (!handoffInstant(got) || micros(got) !== micros(v as string)) fail('DRAFT_EDIT_RETRY_REQUIRED');
          } else if (got !== v) fail('DRAFT_EDIT_RETRY_REQUIRED');
        }
        return { request_id: data.request_id, workspace_id: data.workspace_id, event: {
          id:e.id, workspace_id:e.workspace_id, title:e.title, brief:e.brief, caption:e.caption,
          start_at:e.start_at, end_at:e.end_at, timezone:e.timezone, status:e.status, version:e.version, updated_at:e.updated_at,
        }, draft_only:true as const, publication_enabled:false as const, availability_reserved:false as const };
      }).finally(() => { current.pending = undefined; });
      current.pending = pending; return pending;
    },
  };
}

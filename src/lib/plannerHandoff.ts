export interface PlannerHandoffSource {
  id: string; workspace_id: string; updated_at: string | null; status: string;
  content_id: string | null; meta?: unknown;
  content_items?: { id: string; updated_at: string | null; media_id?: string | null; thumb_url?: string | null } | null;
}
export interface PlannerHandoffReceipt {
  request_id: string; workspace_id: string; timezone: string;
  results: { block_id: string; event_id: string; status: 'briefing'; source_block_version: string }[];
  draft_only: true; publication_enabled: false; source_blocks_unchanged: true; availability_reserved: false;
}
export class PlannerHandoffError extends Error {
  constructor(public code: string) { super(code); }
}
export type HandoffInvoke = (body: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
const uuid = (x: unknown): x is string => typeof x === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x);
function fail(code: string): never { throw new PlannerHandoffError(code); }
export function handoffInstant(x: unknown): x is string {
  if (typeof x !== 'string' || !/^20\d{2}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(x)) return false;
  const day = new Date(x.slice(0,10) + 'T00:00:00Z');
  return Number.isFinite(day.getTime()) && day.toISOString().slice(0,10) === x.slice(0,10) &&
    Number(x.slice(11,13)) < 24 && Number(x.slice(14,16)) < 60 && Number(x.slice(17,19)) < 60 && Number.isFinite(Date.parse(x));
}
function micros(x: string): bigint {
  const fraction = /\.(\d{1,6})(?:Z|[+-])/.exec(x)?.[1] ?? '';
  return BigInt(Date.parse(x)) * 1000n + BigInt(fraction.padEnd(6, '0').slice(3));
}
export function handoffPayload(workspaceId: string, timezone: string, sources: PlannerHandoffSource[]) {
  if (!uuid(workspaceId)) fail('HANDOFF_SCOPE_CHANGED');
  if (typeof timezone !== 'string' || !timezone || timezone.length > 100) fail('HANDOFF_TIMEZONE_REQUIRED');
  try { new Intl.DateTimeFormat('en', { timeZone: timezone }).format(0); } catch { fail('HANDOFF_TIMEZONE_REQUIRED'); }
  if (!Array.isArray(sources) || sources.length < 1 || sources.length > 50) fail('HANDOFF_BATCH_LIMIT');
  const ids = new Set<string>();
  const blocks = sources.map(row => {
    if (!row || !uuid(row.id) || row.workspace_id?.toLowerCase() !== workspaceId.toLowerCase()) fail('HANDOFF_SCOPE_CHANGED');
    if (row.status !== 'draft') fail('HANDOFF_DRAFT_REQUIRED');
    if (!handoffInstant(row.updated_at) || !('content_id' in row) || !(row.content_id === null || uuid(row.content_id))) fail('HANDOFF_VERSION_REQUIRED');
    const id = row.id.toLowerCase(); if (ids.has(id)) fail('HANDOFF_DUPLICATE_BLOCK'); ids.add(id);
    let contentVersion: string | null = null;
    if (row.content_id !== null) {
      const item = row.content_items;
      if (!item || item.id?.toLowerCase() !== row.content_id.toLowerCase() || !handoffInstant(item.updated_at)) fail('HANDOFF_VERSION_REQUIRED');
      if (item.media_id || item.thumb_url?.trim()) fail('MEDIA_REVIEW_REQUIRED');
      contentVersion = item.updated_at;
    }
    if (row.meta && typeof row.meta === 'object' && ['media_urls','media_id','assets','assets_json','image_url','video_url','thumb_url','media'].some(key => key in (row.meta as object))) fail('MEDIA_REVIEW_REQUIRED');
    return Object.freeze({ id, expected_updated_at: row.updated_at, expected_content_updated_at: contentVersion });
  }).sort((a,b) => a.id.localeCompare(b.id));
  return Object.freeze({ workspace_id: workspaceId.toLowerCase(), timezone, blocks: Object.freeze(blocks) });
}
async function responseError(error: unknown): Promise<PlannerHandoffError> {
  try {
    const context = (error as { context?: unknown })?.context;
    if (context instanceof Response) {
      const body = await context.clone().json();
      if (context.status === 401) return new PlannerHandoffError('UNAUTHORIZED');
      if (['UNAUTHORIZED','HANDOFF_FORBIDDEN','HANDOFF_SOURCE_NOT_FOUND','REQUEST_ID_REUSED','MEDIA_REVIEW_REQUIRED','HANDOFF_CONFLICT','INVALID_HANDOFF_REQUEST'].includes(body?.error)) return new PlannerHandoffError(body.error);
    }
  } catch { /* Retain the same request identity after an unknown outcome. */ }
  return new PlannerHandoffError('HANDOFF_RETRY_REQUIRED');
}
export function createPlannerHandoffWriter(newId: () => string = () => crypto.randomUUID()) {
  const entries = new Map<string, { requestId: string; pending?: Promise<PlannerHandoffReceipt> }>();
  let generation = 0;
  return {
    clear() { generation++; entries.clear(); },
    transfer(actorId: string, workspaceId: string, timezone: string, rows: PlannerHandoffSource[], invoke: HandoffInvoke): Promise<PlannerHandoffReceipt> {
      if (!uuid(actorId)) fail('UNAUTHORIZED');
      const payload = handoffPayload(workspaceId, timezone, rows);
      const key = JSON.stringify([actorId.toLowerCase(), payload]);
      let entry = entries.get(key);
      if (entry?.pending) return entry.pending;
      if (!entry) {
        if (entries.size >= 64) fail('HANDOFF_REQUEST_LIMIT');
        const requestId = newId(); if (!uuid(requestId)) fail('INVALID_REQUEST_ID');
        entry = { requestId }; entries.set(key, entry);
      }
      const current = entry, scope = generation;
      const pending = Promise.resolve().then(async () => {
        if (scope !== generation) fail('HANDOFF_SCOPE_CHANGED');
        let response: Awaited<ReturnType<HandoffInvoke>>;
        try { response = await invoke(Object.freeze({ ...payload, request_id: current.requestId })); }
        catch { return fail(scope === generation ? 'HANDOFF_RETRY_REQUIRED' : 'HANDOFF_SCOPE_CHANGED'); }
        if (scope !== generation) fail('HANDOFF_SCOPE_CHANGED');
        if (response.error) {
          const error = await responseError(response.error);
          if (scope !== generation) fail('HANDOFF_SCOPE_CHANGED');
          throw error;
        }
        const data = response.data as PlannerHandoffReceipt;
        if (!data || !uuid(data.request_id) || data.request_id.toLowerCase() !== current.requestId.toLowerCase() ||
            !uuid(data.workspace_id) || data.workspace_id.toLowerCase() !== payload.workspace_id || data.timezone !== timezone ||
            data.draft_only !== true || data.publication_enabled !== false || data.source_blocks_unchanged !== true || data.availability_reserved !== false ||
            !Array.isArray(data.results) || data.results.length !== payload.blocks.length) fail('HANDOFF_RETRY_REQUIRED');
        const events = new Set<string>();
        const results = data.results.map((row, i) => {
          if (!uuid(row?.block_id) || row.block_id.toLowerCase() !== payload.blocks[i].id || !uuid(row.event_id) || events.has(row.event_id.toLowerCase()) ||
              row.status !== 'briefing' || !handoffInstant(row.source_block_version) || micros(row.source_block_version) !== micros(payload.blocks[i].expected_updated_at)) fail('HANDOFF_RETRY_REQUIRED');
          events.add(row.event_id.toLowerCase());
          return { block_id: row.block_id, event_id: row.event_id, status: 'briefing' as const, source_block_version: row.source_block_version };
        });
        return { request_id: data.request_id, workspace_id: data.workspace_id, timezone, results, draft_only: true as const,
          publication_enabled: false as const, source_blocks_unchanged: true as const, availability_reserved: false as const };
      }).finally(() => { current.pending = undefined; });
      current.pending = pending;
      return pending;
    },
  };
}

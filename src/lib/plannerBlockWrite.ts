// Caller request identity only. Authorization, versions and persistence belong to the backend.
type Row = Record<string, any>;
export type DraftBlock = {
  id?: string;
  weekplan_id: string;
  content_id: string | null;
  platform: string;
  start_at: string;
  end_at: string;
  title_override: string | null;
  caption_override: string | null;
  meta: Record<string, unknown>;
  expected_updated_at?: string;
};
export type SavedDraftBlock = Omit<DraftBlock, 'id' | 'expected_updated_at'> & {
  id: string; workspace_id: string; updated_at: string; status: 'draft';
};
export type BlockSaveBody = { request_id: string; workspace_id: string; blocks: DraftBlock[] };
type Invoke = (body: BlockSaveBody) => Promise<{ data?: unknown; error?: unknown }>;
export class PlannerBlockSaveError extends Error {
  constructor(public code: string) { super(code); }
}
const fail = (code: string): never => { throw new PlannerBlockSaveError(code); };
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
function instant(value: unknown): value is string {
  if (typeof value !== 'string' || !/^20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return false;
  const date = new Date(value.slice(0, 10) + 'T00:00:00Z');
  return Number(value.slice(11, 13)) < 24 && Number(value.slice(14, 16)) < 60 && Number(value.slice(17, 19)) < 60 &&
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value.slice(0, 10) && Number.isFinite(Date.parse(value));
}
export function plannerDraftBlock(source: Row, workspaceId: string, weekplanId?: string): DraftBlock {
  if (!source || typeof source !== 'object' || Array.isArray(source) || !uuid(workspaceId) ||
      (source.workspace_id !== undefined && source.workspace_id !== workspaceId)) fail('INVALID_BLOCK_SCOPE');
  if (source.status !== undefined && source.status !== 'draft') fail('DRAFT_EDIT_REQUIRED');
  const plan = source.weekplan_id ?? weekplanId;
  if (!uuid(plan) || (weekplanId !== undefined && plan !== weekplanId)) fail('INVALID_BLOCK_SCOPE');
  const platform = typeof source.platform === 'string' ? source.platform.trim().toLowerCase() : '';
  if (!/^[a-z][a-z0-9_-]{0,39}$/.test(platform) || !instant(source.start_at) || !instant(source.end_at) ||
      Date.parse(source.end_at) <= Date.parse(source.start_at) || Date.parse(source.end_at) - Date.parse(source.start_at) > 604800000) fail('INVALID_BLOCK');
  if (source.content_id != null && !uuid(source.content_id)) fail('INVALID_BLOCK');
  for (const [key, limit] of [['title_override', 500], ['caption_override', 20000]] as const) {
    if (source[key] != null && (typeof source[key] !== 'string' || source[key].length > limit)) fail('INVALID_BLOCK');
  }
  let meta: Record<string, unknown>;
  try {
    const value = source.meta ?? {};
    if (typeof value !== 'object' || Array.isArray(value)) fail('INVALID_BLOCK');
    const raw = JSON.stringify(value);
    if (new TextEncoder().encode(raw).length > 16000) fail('INVALID_BLOCK');
    meta = JSON.parse(raw);
    if (!meta || typeof meta !== 'object' || Array.isArray(meta)) fail('INVALID_BLOCK');
  } catch { return fail('INVALID_BLOCK'); }
  const block: DraftBlock = {
    weekplan_id: plan, content_id: source.content_id ?? null, platform,
    start_at: source.start_at, end_at: source.end_at,
    title_override: source.title_override ?? null, caption_override: source.caption_override ?? null, meta,
  };
  if (source.id !== undefined) {
    const version = source.expected_updated_at ?? source.updated_at;
    if (!uuid(source.id) || !instant(version)) fail('BLOCK_VERSION_REQUIRED');
    block.id = source.id;
    block.expected_updated_at = version; // Keep PostgreSQL's six fractional digits verbatim.
  } else if (source.expected_updated_at !== undefined) fail('INVALID_BLOCK');
  return block;
}
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item)
    ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
}
async function responseError(error: any): Promise<PlannerBlockSaveError> {
  let code = 'BLOCK_SAVE_FAILED';
  try {
    const response = error?.context;
    if (response instanceof Response) {
      const value = await response.clone().json();
      if (['STALE_WRITE_RETRY_REQUIRED', 'REQUEST_ID_REUSED', 'WRITE_FORBIDDEN', 'RECORD_NOT_FOUND'].includes(value?.error)) code = value.error;
    }
  } catch { /* A transport failure has an unknown outcome. Keep its request ID. */ }
  return new PlannerBlockSaveError(code);
}
export function createPlannerBlockWriter(newId: () => string = () => crypto.randomUUID()) {
  const entries = new Map<string, { requestId: string; pending?: Promise<SavedDraftBlock[]> }>();
  let generation = 0;
  return {
    clear() { generation++; entries.clear(); },
    save(actorId: string, workspaceId: string, sources: Row[], invoke: Invoke, weekplanId?: string): Promise<SavedDraftBlock[]> {
      if (!uuid(actorId) || !uuid(workspaceId) || !Array.isArray(sources) || sources.length < 1 || sources.length > 100) fail('INVALID_BLOCK_SCOPE');
      const blocks = sources.map(source => plannerDraftBlock(source, workspaceId, weekplanId));
      const key = canonical([actorId, workspaceId, blocks]);
      let entry = entries.get(key);
      if (entry?.pending) return entry.pending;
      if (!entry) {
        if (entries.size >= 64) fail('PENDING_SAVE_LIMIT');
        const requestId = newId(); if (!uuid(requestId)) fail('INVALID_REQUEST_ID');
        entry = { requestId }; entries.set(key, entry);
      }
      const current = entry, scope = generation;
      const request: BlockSaveBody = { request_id: current.requestId, workspace_id: workspaceId, blocks };
      const pending = Promise.resolve().then(async () => {
        if (scope !== generation) fail('SAVE_SCOPE_CHANGED');
        let response: Awaited<ReturnType<Invoke>>;
        try { response = await invoke(request); }
        catch {
          if (scope !== generation) fail('SAVE_SCOPE_CHANGED');
          return fail('BLOCK_SAVE_FAILED');
        }
        const { data, error } = response;
        if (scope !== generation) fail('SAVE_SCOPE_CHANGED');
        if (error) {
          const converted = await responseError(error);
          if (scope !== generation) fail('SAVE_SCOPE_CHANGED');
          throw converted;
        }
        const result = data as any;
        if (!result || !Array.isArray(result.results) || result.results.length !== blocks.length || result.results.some((row: any, index: number) =>
          !row || !uuid(row.id) || row.workspace_id !== workspaceId || row.weekplan_id !== blocks[index].weekplan_id ||
          (blocks[index].id !== undefined && row.id !== blocks[index].id) || row.status !== 'draft' || !instant(row.updated_at) ||
          typeof row.platform !== 'string' || !instant(row.start_at) || !instant(row.end_at))) fail('BLOCK_SAVE_FAILED');
        if (entries.get(key) === current) entries.delete(key);
        return result.results as SavedDraftBlock[];
      }).finally(() => { current.pending = undefined; });
      current.pending = pending;
      return pending;
    },
  };
}

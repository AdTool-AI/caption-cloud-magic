// Caller authentication and workspace scope shared by calendar endpoints.
// User clients carry the caller JWT so RLS remains a second boundary at each read/write.
export type CalendarDeps = { createClient: (...args: any[]) => any; env: (name: string) => string | undefined };
export class CalendarAccessError extends Error {
  constructor(public status: number, public code: string) { super(code); }
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function calendarRequestGuard(req: Request, headers: Record<string, string>): Response | null {
  if (req.method === 'OPTIONS') return new Response(null, { headers });
  if (req.method !== 'POST') return Response.json({ error: 'METHOD_NOT_ALLOWED' }, { status: 405, headers });
  if ([...req.headers.keys()].some(k => k.startsWith('x-qa-') || k === 'x-real-spend'))
    return Response.json({ error: 'QA_HEADERS_FORBIDDEN' }, { status: 403, headers });
  return null;
}
export async function calendarUser(req: Request, deps: CalendarDeps) {
  const authorization = req.headers.get('authorization') ?? '';
  const token = /^Bearer\s+(\S+)\s*$/i.exec(authorization)?.[1];
  if (!token) throw new CalendarAccessError(401, 'UNAUTHORIZED');
  const client = deps.createClient(deps.env('SUPABASE_URL') ?? '', deps.env('SUPABASE_ANON_KEY') ?? '', {
    global: { headers: { Authorization: authorization } }, auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data?.user || !uuid.test(data.user.id)) throw new CalendarAccessError(401, 'UNAUTHORIZED');
  return { client, user: data.user };
}
export async function calendarWorkspace(client: any, userId: string, workspaceId: unknown, level: 'read' | 'edit' | 'admin') {
  if (typeof workspaceId !== 'string' || !uuid.test(workspaceId)) throw new CalendarAccessError(400, 'INVALID_WORKSPACE');
  const workspace = await client.from('workspaces').select('id, owner_id').eq('id', workspaceId).maybeSingle();
  if (workspace.error) throw new CalendarAccessError(503, 'WORKSPACE_CHECK_FAILED');
  if (!workspace.data) throw new CalendarAccessError(403, 'WORKSPACE_FORBIDDEN');
  if (workspace.data.owner_id === userId) return;
  const membership = await client.from('workspace_members').select('role').eq('workspace_id', workspaceId).eq('user_id', userId).maybeSingle();
  if (membership.error) throw new CalendarAccessError(503, 'WORKSPACE_CHECK_FAILED');
  const allowed = level === 'read' ? ['owner','admin','editor','viewer'] : level === 'edit' ? ['owner','admin','editor'] : ['owner','admin'];
  if (!membership.data || !allowed.includes(membership.data.role)) throw new CalendarAccessError(403, 'WORKSPACE_FORBIDDEN');
}
export function calendarError(error: unknown, headers: Record<string, string>) {
  const known = error instanceof CalendarAccessError;
  return Response.json({ error: known ? error.code : 'INTERNAL_ERROR' }, { status: known ? error.status : 500, headers });
}

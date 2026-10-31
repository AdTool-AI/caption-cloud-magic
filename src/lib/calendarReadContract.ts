/** Shared canonical URL plan for the reviewed calendar GET surface. It grants no access. */
export const CALENDAR_READ_PROJECTIONS = {
  calendar_events: 'id,workspace_id,title,brief,caption,channels,status,start_at,end_at,timezone,version,updated_at',
  workspaces: 'id,name', workspace_members: 'user_id,workspace_id,role',
  clients: 'id,name,workspace_id', profiles: 'id,email', brand_kits: 'id,brand_name,user_id',
} as const;
export type CalendarReadKind = 'events' | 'event' | 'workspace' | 'members' | 'memberships' | 'clients' | 'brands' | 'profile';
export interface CalendarReadScope { actorId?: string; workspaceId?: string; eventId?: string; offset?: number }
export interface CalendarReadPlan {
  table: keyof typeof CALENDAR_READ_PROJECTIONS;
  filters: [string, string][]; order: string[]; limit: 1 | 100; offset?: number;
}
function id(value: unknown): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) throw new Error('CALENDAR_READ_SCOPE_REQUIRED');
  return value.toLowerCase();
}
export function calendarReadPlan(kind: CalendarReadKind, scope: CalendarReadScope): CalendarReadPlan {
  const offset = scope.offset ?? 0;
  if (!Number.isInteger(offset) || offset < 0 || offset > 900 || offset % 100 !== 0) throw new Error('CALENDAR_READ_PAGE_LIMIT');
  switch (kind) {
    case 'events': return { table: 'calendar_events', filters: [['workspace_id',id(scope.workspaceId)]], order: ['start_at','id'], limit: 100, offset };
    case 'event': return { table: 'calendar_events', filters: [['workspace_id',id(scope.workspaceId)],['id',id(scope.eventId)]], order: [], limit: 1 };
    case 'workspace': return { table: 'workspaces', filters: [['id',id(scope.workspaceId)]], order: [], limit: 1 };
    case 'members': return { table: 'workspace_members', filters: [['workspace_id',id(scope.workspaceId)]], order: ['user_id'], limit: 100, offset };
    case 'memberships': return { table: 'workspace_members', filters: [['user_id',id(scope.actorId)]], order: ['workspace_id'], limit: 100, offset };
    case 'clients': return { table: 'clients', filters: [['workspace_id',id(scope.workspaceId)]], order: ['name','id'], limit: 100, offset };
    case 'brands': return { table: 'brand_kits', filters: [['user_id',id(scope.actorId)]], order: ['brand_name','id'], limit: 100, offset };
    case 'profile': return { table: 'profiles', filters: [['id',id(scope.actorId)]], order: [], limit: 1 };
    default: throw new Error('CALENDAR_READ_KIND_UNAVAILABLE');
  }
}
export function canonicalCalendarReadUri(kind: CalendarReadKind, scope: CalendarReadScope): string {
  const plan = calendarReadPlan(kind, scope);
  const params = new URLSearchParams([['select',CALENDAR_READ_PROJECTIONS[plan.table]],...plan.filters.map(([key,value]) => [key,'eq.'+value])]);
  if (plan.order.length) params.set('order',plan.order.map(column => column+'.asc').join(','));
  params.set('limit',String(plan.limit));
  if (plan.offset !== undefined) params.set('offset',String(plan.offset));
  return '/rest/v1/'+plan.table+'?'+params.toString();
}
/** Exact serialization, parameter order and page bounds accepted by public ingress. */
export function isCanonicalCalendarReadUri(uri: string): boolean {
  try {
    const url = new URL(uri, 'https://calendar.invalid');
    const param = (name: string) => url.searchParams.get(name)?.replace(/^eq\./, '');
    const scope = { workspaceId: param('workspace_id') ?? param('id'), actorId: param('user_id') ?? param('id'), eventId: param('id'), offset: Number(url.searchParams.get('offset') ?? 0) };
    return (['events','event','workspace','members','memberships','clients','brands','profile'] as CalendarReadKind[])
      .some(kind => { try { return canonicalCalendarReadUri(kind, scope) === uri; } catch { return false; } });
  } catch { return false; }
}
/** Use the shared, actor-session Supabase client; this helper never bypasses its fetch guard. */
export function createCalendarReadQuery(client: { from: (table: string) => any }, kind: CalendarReadKind, scope: CalendarReadScope) {
  const plan = calendarReadPlan(kind, scope);
  let query = client.from(plan.table).select(CALENDAR_READ_PROJECTIONS[plan.table]);
  for (const [column,value] of plan.filters) query = query.eq(column,value);
  for (const column of plan.order) query = query.order(column,{ ascending: true });
  query = query.limit(plan.limit);
  if (plan.offset !== undefined) query = query.range(plan.offset,plan.offset+99);
  return query;
}

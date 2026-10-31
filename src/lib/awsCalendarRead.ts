import type { Session, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import { CALENDAR_READ_PROJECTIONS, createCalendarReadQuery, type CalendarReadKind } from './calendarReadContract';
type Row = Record<string, unknown>;
const uuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(v);
export interface CalendarMembership { workspace_id: string; user_id: string; role: string }
export interface CalendarReadEvent { id: string; workspace_id: string; title: string; brief: string | null; caption: string | null; channels: string[]; status: string; start_at: string | null; end_at: string | null; timezone: string; version: number; updated_at: string }
export interface AwsCalendarResult { userId: string; workspaceId: string; workspaceName: string; offset: number; events: CalendarReadEvent[]; membersReturned: number; clientsReturned: number; ownBrandsReturned: number }
async function verified(client: SupabaseClient<Database>, session: Session) {
  if (!uuid(session?.user?.id) || !session.access_token) throw new Error('CALENDAR_SESSION_REQUIRED');
  const result = await client.auth.getUser(session.access_token);
  if (result.error || result.data.user?.id !== session.user.id || result.data.user.factors?.some(f => f.status === 'verified')) throw new Error('CALENDAR_SESSION_REVIEW');
}
async function rows(client: SupabaseClient<Database>, session: Session, kind: CalendarReadKind, workspaceId?: string, offset = 0): Promise<Row[]> {
  const result = await createCalendarReadQuery(client, kind, { actorId: session.user.id, workspaceId, offset }).setHeader('Authorization', `Bearer ${session.access_token}`);
  const table = kind === 'events' || kind === 'event' ? 'calendar_events' : kind === 'workspace' ? 'workspaces' : kind === 'members' || kind === 'memberships' ? 'workspace_members' : kind === 'profile' ? 'profiles' : kind === 'brands' ? 'brand_kits' : 'clients';
  const fields = CALENDAR_READ_PROJECTIONS[table].split(',').sort();
  if (result.error || !Array.isArray(result.data) || result.data.length > (kind === 'workspace' || kind === 'profile' ? 1 : 100) || result.data.some((r: unknown) => !r || typeof r !== 'object' || Array.isArray(r) || Object.keys(r).sort().join(',') !== fields.join(','))) throw new Error('CALENDAR_READ_RESPONSE_REVIEW');
  return result.data;
}
export async function readAwsCalendarMemberships(client: SupabaseClient<Database>, session: Session): Promise<CalendarMembership[]> {
  await verified(client, session);
  const result = await rows(client, session, 'memberships');
  if (result.some(r => r.user_id !== session.user.id || !uuid(r.workspace_id) || typeof r.role !== 'string') || new Set(result.map(r => r.workspace_id)).size !== result.length) throw new Error('CALENDAR_MEMBERSHIP_SCOPE_REVIEW');
  return result as unknown as CalendarMembership[];
}
export async function readAwsCalendar(client: SupabaseClient<Database>, session: Session, workspaceId: string, offset = 0): Promise<AwsCalendarResult> {
  const memberships = await readAwsCalendarMemberships(client, session);
  if (!memberships.some(r => r.workspace_id === workspaceId)) throw new Error('CALENDAR_WORKSPACE_SCOPE_REVIEW');
  const [workspace, events, members, clients, brands, profile] = await Promise.all([
    rows(client,session,'workspace',workspaceId), rows(client,session,'events',workspaceId,offset),
    rows(client,session,'members',workspaceId), rows(client,session,'clients',workspaceId),
    rows(client,session,'brands'), rows(client,session,'profile'),
  ]);
  const nullableText = (v: unknown) => v === null || typeof v === 'string';
  const date = (v: unknown) => typeof v === 'string' && Number.isFinite(Date.parse(v));
  if (workspace.length !== 1 || workspace[0].id !== workspaceId || typeof workspace[0].name !== 'string' || profile.length !== 1 || profile[0].id !== session.user.id ||
      events.some(r => !uuid(r.id) || r.workspace_id !== workspaceId || typeof r.title !== 'string' || !nullableText(r.brief) || !nullableText(r.caption) || !Array.isArray(r.channels) || r.channels.some(c => typeof c !== 'string') || typeof r.status !== 'string' || typeof r.timezone !== 'string' || !Number.isInteger(r.version) || Number(r.version) < 1 || !date(r.updated_at) || r.start_at !== null && !date(r.start_at) || r.end_at !== null && !date(r.end_at)) ||
      new Set(events.map(r => r.id)).size !== events.length || members.some(r => r.workspace_id !== workspaceId || !uuid(r.user_id) || typeof r.role !== 'string') || clients.some(r => r.workspace_id !== workspaceId || !uuid(r.id) || typeof r.name !== 'string') || brands.some(r => r.user_id !== session.user.id || !uuid(r.id) || typeof r.brand_name !== 'string')) throw new Error('CALENDAR_RESPONSE_SCOPE_REVIEW');
  return { userId: session.user.id, workspaceId, workspaceName: workspace[0].name as string, offset, events: events as unknown as CalendarReadEvent[], membersReturned: members.length, clientsReturned: clients.length, ownBrandsReturned: brands.length };
}

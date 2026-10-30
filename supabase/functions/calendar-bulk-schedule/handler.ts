import { calendarRequestGuard, calendarUser, calendarWorkspace, calendarError, CalendarAccessError, type CalendarDeps } from '../_shared/calendarWorkspaceAccess.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-app-lang',
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ownKeys = (value: object, allowed: string[]) => Object.keys(value).every(key => allowed.includes(key));

export function createHandler(deps: CalendarDeps) { return async (req: Request) => {
  const early = calendarRequestGuard(req, corsHeaders);
  if (early) return early;
  try {
    const { client, user } = await calendarUser(req, deps);
    if (Number(req.headers.get('content-length') ?? 0) > 1048576) throw new CalendarAccessError(413, 'REQUEST_TOO_LARGE');
    const raw = await req.text();
    if (new TextEncoder().encode(raw).length > 1048576) throw new CalendarAccessError(413, 'REQUEST_TOO_LARGE');
    let body: any;
    try { body = JSON.parse(raw); } catch { throw new CalendarAccessError(400, 'INVALID_BULK_SCHEDULE'); }
    if (!body || typeof body !== 'object' || Array.isArray(body) ||
        !ownKeys(body, ['request_id','workspace_id','start_date','end_date','events','distribution_strategy','posting_slots','use_posting_times']) ||
        typeof body.request_id !== 'string' || !uuid.test(body.request_id))
      throw new CalendarAccessError(400, 'INVALID_REQUEST_ID_OR_CONFIG');
    await calendarWorkspace(client, user.id, body.workspace_id, 'edit');
    const start = typeof body.start_date === 'string' ? Date.parse(body.start_date) : NaN;
    const end = typeof body.end_date === 'string' ? Date.parse(body.end_date) : NaN;
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start ||
        !['even','optimal','manual'].includes(body.distribution_strategy) ||
        (body.use_posting_times !== undefined && typeof body.use_posting_times !== 'boolean') ||
        !Array.isArray(body.events) || body.events.length < 1 || body.events.length > 200 ||
        body.events.some((e: any) => !e || typeof e !== 'object' || Array.isArray(e) ||
          !ownKeys(e, ['title','caption','channels','brand_kit_id']) || typeof e.title !== 'string' ||
          !e.title.trim() || e.title.length > 2000 ||
          (e.caption != null && (typeof e.caption !== 'string' || e.caption.length > 20000)) ||
          !Array.isArray(e.channels) || e.channels.length > 20 || e.channels.some((c: any) => typeof c !== 'string' || c.length > 80) ||
          (e.brand_kit_id != null && (typeof e.brand_kit_id !== 'string' || !uuid.test(e.brand_kit_id)))))
      throw new CalendarAccessError(400, 'INVALID_BULK_SCHEDULE');
    const manual = body.distribution_strategy === 'manual';
    if (manual && (!Array.isArray(body.posting_slots) || body.posting_slots.length !== body.events.length ||
        body.posting_slots.some((s: any) => typeof s !== 'string' || !Number.isFinite(Date.parse(s)) || Date.parse(s) < start || Date.parse(s) > end)))
      throw new CalendarAccessError(400, 'INVALID_POSTING_SLOTS');
    // Keep the existing daily distribution/fallback, using UTC so retries are deterministic.
    const days = Math.ceil((end - start) / 86400000);
    const perDay = Math.ceil(body.events.length / days);
    const events = body.events.map((event: any, i: number) => {
      const slot = new Date(manual ? body.posting_slots[i] : start);
      if (!manual) {
        slot.setUTCDate(slot.getUTCDate() + Math.floor(i / perDay));
        slot.setUTCHours((body.distribution_strategy === 'even' ? 9 : 10) + (i % perDay) * (body.distribution_strategy === 'even' ? 3 : 4));
      }
      if (slot.getTime() < start || slot.getTime() > end) throw new CalendarAccessError(400, 'SCHEDULE_OUTSIDE_WINDOW');
      return { title: event.title, caption: event.caption ?? null, channels: event.channels,
        brand_kit_id: event.brand_kit_id ?? null, start_at: slot.toISOString() };
    });
    const config = { workspace_id: body.workspace_id, start_date: new Date(start).toISOString(),
      end_date: new Date(end).toISOString(), events: body.events.map((e: any) => ({title:e.title,caption:e.caption??null,channels:e.channels,brand_kit_id:e.brand_kit_id??null})),
      distribution_strategy: body.distribution_strategy, use_posting_times: body.use_posting_times === true,
      posting_slots: manual ? body.posting_slots.map((s: string) => new Date(s).toISOString()) : null };
    // One caller-authenticated RPC owns job/events/replay persistence. No service client or fallback writes.
    const { data, error } = await client.rpc('schedule_calendar_bulk_atomic', {
      p_request_id: body.request_id, p_workspace_id: body.workspace_id, p_events: events, p_config: config,
    });
    if (error) {
      const mapped: Record<string, [number, string]> = {
        PT409: [409,'REQUEST_ID_REUSED'], '23505': [409,'CALENDAR_CONTENT_CONFLICT'],
        '42501': [403,'WORKSPACE_OR_REFERENCE_FORBIDDEN'], '22023': [400,'INVALID_BULK_SCHEDULE'],
        '22P02': [400,'INVALID_BULK_SCHEDULE'], PGRST202: [503,'CALENDAR_ATOMIC_RPC_UNAVAILABLE'],
        '42883': [503,'CALENDAR_ATOMIC_RPC_UNAVAILABLE'],
      };
      const known = mapped[error.code];
      if (known) throw new CalendarAccessError(known[0], known[1]);
      throw new Error('Atomic calendar request failed');
    }
    if (!data || data.success !== true || typeof data.job_id !== 'string' || !uuid.test(data.job_id) ||
        data.events_created !== events.length || !Array.isArray(data.events) || data.events.length !== events.length ||
        data.events.some((e: any) => e.workspace_id !== body.workspace_id || e.created_by !== user.id ||
          e.owner_id !== user.id || e.status !== 'briefing' || e.auto_render !== false))
      throw new Error('Invalid atomic calendar response');
    return Response.json(data, { headers: corsHeaders });
  } catch (error) { return calendarError(error, corsHeaders); }
}; }

import { useEffect, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { readAwsCalendar, readAwsCalendarMemberships, type CalendarMembership, type AwsCalendarResult } from '@/lib/awsCalendarRead';

/** Mounted with a session key so account/token changes discard every visible result. */
export default function AwsCalendarReadValidation({ session }: { session: Session }) {
  const [memberships, setMemberships] = useState<CalendarMembership[]>([]);
  const [workspace, setWorkspace] = useState('');
  const [result, setResult] = useState<AwsCalendarResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const generation = useRef(0);
  useEffect(() => () => { generation.current++; }, []);
  const button = 'rounded border px-4 py-2 disabled:opacity-50';
  async function loadMemberships() {
    const run = ++generation.current; setBusy(true); setResult(null); setMessage(''); setMemberships([]); setWorkspace('');
    try {
      const rows = await readAwsCalendarMemberships(supabase, session);
      if (run !== generation.current) return;
      setMemberships(rows); setWorkspace(rows[0]?.workspace_id ?? '');
      if (!rows.length) setMessage('No workspace memberships were returned for this account.');
    } catch { if (run === generation.current) setMessage('Workspace reads could not be verified.'); }
    finally { if (run === generation.current) setBusy(false); }
  }
  async function load(offset = 0) {
    const run = ++generation.current; setBusy(true); setResult(null); setMessage('');
    try {
      const rows = await readAwsCalendar(supabase, session, workspace, offset);
      if (run === generation.current && rows.userId === session.user.id && rows.workspaceId === workspace) setResult(rows);
    } catch { if (run === generation.current) setMessage('Calendar reads could not be verified. Check the selected workspace and session.'); }
    finally { if (run === generation.current) setBusy(false); }
  }
  return <section aria-label="Calendar read validation" className="space-y-3 rounded border p-4">
    <h2 className="text-lg font-semibold">Calendar reads</h2>
    <p>Read calendar events from your AWS workspace. Editing and publishing are unavailable here.</p>
    <button className={button} disabled={busy} onClick={loadMemberships}>Load calendar workspaces</button>
    {memberships.length > 0 && <>
      <label className="block">Calendar workspace<select className="ml-2 rounded border p-2" value={workspace} disabled={busy} onChange={e => { generation.current++; setWorkspace(e.target.value); setResult(null); setMessage(''); }}>
        {memberships.map(row => <option key={row.workspace_id} value={row.workspace_id}>{row.workspace_id} ({row.role})</option>)}
      </select></label>
      {memberships.length === 100 && <p>Only the first 100 memberships are shown.</p>}
      <button className={button} disabled={busy || !workspace} onClick={() => load()}>Read selected calendar</button>
    </>}
    {busy && <p role="status">Reading AWS calendar…</p>}
    {message && <p role="alert">{message}</p>}
    {result && <section aria-label="Calendar read results" className="space-y-3">
      <h3>{result.workspaceName}</h3>
      <p>Events returned: {result.events.length}. Members returned: {result.membersReturned}. Clients returned: {result.clientsReturned}. Your brands returned: {result.ownBrandsReturned}. These are bounded page counts.</p>
      {!result.events.length ? <p>No events returned on this page.</p> : <ul className="space-y-3">{result.events.map(event => <li key={event.id} className="rounded border p-3">
        <strong>{event.title}</strong><p>{event.status} · {event.start_at ?? 'Unscheduled'} · {event.timezone}</p>
        {event.caption && <p className="whitespace-pre-wrap">{event.caption}</p>}
      </li>)}</ul>}
      <div className="flex gap-3">
        <button className={button} disabled={busy || result.offset === 0} onClick={() => load(result.offset - 100)}>Previous calendar page</button>
        <button className={button} disabled={busy || result.events.length < 100 || result.offset >= 900} onClick={() => load(result.offset + 100)}>Next calendar page</button>
      </div>
      {result.offset === 900 && result.events.length === 100 && <p>The reviewed page limit has been reached; more events may exist.</p>}
    </section>}
  </section>;
}

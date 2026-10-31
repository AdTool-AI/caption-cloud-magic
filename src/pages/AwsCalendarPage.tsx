import { AwsDraftEditor } from '@/components/aws/AwsDraftEditor';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { readAwsCalendar, readAwsCalendarMemberships, type CalendarMembership, type AwsCalendarResult, type CalendarReadEvent } from '@/lib/awsCalendarRead';
import { CalendarHeroHeader } from '@/components/calendar/CalendarHeroHeader';
import { CalendarBackgroundAurora } from '@/components/calendar/CalendarBackgroundAurora';
import { MonthView } from '@/components/calendar/views/MonthView';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';

export default function AwsCalendarPage() {
  const {session}=useAuth();
  const [memberships,setMemberships]=useState<CalendarMembership[]>([]);
  const [workspace,setWorkspace]=useState('');const [offset,setOffset]=useState(0);
  const [data,setData]=useState<AwsCalendarResult|null>(null);const [selected,setSelected]=useState<CalendarReadEvent|null>(null);
  const [busy,setBusy]=useState(true);const [error,setError]=useState('');const [view,setView]=useState<'month'|'list'>('month');
  const generation=useRef(0);
  const [revision,setRevision]=useState(0);const [editor,setEditor]=useState<{row:CalendarReadEvent|null}|null>(null);
  const canWrite=['owner','admin','editor'].includes(memberships.find(m=>m.workspace_id===workspace)?.role??'');
  useEffect(()=>{
    let active=true;
    setEditor(null);setMemberships([]);setWorkspace('');setData(null);setSelected(null);setError('');setBusy(true);
    if(!session){setBusy(false);return;}
    readAwsCalendarMemberships(supabase,session).then(rows=>{if(active){setMemberships(rows);setWorkspace(rows[0]?.workspace_id??'');if(!rows.length)setBusy(false);}})
      .catch(()=>{if(active){setError('Your workspace could not be loaded. Please try signing in again.');setBusy(false);}});
    return ()=>{active=false;generation.current++;};
  },[session?.access_token]);
  useEffect(()=>{
    if(!workspace||!session)return;
    const run=++generation.current;setBusy(true);setData(null);setSelected(null);setError('');
    readAwsCalendar(supabase,session,workspace,offset).then(result=>{if(run===generation.current&&result.userId===session.user.id&&result.workspaceId===workspace)setData(result);})
      .catch(()=>{if(run===generation.current)setError('Calendar events could not be loaded. Please retry or select another workspace.');})
      .finally(()=>{if(run===generation.current)setBusy(false);});
    return ()=>{generation.current++;};
  },[workspace,offset,session?.access_token,revision]);
  function changeWorkspace(value:string){setEditor(null);generation.current++;setData(null);setSelected(null);setWorkspace(value);setOffset(0);}
  function changePage(value:number){generation.current++;setData(null);setSelected(null);setOffset(value);}
  const visible=data?.userId===session?.user.id&&data.workspaceId===workspace&&data.offset===offset?data:null;
  return <div className="relative isolate mx-auto max-w-7xl space-y-5 p-4 md:p-8">
    <CalendarBackgroundAurora/>
    <div className="flex flex-wrap items-center justify-between gap-4"><h1 className="font-heading text-3xl font-bold">Calendar</h1><span className="rounded-full border px-3 py-1 text-sm">Text drafts</span></div>
    {memberships.length>0&&<label className="flex flex-wrap items-center gap-3">Workspace<select aria-label="Calendar workspace" className="max-w-full rounded-md border bg-background p-2 text-foreground" value={workspace} onChange={e=>changeWorkspace(e.target.value)}>
      {memberships.map(row=><option key={row.workspace_id} value={row.workspace_id}>{visible?.workspaceId===row.workspace_id?visible.workspaceName:row.workspace_id}</option>)}
    </select></label>}
    {memberships.length===100&&<p className="text-sm text-muted-foreground">Showing the first 100 workspace memberships.</p>}
    {busy&&<p role="status">Loading your calendarâ€¦</p>}
    {error&&<p role="alert" className="rounded border border-destructive/50 p-4">{error}</p>}
    {!busy&&!error&&!memberships.length&&<p>No workspace memberships were found for this account.</p>}
    {visible&&<>
      <CalendarHeroHeader eventCount={visible.events.length}/>
      <div className="flex gap-2">{canWrite&&<Button onClick={()=>setEditor({row:null})}>New text draft</Button>}<Button variant="outline" disabled={busy} onClick={()=>setRevision(v=>v+1)}>Refresh calendar</Button></div>
      <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex gap-2"><Button variant={view==='month'?'default':'outline'} onClick={()=>setView('month')}>Month</Button><Button variant={view==='list'?'default':'outline'} onClick={()=>setView('list')}>List</Button></div>
        <p className="text-sm text-muted-foreground">Showing page {offset/100+1}, up to 100 events. More events may exist.</p></div>
      {view==='month'&&<MonthView readOnly posts={visible.events.filter(event=>event.start_at!==null).map(event=>({...event,start_at:event.start_at!}))} onPostClick={event=>setSelected(visible.events.find(row=>row.id===event.id)??null)}/>}
      {view==='list'&&visible.events.length>0&&<div className="space-y-3">{visible.events.map(event=><button key={event.id} className="block w-full rounded-xl border bg-card p-4 text-left hover:border-primary/50" onClick={()=>setSelected(event)}><strong>{event.title}</strong><p className="text-sm text-muted-foreground">{event.start_at??'Unscheduled'} - {event.status}</p></button>)}</div>}
      {!visible.events.length&&<p className="rounded-xl border bg-card p-6">Your calendar has no events on this page.</p>}
      {view==='month'&&visible.events.some(event=>event.start_at===null)&&<section aria-label="Unscheduled events"><h2 className="mb-3 text-lg font-semibold">Unscheduled</h2>{visible.events.filter(event=>event.start_at===null).map(event=><Button key={event.id} variant="outline" className="m-1" onClick={()=>setSelected(event)}>{event.title}</Button>)}</section>}
      <div className="flex gap-3"><Button variant="outline" disabled={busy||offset===0} onClick={()=>changePage(offset-100)}>Previous page</Button><Button variant="outline" disabled={busy||visible.events.length<100||offset>=900} onClick={()=>changePage(offset+100)}>Next page</Button></div>
      {offset===900&&visible.events.length===100&&<p>The current read limit has been reached. More events may exist.</p>}
    </>}
    <Dialog open={!!selected} onOpenChange={open=>{if(!open)setSelected(null);}}><DialogContent><DialogHeader><DialogTitle>{selected?.title}</DialogTitle><DialogDescription>Calendar event</DialogDescription></DialogHeader>{selected&&<div className="space-y-3"><p>{selected.status} - {selected.channels.join(', ')}</p><p>{selected.start_at??'Unscheduled'} - {selected.timezone}</p>{selected.brief&&<p className="whitespace-pre-wrap">{selected.brief}</p>}{selected.caption&&<p className="whitespace-pre-wrap">{selected.caption}</p>}{canWrite&&selected.status==='briefing'&&<Button onClick={()=>{setEditor({row:selected});setSelected(null);}}>Edit text draft</Button>}</div>}</DialogContent></Dialog>
    {session&&editor&&<AwsDraftEditor key={session.user.id+workspace} session={session} workspace={workspace} row={editor.row} open onClose={()=>setEditor(null)} onSaved={()=>{setSelected(null);setRevision(v=>v+1);}}/>}
  </div>;
}

import { useEffect,useRef,useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { readAwsCalendarMemberships,type CalendarMembership } from '@/lib/awsCalendarRead';
import { readAwsPlanner,type AwsPlannerResult,type PlannerPages,type PlannerBlock } from '@/lib/awsPlannerRead';
import { Button } from '@/components/ui/button';
import { Card,CardContent,CardHeader,CardTitle } from '@/components/ui/card';
import { Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription } from '@/components/ui/dialog';
const initial:PlannerPages={plans:0,blocks:0,content:0};
export default function AwsPlannerPage(){
 const {session}=useAuth();const [members,setMembers]=useState<CalendarMembership[]>([]),[workspace,setWorkspace]=useState('');
 const [pages,setPages]=useState<PlannerPages>(initial),[plan,setPlan]=useState(''),[revision,setRevision]=useState(0);
 const [data,setData]=useState<AwsPlannerResult|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(true),[selected,setSelected]=useState<PlannerBlock|null>(null);
 const generation=useRef(0);
 useEffect(()=>{
  let active=true;generation.current++;setMembers([]);setWorkspace('');setData(null);setSelected(null);setError('');setBusy(true);setPlan('');setPages(initial);
  if(!session){setBusy(false);return;}
  readAwsCalendarMemberships(supabase,session).then(rows=>{if(active){setMembers(rows);setWorkspace(rows[0]?.workspace_id??'');if(!rows.length)setBusy(false);}}).catch(()=>{if(active){setError('Your planner workspace could not be loaded. Please sign in again.');setBusy(false);}});
  return()=>{active=false;generation.current++;};
 },[session?.access_token]);
 useEffect(()=>{
  if(!session||!workspace)return;const run=++generation.current;setData(null);setSelected(null);setBusy(true);setError('');
  readAwsPlanner(supabase,session,workspace,pages,plan).then(result=>{if(run===generation.current&&result.userId===session.user.id&&result.workspaceId===workspace)setData(result);}).catch(()=>{if(run===generation.current)setError('The planner could not be loaded. Refresh or select another workspace.');}).finally(()=>{if(run===generation.current)setBusy(false);});
  return()=>{generation.current++;};
 },[workspace,pages.plans,pages.blocks,pages.content,plan,revision,session?.access_token]);
 const visible=data?.userId===session?.user.id&&data.workspaceId===workspace&&JSON.stringify(data.pages)===JSON.stringify(pages)?data:null;
 function changeWorkspace(value:string){generation.current++;setData(null);setWorkspace(value);setPages(initial);setPlan('');}
 function paginate(kind:keyof PlannerPages,value:number){generation.current++;setData(null);setPages(p=>({...p,[kind]:value,...(kind==='plans'?{blocks:0}:{})}));if(kind==='plans')setPlan('');}
 function paging(kind:keyof PlannerPages,count:number){return <div className="mt-3 flex flex-wrap items-center gap-2"><Button variant="outline" disabled={busy||pages[kind]===0} onClick={()=>paginate(kind,pages[kind]-100)}>Previous {kind} page</Button><Button variant="outline" disabled={busy||count<100||pages[kind]>=900} onClick={()=>paginate(kind,pages[kind]+100)}>Next {kind} page</Button><span className="text-sm text-muted-foreground">Page {pages[kind]/100+1}, up to 100 rows</span>{count===100&&pages[kind]===900&&<p>More rows may exist beyond this limit.</p>}</div>;}
 return <div className="mx-auto max-w-7xl space-y-5 p-4 md:p-8"><div className="flex flex-wrap items-center justify-between gap-3"><h1 className="font-heading text-3xl font-bold">Content planner</h1><span className="rounded-full border px-3 py-1 text-sm">Read only</span></div><p className="text-muted-foreground">Browse your AWS weekplans, blocks, and content. Planner editing and draft transfer are being connected.</p>
 <div className="flex flex-wrap items-center gap-3">{members.length>0&&<label>Workspace <select aria-label="Planner workspace" className="rounded-md border bg-background p-2 text-foreground" value={workspace} onChange={e=>changeWorkspace(e.target.value)}>{members.map(m=><option key={m.workspace_id} value={m.workspace_id}>{visible?.workspaceId===m.workspace_id?visible.workspaceName:m.workspace_id}</option>)}</select></label>}<Button variant="outline" disabled={busy||!workspace} onClick={()=>setRevision(v=>v+1)}>Refresh planner</Button><Button variant="outline" asChild><Link to="/calendar">Open calendar</Link></Button></div>
 {members.length===100&&<p>Showing the first 100 workspace memberships.</p>}{busy&&<p role="status">Loading your planner...</p>}{error&&<p role="alert" className="rounded border border-destructive p-4">{error}</p>}{!busy&&!error&&!members.length&&<p>No workspace memberships were found for this account.</p>}
 {visible&&<><Card><CardHeader><CardTitle>Weekplans</CardTitle></CardHeader><CardContent>{visible.plans.length?<><label>Plan <select aria-label="Weekplan" className="rounded-md border bg-background p-2 text-foreground" value={visible.plan?.id??''} onChange={e=>{generation.current++;setData(null);setPlan(e.target.value);setPages(p=>({...p,blocks:0}));}}>{visible.plans.map(p=><option key={p.id} value={p.id}>{p.name} - {p.start_date}</option>)}</select></label>{visible.plan&&<p className="mt-3 text-sm text-muted-foreground">{visible.plan.weeks} week(s) - {visible.plan.timezone} - {visible.plan.status}</p>}</>:<p>No weekplans were returned on this page.</p>}{paging('plans',visible.plans.length)}</CardContent></Card>
 {visible.plan&&<Card><CardHeader><CardTitle>Blocks in {visible.plan.name}</CardTitle></CardHeader><CardContent><div className="space-y-3">{visible.blocks.length?visible.blocks.map(b=><button key={b.id} className="block w-full rounded-lg border p-4 text-left" onClick={()=>setSelected(b)}><strong>{b.title_override??visible.content.find(c=>c.id===b.content_id)?.title??'Planner block'}</strong><p className="text-sm text-muted-foreground">{b.platform} - {b.status}</p><p className="text-sm">{b.start_at} - {b.end_at}</p></button>):<p>No blocks were returned for this plan.</p>}</div>{paging('blocks',visible.blocks.length)}</CardContent></Card>}
 <Card><CardHeader><CardTitle>Workspace content</CardTitle></CardHeader><CardContent><div className="grid gap-3 md:grid-cols-2">{visible.content.length?visible.content.map(c=><article key={c.id} className="rounded-lg border p-4"><h3 className="font-semibold">{c.title}</h3><p className="text-sm text-muted-foreground">{c.type}{c.media_id?' - Linked media':''}</p>{c.caption&&<p className="mt-2 whitespace-pre-wrap">{c.caption}</p>}</article>):<p>No content items were returned on this page.</p>}</div>{paging('content',visible.content.length)}</CardContent></Card></>}
 <Dialog open={!!selected} onOpenChange={v=>{if(!v)setSelected(null);}}><DialogContent><DialogHeader><DialogTitle>{selected?.title_override??'Planner block'}</DialogTitle><DialogDescription>Read-only planner block</DialogDescription></DialogHeader>{selected&&<div className="space-y-3"><p>{selected.platform} - {selected.status}</p><p>{selected.start_at} - {selected.end_at}</p>{selected.caption_override&&<p className="whitespace-pre-wrap">{selected.caption_override}</p>}</div>}</DialogContent></Dialog>
 </div>;
}

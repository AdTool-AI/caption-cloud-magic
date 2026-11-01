import { useEffect,useRef,useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import type { PlannerBlock,PlannerPlan } from '@/lib/awsPlannerRead';
import { createAwsPlannerMutator,type PlannerMutation } from '@/lib/awsPlannerMutations';
import { Button } from '@/components/ui/button';
import { Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription } from '@/components/ui/dialog';
export type PlannerAction={kind:'new-plan'}|{kind:'rename-plan';plan:PlannerPlan}|{kind:'new-block';plan:PlannerPlan}|{kind:'edit-block'|'handoff';plan:PlannerPlan;block:PlannerBlock};
const platforms=['instagram','facebook','linkedin','tiktok','youtube'];
function localUtc(value:string){return new Date(value).toISOString().slice(0,16);}
function instant(value:string){if(!/^20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))throw Error('INVALID_FIELDS');return value+':00Z';}
export function AwsPlannerEditor({session,workspace,action,onClose,onSaved}:{session:Session;workspace:string;action:PlannerAction|null;onClose:()=>void;onSaved:(operation:PlannerMutation['operation'],result:unknown)=>void}){
 const [name,setName]=useState(''),[date,setDate]=useState(''),[weeks,setWeeks]=useState(1),[platform,setPlatform]=useState('instagram'),[caption,setCaption]=useState(''),[start,setStart]=useState(''),[end,setEnd]=useState('');
 const [busy,setBusy]=useState(false),[uncertain,setUncertain]=useState(false),[error,setError]=useState('');
 const generation=useRef(0),inFlight=useRef(false),frozen=useRef<PlannerMutation|null>(null),mutator=useRef<ReturnType<typeof createAwsPlannerMutator>>();
 useEffect(()=>{
  generation.current++;inFlight.current=false;frozen.current=null;setBusy(false);setUncertain(false);setError('');
  const plan=action&&'plan' in action?action.plan:null,block=action&&'block' in action?action.block:null;
  const day=plan?.start_date??new Date().toISOString().slice(0,10);
  setName(block?.title_override??(action?.kind==='rename-plan'?plan?.name??'':''));setCaption(block?.caption_override??'');
  setDate(day);setWeeks(plan?.weeks??1);setPlatform(block?.platform??platforms.find(p=>plan?.default_platforms.includes(p))??'instagram');
  setStart(block?localUtc(block.start_at):day+'T10:00');setEnd(block?localUtc(block.end_at):day+'T11:00');
  return()=>{generation.current++;};
 },[action,workspace,session.user.id,session.access_token]);
 function change():PlannerMutation{
  if(!action)throw Error('SCOPE_CHANGED');
  if(action.kind==='new-plan'||action.kind==='rename-plan')return {operation:'plan',row:action.kind==='rename-plan'?action.plan:null,fields:{name,start_date:date,weeks,timezone:action.kind==='rename-plan'?action.plan.timezone:'UTC',default_platforms:action.kind==='rename-plan'?action.plan.default_platforms:[platform]}};
  if(action.kind==='handoff')return {operation:'handoff',row:action.block,timezone:action.plan.timezone};
  const row=action.kind==='edit-block'?action.block:null;
  return {operation:'block',row,fields:{weekplan_id:action.plan.id,content_id:null,platform,start_at:row&&localUtc(row.start_at)===start?row.start_at:instant(start),end_at:row&&localUtc(row.end_at)===end?row.end_at:instant(end),title_override:name,caption_override:caption,meta:{},...(row?{id:row.id,expected_updated_at:row.updated_at!}:{})}};
 }
 async function submit(){
  if(inFlight.current||!action)return;inFlight.current=true;setBusy(true);setError('');const run=generation.current;
  try{
   mutator.current??=createAwsPlannerMutator(sessionStorage);
   const payload=frozen.current??change();frozen.current=payload;
   const verified=await supabase.auth.getUser(session.access_token);
   if(run!==generation.current)return;
   if(verified.error||verified.data.user?.id!==session.user.id)throw Error('UNAUTHORIZED');
   const result=await mutator.current.run(session.user.id,workspace,payload,(slug,body)=>supabase.functions.invoke(slug,{body,headers:{Authorization:'Bearer '+session.access_token}}));
   if(run===generation.current){onSaved(payload.operation,result);onClose();}
  }catch(e){if(run===generation.current){
   const code=(e as {code?:string}).code??(e as Error).message,retry=code==='RETRY_REQUIRED';
   setUncertain(retry);if(!retry)frozen.current=null;
   setError(retry?'The result could not be confirmed. Retry the same request before making another change.':code==='CONFLICT'||code==='NOT_FOUND'?'The source changed or is no longer available. Close this dialog, refresh the planner, and review it before retrying.':code==='FORBIDDEN'||code==='UNAUTHORIZED'?'Your current session or workspace role cannot make this change.':'This change could not be saved. Check the fields and workspace access, then retry.');
  }}finally{if(run===generation.current){inFlight.current=false;setBusy(false);}}
 }
 const locked=busy||uncertain,isPlan=action?.kind==='new-plan'||action?.kind==='rename-plan',transfer=action?.kind==='handoff',renaming=action?.kind==='rename-plan';
 const input='w-full rounded-md border bg-background p-2 text-foreground';
 const title=action?.kind==='new-plan'?'New weekplan':renaming?'Rename weekplan':transfer?'Create calendar draft':action?.kind==='edit-block'?'Edit text block':'New text block';
 return <Dialog open={!!action} onOpenChange={v=>{if(!v&&!locked)onClose();}}><DialogContent onEscapeKeyDown={e=>{if(locked)e.preventDefault();}} onPointerDownOutside={e=>{if(locked)e.preventDefault();}}><DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{transfer?'Creates a briefing draft in the calendar. Your planner block stays in place.':'Save your content plan and text drafts.'}</DialogDescription></DialogHeader>
 <form className="space-y-3" onSubmit={e=>{e.preventDefault();void submit();}}>
 {transfer?<p>Create a calendar draft from <strong>{action.block.title_override||'this text block'}</strong>? It will not be published or reserve a posting slot.</p>:<>
 <label className="block">{isPlan?'Plan name':'Title'}<input className={input} required maxLength={isPlan?200:500} disabled={locked} value={name} onChange={e=>setName(e.target.value)}/></label>
 {isPlan?<>{!renaming&&<><label className="block">Start date<input className={input} type="date" min="2000-01-01" max="2099-12-31" required disabled={locked} value={date} onChange={e=>setDate(e.target.value)}/></label><label className="block">Weeks<select className={input} disabled={locked} value={weeks} onChange={e=>setWeeks(Number(e.target.value))}>{[1,2,3,4].map(w=><option key={w} value={w}>{w}</option>)}</select></label><p className="text-sm text-muted-foreground">New plans use UTC.</p></>}</>:<><label className="block">Caption<textarea className={input} maxLength={20000} disabled={locked} value={caption} onChange={e=>setCaption(e.target.value)}/></label><label className="block">Start (UTC)<input className={input} type="datetime-local" required disabled={locked} value={start} onChange={e=>setStart(e.target.value)}/></label><label className="block">End (UTC)<input className={input} type="datetime-local" required disabled={locked} value={end} onChange={e=>setEnd(e.target.value)}/></label></>}
 {!renaming&&<label className="block">Platform<select className={input} disabled={locked} value={platform} onChange={e=>setPlatform(e.target.value)}>{[...new Set([...platforms,platform])].map(p=><option key={p} value={p}>{p}</option>)}</select></label>}
 </>}
 {error&&<p role="alert">{error}</p>}{busy&&<p role="status">Saving your planner change...</p>}
 {uncertain?<Button type="button" disabled={busy} onClick={()=>void submit()}>Retry same request</Button>:<div className="flex flex-wrap gap-2"><Button type="submit" disabled={busy}>{transfer?'Create calendar draft':isPlan?'Save weekplan':'Save text block'}</Button><Button type="button" variant="outline" disabled={busy} onClick={onClose}>Cancel</Button></div>}
 </form></DialogContent></Dialog>;
}

import { useEffect,useRef,useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import type { CalendarReadEvent } from '@/lib/awsCalendarRead';
import { createAwsDraftMutator,type DraftFields,type DraftOperation } from '@/lib/awsDraftMutations';
import { Button } from '@/components/ui/button';
import { Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription } from '@/components/ui/dialog';
export function AwsDraftEditor({session,workspace,row,open,onClose,onSaved}:{session:Session;workspace:string;row:CalendarReadEvent|null;open:boolean;onClose:()=>void;onSaved:()=>void}){
 const [fields,setFields]=useState<DraftFields>({title:'',brief:'',caption:'',timezone:'UTC',channels:['instagram']});
 const [busy,setBusy]=useState(false),[uncertain,setUncertain]=useState(false),[error,setError]=useState(''),[deleting,setDeleting]=useState(false);
 const operation=useRef<DraftOperation>('create');const mutator=useRef<ReturnType<typeof createAwsDraftMutator>>();const generation=useRef(0);
 useEffect(()=>{generation.current++;setBusy(false);setUncertain(false);setError('');setDeleting(false);setFields({title:row?.title??'',brief:row?.brief??null,caption:row?.caption??null,timezone:row?.timezone??Intl.DateTimeFormat().resolvedOptions().timeZone??'UTC',channels:row?.channels??['instagram']});return()=>{generation.current++;};},[open,row?.id,workspace,session.user.id]);
 async function submit(kind:DraftOperation){
  if(busy)return;const run=generation.current;setBusy(true);setError('');operation.current=kind;
  try{
   mutator.current??=createAwsDraftMutator(sessionStorage);
   const verified=await supabase.auth.getUser(session.access_token);
   if(verified.error||verified.data.user?.id!==session.user.id)throw new Error('UNAUTHORIZED');
   await mutator.current.run(session.user.id,workspace,kind,fields,row,(slug,body)=>supabase.functions.invoke(slug,{body,headers:{Authorization:'Bearer '+session.access_token}}));
   if(run===generation.current){onSaved();onClose();}
  }catch(e){if(run===generation.current){const code=(e as {code?:string}).code??(e as Error).message;const retry=['RETRY_REQUIRED','DRAFT_EDIT_RETRY_REQUIRED','DRAFT_MUTATION_RETRY_REQUIRED'].includes(code);setUncertain(retry);setError(retry?'The result could not be confirmed. Retry this same request before making another change.':code==='CONFLICT'||code==='DRAFT_EDIT_CONFLICT'?'The draft changed, duplicates existing content, or has linked records. Refresh the calendar and review its content before trying again.':code==='FORBIDDEN'||code==='DRAFT_EDIT_FORBIDDEN'?'Your current workspace role cannot change this draft.':'The draft could not be changed. Check its fields and workspace access, then retry.');}}
  finally{if(run===generation.current)setBusy(false);}
 }
 const locked=busy||uncertain;const input='w-full rounded-md border bg-background p-2 text-foreground';
 return <Dialog open={open} onOpenChange={v=>{if(!v&&!locked)onClose();}}><DialogContent onEscapeKeyDown={e=>{if(locked)e.preventDefault();}} onPointerDownOutside={e=>{if(locked)e.preventDefault();}}><DialogHeader><DialogTitle>{row?'Edit draft':'New text draft'}</DialogTitle><DialogDescription>Text briefing draft. Saving does not publish or reserve a posting slot.</DialogDescription></DialogHeader>
 <form className="space-y-3" onSubmit={e=>{e.preventDefault();void submit(row?'edit':'create');}}>
 <label className="block">Title<input className={input} required maxLength={500} disabled={locked} value={fields.title} onChange={e=>setFields({...fields,title:e.target.value})}/></label>
 <label className="block">Brief<textarea className={input} maxLength={20000} disabled={locked} value={fields.brief??''} onChange={e=>setFields({...fields,brief:e.target.value})}/></label>
 <label className="block">Caption<textarea className={input} maxLength={20000} disabled={locked} value={fields.caption??''} onChange={e=>setFields({...fields,caption:e.target.value})}/></label>
 <label className="block">Timezone<input className={input} required disabled={locked} value={fields.timezone} onChange={e=>setFields({...fields,timezone:e.target.value})}/></label>
 {!row&&<label className="block">Channel<select className={input} disabled={locked} value={fields.channels[0]} onChange={e=>setFields({...fields,channels:[e.target.value]})}>{['instagram','facebook','linkedin','tiktok','youtube'].map(c=><option key={c} value={c}>{c}</option>)}</select></label>}
 {error&&<p role="alert">{error}</p>}{busy&&<p role="status">Saving your draft…</p>}
 {uncertain?<Button type="button" disabled={busy} onClick={()=>void submit(operation.current)}>Retry same request</Button>:<div className="flex flex-wrap gap-2"><Button disabled={busy} type="submit">Save draft</Button><Button variant="outline" type="button" disabled={busy} onClick={onClose}>Cancel</Button>{row&&<Button variant="destructive" type="button" disabled={busy} onClick={()=>setDeleting(true)}>Delete draft</Button>}</div>}
 {deleting&&!uncertain&&<div className="rounded border border-destructive p-3"><p>Delete this draft? Linked drafts cannot be deleted.</p><Button variant="destructive" type="button" disabled={busy} onClick={()=>void submit('delete')}>Confirm delete</Button><Button variant="outline" type="button" disabled={busy} onClick={()=>setDeleting(false)}>Keep draft</Button></div>}
 </form></DialogContent></Dialog>;
}

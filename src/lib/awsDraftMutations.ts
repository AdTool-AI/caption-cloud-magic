import { createCalendarDraftWriter, draftPatch, type CalendarDraftPatch } from './calendarDraftEdit';
import type { CalendarReadEvent } from './awsCalendarRead';
export type DraftOperation = 'create'|'edit'|'delete';
export interface DraftFields { title:string; brief:string|null; caption:string|null; timezone:string; channels:string[] }
type Invoke=(slug:string,body:Record<string,unknown>)=>Promise<{data:unknown;error:unknown}>;
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(v);
export class AwsDraftError extends Error { constructor(public code:string){super(code);} }
const fail=(code:string):never=>{throw new AwsDraftError(code);};
/** Keep uncertain requests across a page reload without storing tokens or draft text. */
export function createAwsDraftMutator(storage:Pick<Storage,'getItem'|'setItem'|'removeItem'>,newId=()=>crypto.randomUUID()) {
 const pending=new Map<string,Promise<unknown>>();
 return {async run(actor:string,workspace:string,operation:DraftOperation,fields:DraftFields|null,row:CalendarReadEvent|null,invoke:Invoke):Promise<unknown>{
  if(!uuid(actor)||!uuid(workspace))fail('SCOPE_CHANGED');
  let body:Record<string,unknown>;
  if(operation==='create'){
   if(!fields)fail('INVALID_DRAFT');
   const patch=draftPatch({title:fields.title,brief:fields.brief,caption:fields.caption,timezone:fields.timezone});
   if(!fields.channels.length||fields.channels.length>5||new Set(fields.channels).size!==fields.channels.length||fields.channels.some(c=>!['instagram','facebook','linkedin','tiktok','youtube'].includes(c)))fail('INVALID_DRAFT');
   body={workspace_id:workspace,draft:{...patch,channels:[...fields.channels]}};
  }else{
   if(!row||row.workspace_id!==workspace||!uuid(row.id)||row.status!=='briefing'||!Number.isInteger(row.version)||row.version<1||!Number.isFinite(Date.parse(row.updated_at)))fail('DRAFT_REQUIRED');
   body={workspace_id:workspace,event_id:row.id,expected_version:row.version,expected_updated_at:row.updated_at};
   if(operation==='edit'){
    if(!fields)fail('INVALID_DRAFT');
    body.patch=draftPatch({title:fields.title,brief:fields.brief,caption:fields.caption,timezone:fields.timezone});
   }
  }
  const serialized=JSON.stringify([actor,operation,body]);
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(serialized));
  const key='adtool:aws-draft:'+Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
  const existing=pending.get(key);if(existing)return existing;
  let id:string;
  try{id=storage.getItem(key)??newId();if(!uuid(id))fail('REQUEST_STORAGE_REQUIRED');storage.setItem(key,id);}catch{fail('REQUEST_STORAGE_REQUIRED');}
  const task=(async()=>{
   if(operation==='edit'){
    const result=await createCalendarDraftWriter(()=>id as ReturnType<typeof crypto.randomUUID>).edit(actor,workspace,row!,body.patch as CalendarDraftPatch,b=>invoke('calendar-edit-draft',b));
    storage.removeItem(key);return result;
   }
   let response:Awaited<ReturnType<Invoke>>;
   try{response=await invoke('calendar-'+operation+'-draft',{...body,request_id:id});}catch{fail('RETRY_REQUIRED');}
   if(response.error){
    const context=(response.error as {context?:unknown}).context;
    if(context instanceof Response){
     if(context.status===401)fail('UNAUTHORIZED');if(context.status===403)fail('FORBIDDEN');
     if(context.status===404)fail('NOT_FOUND');if(context.status===409)fail('CONFLICT');if(context.status===400)fail('INVALID_DRAFT');
    }
    fail('RETRY_REQUIRED');
   }
   const data=response.data as Record<string,unknown>;
   if(!data||data.request_id!==id||data.workspace_id!==workspace||data.draft_only!==true||data.publication_enabled!==false)fail('RETRY_REQUIRED');
   if(operation==='delete'){
    if(data.event_id!==row!.id||data.deleted!==true)fail('RETRY_REQUIRED');
   }else{
    const event=data.event as CalendarReadEvent;
    if(!event||!uuid(event.id)||event.workspace_id!==workspace||event.status!=='briefing'||event.version!==1||!Number.isFinite(Date.parse(event.updated_at))||data.availability_reserved!==false||event.title!==fields!.title||event.brief!==fields!.brief||event.caption!==fields!.caption||event.timezone!==fields!.timezone||event.start_at!==null||event.end_at!==null||JSON.stringify(event.channels)!==JSON.stringify(fields!.channels))fail('RETRY_REQUIRED');
   }
   storage.removeItem(key);return data;
  })().finally(()=>pending.delete(key));pending.set(key,task);return task;
 }};
}

import type { PlannerBlock,PlannerPlan } from './awsPlannerRead';
import { createPlannerBlockWriter,plannerDraftBlock,type DraftBlock } from './plannerBlockWrite';
import { createPlannerHandoffWriter,handoffPayload,handoffInstant } from './plannerHandoff';

export type PlannerOperation='plan'|'block'|'handoff';
export type PlanFields={name:string;start_date:string;weeks:number;timezone:string;default_platforms:string[]};
export type PlannerMutation={operation:'plan';fields:PlanFields;row:PlannerPlan|null}|
 {operation:'block';fields:DraftBlock;row:PlannerBlock|null}|
 {operation:'handoff';row:PlannerBlock;timezone:string};
type Invoke=(slug:string,body:Record<string,unknown>)=>Promise<{data:unknown;error:unknown}>;
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(v);
const canonical=(v:unknown):string=>JSON.stringify(v,(_k,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x);
export class AwsPlannerMutationError extends Error {constructor(public code:string){super(code);}}
const fail=(code:string):never=>{throw new AwsPlannerMutationError(code);};
export function canWriteTextBlock(row:PlannerBlock):boolean{
 return row.status==='draft'&&row.content_id===null&&handoffInstant(row.updated_at)&&!!row.meta&&typeof row.meta==='object'&&!Array.isArray(row.meta)&&Object.keys(row.meta).length===0;
}
function planPayload(workspace:string,fields:PlanFields,row:PlannerPlan|null){
 const f={name:fields.name.trim(),start_date:fields.start_date,weeks:fields.weeks,timezone:fields.timezone,default_platforms:[...fields.default_platforms]};
 const day=new Date(f.start_date+'T00:00:00Z');
 if(!f.name||f.name.length>200||!/^20\d{2}-\d{2}-\d{2}$/.test(f.start_date)||!Number.isFinite(day.getTime())||day.toISOString().slice(0,10)!==f.start_date||!Number.isInteger(f.weeks)||f.weeks<1||f.weeks>4||!f.timezone||f.timezone.length>100||f.default_platforms.length>20||f.default_platforms.some(p=>!/^[a-z][a-z0-9_-]{0,39}$/.test(p))||new Set(f.default_platforms).size!==f.default_platforms.length)fail('INVALID_FIELDS');
 try{new Intl.DateTimeFormat('en',{timeZone:f.timezone}).format(0);}catch{fail('INVALID_FIELDS');}
 if(row){
  if(row.workspace_id!==workspace||!uuid(row.id)||!handoffInstant(row.updated_at)||f.start_date!==row.start_date||f.weeks!==row.weeks||f.timezone!==row.timezone||canonical(f.default_platforms)!==canonical(row.default_platforms))fail('SCOPE_CHANGED');
  return {workspace_id:workspace,...f,id:row.id,expected_updated_at:row.updated_at};
 }
 return {workspace_id:workspace,...f};
}
/** Store only a digest and request ID. Unknown outcomes reuse the ID after reload. */
export function createAwsPlannerMutator(storage:Pick<Storage,'getItem'|'setItem'|'removeItem'>,newId=()=>crypto.randomUUID()){
 const pending=new Map<string,Promise<unknown>>();
 return {async run(actor:string,workspace:string,change:PlannerMutation,invoke:Invoke):Promise<unknown>{
  if(!uuid(actor)||!uuid(workspace))fail('SCOPE_CHANGED');
  let body:Record<string,unknown>;
  if(change.operation==='plan')body=planPayload(workspace,change.fields,change.row);
  else if(change.operation==='block'){
   const row=change.row;
   if(row&&(row.workspace_id!==workspace||!canWriteTextBlock(row)||change.fields.id!==row.id||change.fields.expected_updated_at!==row.updated_at||change.fields.weekplan_id!==row.weekplan_id))fail('SCOPE_CHANGED');
   if(!row&&(change.fields.id!==undefined||change.fields.expected_updated_at!==undefined))fail('SCOPE_CHANGED');
   if(change.fields.content_id!==null||Object.keys(change.fields.meta??{}).length)fail('TEXT_BLOCK_REQUIRED');
   body={workspace_id:workspace,blocks:[plannerDraftBlock(change.fields,workspace)]};
  }else{
   if(!canWriteTextBlock(change.row))fail('TEXT_BLOCK_REQUIRED');
   body={...handoffPayload(workspace,change.timezone,[change.row])};
  }
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical([actor,change.operation,body])));
  const key='adtool:aws-planner:'+Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('');
  if(pending.has(key))return pending.get(key)!;
  let id:string;
  try{id=storage.getItem(key)??newId();if(!uuid(id))fail('REQUEST_STORAGE_REQUIRED');storage.setItem(key,id);}catch{fail('REQUEST_STORAGE_REQUIRED');}
  const request={...body,request_id:id};
  const task=(async()=>{
   const call:Invoke=async(slug,payload)=>{
    let response:Awaited<ReturnType<Invoke>>;
    try{response=await invoke(slug,payload);}catch{return fail('RETRY_REQUIRED');}
    if(response.error){
     const ctx=(response.error as {context?:unknown}).context;
     if(ctx instanceof Response){
      if(ctx.status===401)fail('UNAUTHORIZED');if(ctx.status===403)fail('FORBIDDEN');
      if(ctx.status===404)fail('NOT_FOUND');if(ctx.status===409)fail('CONFLICT');if(ctx.status===400||ctx.status===413)fail('INVALID_FIELDS');
     }
     fail('RETRY_REQUIRED');
    }
    return response;
   };
   let result:unknown;
   if(change.operation==='plan'){
    result=(await call('planner-upsert-weekplan',request)).data;
    const p=result as PlannerPlan;
    if(!p||!uuid(p.id)||p.workspace_id!==workspace||!handoffInstant(p.updated_at)||change.row&&p.id!==change.row.id||p.name!==body.name||p.start_date!==body.start_date||p.weeks!==body.weeks||p.timezone!==body.timezone||canonical(p.default_platforms)!==canonical(body.default_platforms))fail('RETRY_REQUIRED');
   }else if(change.operation==='block'){
    const blocks=await createPlannerBlockWriter(()=>id).save(actor,workspace,[change.fields],b=>call('planner-upsert-blocks',b));
    const p=blocks[0],f=change.fields;
    if(p.content_id!==null||p.platform!==f.platform||p.title_override!==f.title_override||p.caption_override!==f.caption_override||Date.parse(p.start_at)!==Date.parse(f.start_at)||Date.parse(p.end_at)!==Date.parse(f.end_at)||canonical(p.meta)!==canonical(f.meta))fail('RETRY_REQUIRED');
    result=p;
   }else result=await createPlannerHandoffWriter(()=>id).transfer(actor,workspace,change.timezone,[change.row],b=>call('planner-to-calendar',b));
   // Retain successful transfers too: repeating the same source version replays its receipt.
   if(change.operation!=='handoff')storage.removeItem(key);
   return result;
  })().catch(e=>{if(e instanceof AwsPlannerMutationError)throw e;throw new AwsPlannerMutationError('RETRY_REQUIRED');}).finally(()=>pending.delete(key));
  pending.set(key,task);return task;
 }};
}

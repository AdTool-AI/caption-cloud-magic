import {calendarRequestGuard,calendarUser,calendarWorkspace,calendarError,CalendarAccessError,type CalendarDeps} from './calendarWorkspaceAccess.ts';
import {bodyObject,uuid} from './calendarContracts.ts';
import {draftInstant,validateDraftPatch} from './calendarDraftEditHandler.ts';
const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type, x-app-lang'};
const fail=():never=>{throw new CalendarAccessError(400,'INVALID_DRAFT_MUTATION');};
const unavailable=():never=>{throw new CalendarAccessError(503,'DRAFT_MUTATION_RETRY_REQUIRED');};
const channels=['instagram','facebook','linkedin','tiktok','youtube'];
function subject(req:Request,id:string){
 try{
  const token=/^Bearer\s+(\S+)\s*$/i.exec(req.headers.get('authorization')??'')?.[1]??'';
  const parts=token.split('.');if(parts.length!==3||token.length>16384)throw new Error();
  const encoded=parts[1].replace(/-/g,'+').replace(/_/g,'/');const claims=JSON.parse(atob(encoded.padEnd(Math.ceil(encoded.length/4)*4,'=')));
  if(claims.role!=='authenticated'||claims.sub!==id)throw new Error();
 }catch{throw new CalendarAccessError(401,'UNAUTHORIZED');}
}
function rpcError(error:any):never{
 if(error?.code==='42501')throw new CalendarAccessError(403,'DRAFT_MUTATION_FORBIDDEN');
 if(error?.code==='P0002')throw new CalendarAccessError(404,'DRAFT_NOT_FOUND');
 if(error?.code==='22023'&&error?.message==='REQUEST_ID_REUSED')throw new CalendarAccessError(409,'REQUEST_ID_REUSED');
 if(error?.code==='PT409')throw new CalendarAccessError(409,'DRAFT_MUTATION_CONFLICT');
 if(['22023','22007','22008','22P02','23514'].includes(error?.code))fail();
 return unavailable();
}
export function validateDraftCreate(value:unknown):Record<string,unknown>{
 if(!value||typeof value!=='object'||Array.isArray(value))fail();
 const draft=value as Record<string,unknown>;
 if(Object.keys(draft).some(k=>!['title','brief','caption','channels','timezone','start_at','end_at'].includes(k))||typeof draft.title!=='string'||typeof draft.timezone!=='string'||
  !Array.isArray(draft.channels)||draft.channels.length<1||draft.channels.length>5||draft.channels.some(v=>typeof v!=='string'||!channels.includes(v))||new Set(draft.channels).size!==draft.channels.length)fail();
 const {channels:_,...patch}=draft;validateDraftPatch(patch);return draft;
}
function instantEqual(left:unknown,right:unknown){
 if(left===null||right===null)return left===right;
 if(!draftInstant(left)||!draftInstant(right))return false;
 const micros=(value:string)=>BigInt(Date.parse(value))*1000n+BigInt((/\.(\d{1,6})(?:Z|[+-])/.exec(value)?.[1]??'').padEnd(6,'0').slice(3));
 return micros(left)===micros(right);
}
export function createCalendarDraftCreateHandler(deps:CalendarDeps){return async(req:Request):Promise<Response>=>{
 const early=calendarRequestGuard(req,headers);if(early)return early;
 try{
  const {client,user}=await calendarUser(req,deps);subject(req,user.id);
  const body=await bodyObject(req,['request_id','workspace_id','draft']);if(!uuid(body.request_id)||!uuid(body.workspace_id))fail();
  const draft=validateDraftCreate(body.draft);await calendarWorkspace(client,user.id,body.workspace_id,'edit');
  const {data,error}=await client.rpc('create_calendar_draft_atomic',{p_request_id:body.request_id,p_workspace_id:body.workspace_id,p_draft:draft});if(error)rpcError(error);
  const e=data?.event;
  if(!data||!uuid(data.request_id)||!uuid(data.workspace_id)||data.request_id.toLowerCase()!==body.request_id.toLowerCase()||data.workspace_id.toLowerCase()!==body.workspace_id.toLowerCase()||
   data.draft_only!==true||data.publication_enabled!==false||data.availability_reserved!==false||!e||!uuid(e.id)||!uuid(e.workspace_id)||e.workspace_id.toLowerCase()!==body.workspace_id.toLowerCase()||
   e.status!=='briefing'||e.version!==1||!draftInstant(e.updated_at)||e.title!==draft.title||e.brief!==(draft.brief??null)||e.caption!==(draft.caption??null)||e.timezone!==draft.timezone||
   !Array.isArray(e.channels)||JSON.stringify([...e.channels].sort())!==JSON.stringify([...(draft.channels as string[])].sort())||
   !instantEqual(e.start_at,draft.start_at??null)||!instantEqual(e.end_at,draft.end_at??null))unavailable();
  return Response.json({request_id:data.request_id,workspace_id:data.workspace_id,event:{id:e.id,workspace_id:e.workspace_id,title:e.title,brief:e.brief,caption:e.caption,
   channels:e.channels,status:'briefing',start_at:e.start_at,end_at:e.end_at,timezone:e.timezone,version:1,updated_at:e.updated_at},draft_only:true,publication_enabled:false,availability_reserved:false},{headers});
 }catch(error){return calendarError(error,headers);}
};}
export function createCalendarDraftDeleteHandler(deps:CalendarDeps){return async(req:Request):Promise<Response>=>{
 const early=calendarRequestGuard(req,headers);if(early)return early;
 try{
  const {client,user}=await calendarUser(req,deps);subject(req,user.id);
  const body=await bodyObject(req,['request_id','workspace_id','event_id','expected_updated_at','expected_version']);
  if(!uuid(body.request_id)||!uuid(body.workspace_id)||!uuid(body.event_id)||!draftInstant(body.expected_updated_at)||!Number.isInteger(body.expected_version)||body.expected_version<1||body.expected_version>2147483647)fail();
  await calendarWorkspace(client,user.id,body.workspace_id,'edit');
  const {data,error}=await client.rpc('delete_calendar_draft_atomic',{p_request_id:body.request_id,p_workspace_id:body.workspace_id,p_event_id:body.event_id,p_expected_updated_at:body.expected_updated_at,p_expected_version:body.expected_version});if(error)rpcError(error);
  if(!data||!uuid(data.request_id)||!uuid(data.workspace_id)||!uuid(data.event_id)||data.request_id.toLowerCase()!==body.request_id.toLowerCase()||data.workspace_id.toLowerCase()!==body.workspace_id.toLowerCase()||data.event_id.toLowerCase()!==body.event_id.toLowerCase()||data.deleted!==true||data.draft_only!==true||data.publication_enabled!==false)unavailable();
  return Response.json({request_id:data.request_id,workspace_id:data.workspace_id,event_id:data.event_id,deleted:true,draft_only:true,publication_enabled:false},{headers});
 }catch(error){return calendarError(error,headers);}
};}

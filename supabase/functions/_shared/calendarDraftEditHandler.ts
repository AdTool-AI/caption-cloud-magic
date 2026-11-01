import {calendarRequestGuard,calendarUser,calendarWorkspace,calendarError,CalendarAccessError,type CalendarDeps} from './calendarWorkspaceAccess.ts';
import {bodyObject,dateOnly,uuid} from './calendarContracts.ts';
const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'POST, OPTIONS',
 'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type, x-app-lang'};
const textLength=(value:string)=>[...value].length;
export function draftInstant(value:unknown):value is string {
 if(typeof value!=='string'||!/^20\d{2}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)||
 Number(value.slice(11,13))>23||Number(value.slice(14,16))>59||Number(value.slice(17,19))>59||!Number.isFinite(Date.parse(value)))return false;
 try{dateOnly(value.slice(0,10));return true;}catch{return false;}
}
function micros(value:string):bigint {
 const fraction=/\.(\d{1,6})(?:Z|[+-])/.exec(value)?.[1]??'';
 return BigInt(Date.parse(value))*1000n+BigInt(fraction.padEnd(6,'0').slice(3));
}
function subject(req:Request,userId:string){
 // Auth.getUser verifies the bearer first; the claims below only narrow its authority.
 try{
  const token=/^Bearer\s+(\S+)\s*$/i.exec(req.headers.get('authorization')??'')?.[1]??'';
  const parts=token.split('.');if(parts.length!==3||token.length>16384)throw new Error();
  const part=parts[1].replace(/-/g,'+').replace(/_/g,'/');
  const claims=JSON.parse(atob(part.padEnd(Math.ceil(part.length/4)*4,'=')));
  if(claims.role!=='authenticated'||claims.sub!==userId)throw new Error();
 }catch{throw new CalendarAccessError(401,'UNAUTHORIZED');}
}
function fail():never{throw new CalendarAccessError(400,'INVALID_DRAFT_EDIT');}
export function validateDraftPatch(value:unknown):Record<string,unknown>{
 if(!value||typeof value!=='object'||Array.isArray(value))fail();
 const patch=value as Record<string,unknown>,keys=Object.keys(patch);
 if(!keys.length||keys.some(key=>!['title','brief','caption','start_at','end_at','timezone'].includes(key)))fail();
 for(const key of keys){
  const v=patch[key];
  if(key==='title'&&(typeof v!=='string'||!v.trim()||textLength(v)>500))fail();
  if(['brief','caption'].includes(key)&&v!==null&&(typeof v!=='string'||textLength(v)>20000))fail();
  if(key==='timezone'){
   if(typeof v!=='string'||!v||v.length>100)fail();
   try{new Intl.DateTimeFormat('en',{timeZone:v as string}).format();}catch{fail();}
  }
 }
 const start=Object.hasOwn(patch,'start_at'),end=Object.hasOwn(patch,'end_at');
 if(start!==end)fail();
 if(start){
  if(patch.start_at===null&&patch.end_at===null)return patch;
  if(!draftInstant(patch.start_at)||!draftInstant(patch.end_at))fail();
  const duration=micros(patch.end_at as string)-micros(patch.start_at as string);
  if(duration<=0n||duration>604800000000n)fail();
 }
 return patch;
}
function rpcFailure(error:any):never{
 if(error?.code==='42501')throw new CalendarAccessError(403,'DRAFT_EDIT_FORBIDDEN');
 if(error?.code==='P0002')throw new CalendarAccessError(404,'DRAFT_NOT_FOUND');
 if(error?.code==='22023'&&error?.message==='REQUEST_ID_REUSED')throw new CalendarAccessError(409,'REQUEST_ID_REUSED');
 if(error?.code==='PT409')throw new CalendarAccessError(409,'DRAFT_EDIT_CONFLICT');
 if(['22023','22007','22008','22P02','23514'].includes(error?.code))throw new CalendarAccessError(400,'INVALID_DRAFT_EDIT');
 throw new CalendarAccessError(503,'DRAFT_EDIT_RETRY_REQUIRED');
}
export function createCalendarDraftEditHandler(deps:CalendarDeps){return async(req:Request):Promise<Response>=>{
 const early=calendarRequestGuard(req,headers);if(early)return early;
 try{
  const {client,user}=await calendarUser(req,deps);subject(req,user.id);
  const body=await bodyObject(req,['request_id','workspace_id','event_id','expected_updated_at','expected_version','patch']);
  if(!uuid(body.request_id)||!uuid(body.workspace_id)||!uuid(body.event_id)||!draftInstant(body.expected_updated_at)||
   !Number.isInteger(body.expected_version)||body.expected_version<1||body.expected_version>=2147483647)fail();
  const patch=validateDraftPatch(body.patch);
  await calendarWorkspace(client,user.id,body.workspace_id,'edit');
  const {data,error}=await client.rpc('edit_calendar_draft_atomic',{p_request_id:body.request_id,p_workspace_id:body.workspace_id,
   p_event_id:body.event_id,p_expected_updated_at:body.expected_updated_at,p_expected_version:body.expected_version,p_patch:patch});
  if(error)rpcFailure(error);
  const invalid=():never=>{throw new CalendarAccessError(503,'DRAFT_EDIT_RETRY_REQUIRED');};
  const e=data?.event;
  if(!data||!uuid(data.request_id)||data.request_id.toLowerCase()!==body.request_id.toLowerCase()||
   !uuid(data.workspace_id)||data.workspace_id.toLowerCase()!==body.workspace_id.toLowerCase()||
   data.draft_only!==true||data.publication_enabled!==false||data.availability_reserved!==false||
   !e||!uuid(e.id)||e.id.toLowerCase()!==body.event_id.toLowerCase()||!uuid(e.workspace_id)||e.workspace_id.toLowerCase()!==body.workspace_id.toLowerCase()||
   e.status!=='briefing'||e.version!==body.expected_version+1||!draftInstant(e.updated_at)||micros(e.updated_at)<=micros(body.expected_updated_at)||
   typeof e.title!=='string'||!e.title.trim()||textLength(e.title)>500||
   !(e.brief===null||typeof e.brief==='string')||!(e.caption===null||typeof e.caption==='string')||typeof e.timezone!=='string')invalid();
  if(!((e.start_at===null&&e.end_at===null)||(draftInstant(e.start_at)&&draftInstant(e.end_at)&&micros(e.end_at)>micros(e.start_at))))invalid();
  for(const key of Object.keys(patch)){
   if(['start_at','end_at'].includes(key)&&patch[key]!==null){if(!draftInstant(e[key])||micros(e[key])!==micros(patch[key] as string))invalid();}
   else if(e[key]!==patch[key])invalid();
  }
  // Project only the accepted receipt. No upstream diagnostics or private publishing fields.
  return Response.json({request_id:data.request_id,workspace_id:data.workspace_id,event:{id:e.id,workspace_id:e.workspace_id,
   title:e.title,brief:e.brief,caption:e.caption,start_at:e.start_at,end_at:e.end_at,timezone:e.timezone,version:e.version,updated_at:e.updated_at,status:'briefing'},
   draft_only:true,publication_enabled:false,availability_reserved:false},{headers});
 }catch(error){return calendarError(error,headers);}
};}

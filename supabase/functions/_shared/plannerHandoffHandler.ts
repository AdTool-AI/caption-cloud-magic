import {calendarRequestGuard,calendarUser,calendarWorkspace,calendarError,CalendarAccessError,type CalendarDeps} from './calendarWorkspaceAccess.ts';
import {bodyObject,dateOnly,uuid} from './calendarContracts.ts';
const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'POST, OPTIONS',
 'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type, x-app-lang'};
type BlockVersion={id:string;expected_updated_at:string;expected_content_updated_at:string|null};
export function versionInstant(value:unknown):value is string {
 if(typeof value!=='string'||!/^20\d{2}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)||
   Number(value.slice(11,13))>23||Number(value.slice(14,16))>59||Number(value.slice(17,19))>59||!Number.isFinite(Date.parse(value)))return false;
 try{dateOnly(value.slice(0,10));return true;}catch{return false;}
}
function micros(value:string):bigint {
 const fraction=/\.(\d{1,6})(?:Z|[+-])/.exec(value)?.[1]??'';
 return BigInt(Date.parse(value))*1000n+BigInt(fraction.padEnd(6,'0').slice(3));
}
export function validateHandoffBlocks(value:unknown):BlockVersion[]{
 if(!Array.isArray(value)||value.length<1||value.length>50)throw new CalendarAccessError(400,'INVALID_BLOCKS');
 const seen=new Set<string>();
 for(const row of value){
  if(!row||typeof row!=='object'||Array.isArray(row)||Object.keys(row).length!==3||
    Object.keys(row).some(k=>!['id','expected_updated_at','expected_content_updated_at'].includes(k))||
    !uuid(row.id)||!versionInstant(row.expected_updated_at)||
    !(row.expected_content_updated_at===null||versionInstant(row.expected_content_updated_at)))throw new CalendarAccessError(400,'INVALID_BLOCK_VERSION');
  const id=row.id.toLowerCase();if(seen.has(id))throw new CalendarAccessError(400,'DUPLICATE_BLOCK_IDS');seen.add(id);
 }
 return value;
}
function authenticatedSubject(req:Request,userId:string){
 // getUser verified the bearer first; these claims only narrow that identity.
 try{
  const token=/^Bearer\s+(\S+)\s*$/i.exec(req.headers.get('authorization')??'')?.[1]??'';
  const parts=token.split('.');if(parts.length!==3||token.length>16384)throw new Error();
  const payload=parts[1].replace(/-/g,'+').replace(/_/g,'/');
  const claims=JSON.parse(atob(payload.padEnd(Math.ceil(payload.length/4)*4,'=')));
  if(claims.role!=='authenticated'||claims.sub!==userId)throw new Error();
 }catch{throw new CalendarAccessError(401,'UNAUTHORIZED');}
}
function rpcFailure(error:any):never{
 if(error?.code==='42501')throw new CalendarAccessError(403,'HANDOFF_FORBIDDEN');
 if(error?.code==='P0002')throw new CalendarAccessError(404,'HANDOFF_SOURCE_NOT_FOUND');
 if(error?.code==='22023'&&error?.message==='REQUEST_ID_REUSED')throw new CalendarAccessError(409,'REQUEST_ID_REUSED');
 if(error?.code==='22023'&&error?.message==='MEDIA_REVIEW_REQUIRED')throw new CalendarAccessError(400,'MEDIA_REVIEW_REQUIRED');
 if(error?.code==='PT409')throw new CalendarAccessError(409,'HANDOFF_CONFLICT');
 if(['22023','22007','22008','22P02','23514'].includes(error?.code))throw new CalendarAccessError(400,'INVALID_HANDOFF_REQUEST');
 throw new CalendarAccessError(503,'HANDOFF_RETRY_REQUIRED');
}
export function createPlannerHandoffHandler(deps:CalendarDeps){return async(req:Request):Promise<Response>=>{
 const early=calendarRequestGuard(req,headers);if(early)return early;
 try{
  const {client,user}=await calendarUser(req,deps);authenticatedSubject(req,user.id);
  const body=await bodyObject(req,['request_id','workspace_id','timezone','blocks']);
  if(!uuid(body.request_id))throw new CalendarAccessError(400,'REQUEST_ID_REQUIRED');
  if(typeof body.timezone!=='string'||body.timezone.length<1||body.timezone.length>100||!/[A-Za-z]/.test(body.timezone)||/[^A-Za-z0-9_+\-/]/.test(body.timezone))
   throw new CalendarAccessError(400,'INVALID_TIMEZONE');
  const blocks=validateHandoffBlocks(body.blocks);
  await calendarWorkspace(client,user.id,body.workspace_id,'edit');
  const {data,error}=await client.rpc('handoff_planner_drafts_atomic',{
   p_request_id:body.request_id,p_workspace_id:body.workspace_id,p_timezone:body.timezone,p_blocks:blocks});
  if(error)rpcFailure(error);
  const invalid=():never=>{throw new CalendarAccessError(503,'HANDOFF_RETRY_REQUIRED');};
  if(!data||!uuid(data.request_id)||data.request_id.toLowerCase()!==body.request_id.toLowerCase()||
    !uuid(data.workspace_id)||data.workspace_id.toLowerCase()!==body.workspace_id.toLowerCase()||data.timezone!==body.timezone||
    data.draft_only!==true||data.publication_enabled!==false||data.source_blocks_unchanged!==true||data.availability_reserved!==false||
    !Array.isArray(data.results)||data.results.length!==blocks.length)invalid();
  const eventIds=new Set<string>();
  const results=data.results.map((row:any,index:number)=>{
   if(!row||!uuid(row.block_id)||row.block_id.toLowerCase()!==blocks[index].id.toLowerCase()||!uuid(row.event_id)||
     eventIds.has(row.event_id.toLowerCase())||row.status!=='briefing'||!versionInstant(row.source_block_version)||
     micros(row.source_block_version)!==micros(blocks[index].expected_updated_at))invalid();
   eventIds.add(row.event_id.toLowerCase());
   return {block_id:row.block_id,event_id:row.event_id,status:'briefing',source_block_version:row.source_block_version};
  });
  // Explicit projection prevents receipt hashes or private binding fields leaking.
  return Response.json({request_id:data.request_id,workspace_id:data.workspace_id,timezone:data.timezone,results,
   draft_only:true,publication_enabled:false,source_blocks_unchanged:true,availability_reserved:false},{headers});
 }catch(error){return calendarError(error,headers);}
};}

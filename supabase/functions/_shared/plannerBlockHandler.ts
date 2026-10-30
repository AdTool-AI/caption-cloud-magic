import {calendarRequestGuard,calendarUser,calendarWorkspace,calendarError,CalendarAccessError,type CalendarDeps} from './calendarWorkspaceAccess.ts';
import {bodyObject,uuid,dateOnly} from './calendarContracts.ts';
const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type, x-app-lang'};
function instant(value:unknown):number{
 if(typeof value!=='string'||!/^20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)||Number(value.slice(11,13))>23||Number(value.slice(14,16))>59||Number(value.slice(17,19))>59)throw new CalendarAccessError(400,'INVALID_DATE');
 dateOnly(value.slice(0,10));const time=Date.parse(value);if(!Number.isFinite(time))throw new CalendarAccessError(400,'INVALID_DATE');return time;
}
export function validateBlocks(value:unknown):Record<string,any>[]{
 if(!Array.isArray(value)||value.length<1||value.length>100)throw new CalendarAccessError(400,'INVALID_BLOCKS');
 const seen=new Set<string>();
 const allowed=['id','weekplan_id','content_id','platform','start_at','end_at','title_override','caption_override','meta','expected_updated_at'];
 for(const block of value){
  if(!block||typeof block!=='object'||Array.isArray(block)||Object.keys(block).some(k=>!allowed.includes(k)))throw new CalendarAccessError(400,'INVALID_BLOCK');
  if(!uuid(block.weekplan_id)||(block.content_id!==undefined&&block.content_id!==null&&!uuid(block.content_id))||typeof block.platform!=='string'||!/^[a-z][a-z0-9_-]{0,39}$/.test(block.platform))throw new CalendarAccessError(400,'INVALID_BLOCK');
  const start=instant(block.start_at),end=instant(block.end_at);
  if(end<=start||end-start>7*24*60*60*1000)throw new CalendarAccessError(400,'INVALID_BLOCK_RANGE');
  for(const [key,limit] of [['title_override',500],['caption_override',20000]] as const){
   if(block[key]!==undefined&&block[key]!==null&&(typeof block[key]!=='string'||block[key].length>limit))throw new CalendarAccessError(400,'INVALID_BLOCK_TEXT');
  }
  if(block.meta!==undefined&&(!block.meta||typeof block.meta!=='object'||Array.isArray(block.meta)||new TextEncoder().encode(JSON.stringify(block.meta)).length>16000))throw new CalendarAccessError(400,'INVALID_BLOCK_META');
  if('id' in block){
   if(!uuid(block.id))throw new CalendarAccessError(400,'INVALID_BLOCK_ID');
   const key=block.id.toLowerCase();if(seen.has(key))throw new CalendarAccessError(400,'DUPLICATE_BLOCK_IDS');seen.add(key);
   instant(block.expected_updated_at); // Validate without reserializing: PostgreSQL microseconds are preserved.
  }else if('expected_updated_at' in block)throw new CalendarAccessError(400,'INVALID_CREATE_VERSION');
 }
 return value;
}
function rpcError(error:any):never{
 if(error?.code==='42501')throw new CalendarAccessError(403,'WRITE_FORBIDDEN');
 if(error?.code==='P0002')throw new CalendarAccessError(404,'RECORD_NOT_FOUND');
 if(error?.code==='22023'&&error?.message==='REQUEST_ID_REUSED')throw new CalendarAccessError(409,'REQUEST_ID_REUSED');
 if(error?.code==='PT409')throw new CalendarAccessError(409,'STALE_WRITE_RETRY_REQUIRED');
 if(['22023','22007','22008','22P02','23514'].includes(error?.code))throw new CalendarAccessError(400,'INVALID_WRITE_REQUEST');
 throw new CalendarAccessError(503,'WRITE_RETRY_REQUIRED');
}
export function createPlannerBlockHandler(deps:CalendarDeps){return async(req:Request):Promise<Response>=>{
 const early=calendarRequestGuard(req,headers);if(early)return early;
 try{
  const {client,user}=await calendarUser(req,deps);
  const body=await bodyObject(req,['request_id','workspace_id','blocks']);
  if(!uuid(body.request_id))throw new CalendarAccessError(400,'REQUEST_ID_REQUIRED');
  const blocks=validateBlocks(body.blocks);
  await calendarWorkspace(client,user.id,body.workspace_id,'edit');
  const {data,error}=await client.rpc('upsert_planner_blocks_atomic',{p_request_id:body.request_id,p_workspace_id:body.workspace_id,p_blocks:blocks});
  if(error)rpcError(error);
  if(!data||!Array.isArray(data.results)||data.results.length!==blocks.length||data.results.some((r:any)=>!r||!uuid(r.id)||r.workspace_id!==body.workspace_id||r.status!=='draft'||typeof r.updated_at!=='string'))throw new CalendarAccessError(503,'WRITE_FAILED');
  return Response.json(data,{headers});
 }catch(error){return calendarError(error,headers);}
};}

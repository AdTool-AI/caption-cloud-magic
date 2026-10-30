import {calendarRequestGuard,calendarUser,calendarWorkspace,calendarError,CalendarAccessError,type CalendarDeps} from './calendarWorkspaceAccess.ts';
import {bodyObject,uuid,dateOnly} from './calendarContracts.ts';
const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type, x-app-lang'};
function instant(value:unknown){
 if(typeof value!=='string'||!/^20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)||Number(value.slice(11,13))>23||Number(value.slice(14,16))>59||Number(value.slice(17,19))>59)throw new CalendarAccessError(400,'INVALID_DATE');
 dateOnly(value.slice(0,10));const parsed=Date.parse(value);if(!Number.isFinite(parsed))throw new CalendarAccessError(400,'INVALID_DATE');return value;
}
function rpcError(error:any):never{
 if(error?.code==='42501')throw new CalendarAccessError(403,'WRITE_FORBIDDEN');
 if(error?.code==='P0002')throw new CalendarAccessError(404,'RECORD_NOT_FOUND');
 if(error?.code==='22023'&&error?.message==='REQUEST_ID_REUSED')throw new CalendarAccessError(409,'REQUEST_ID_REUSED');
 if(error?.code==='PT409'&&['STALE_PLAN','POST_CHANGED','RETRY_REQUIRED'].includes(error?.message))throw new CalendarAccessError(409,'STALE_WRITE_RETRY_REQUIRED');
 if(['22023','22007','22008','22P02'].includes(error?.code))throw new CalendarAccessError(400,'INVALID_WRITE_REQUEST');
 if(['40001','55P03','57014','40P01','25001'].includes(error?.code))throw new CalendarAccessError(503,'WRITE_RETRY_REQUIRED');
 throw new CalendarAccessError(503,'WRITE_FAILED');
}
export function createWriteHandler(slug:'planner-upsert-weekplan'|'calendar-reschedule',deps:CalendarDeps){return async(req:Request)=>{
 const early=calendarRequestGuard(req,headers);if(early)return early;
 try{
  const {client,user}=await calendarUser(req,deps);
  const body=await bodyObject(req,slug==='planner-upsert-weekplan'?['request_id','id','workspace_id','name','start_date','weeks','timezone','default_platforms','expected_updated_at']:['request_id','eventId','scheduledAt']);
  if(!uuid(body.request_id))throw new CalendarAccessError(400,'REQUEST_ID_REQUIRED');
  if(slug==='calendar-reschedule'){
   if(!uuid(body.eventId))throw new CalendarAccessError(400,'INVALID_POST');instant(body.scheduledAt);
   const {data,error}=await client.rpc('reschedule_post_guarded',{p_request_id:body.request_id,p_post_id:body.eventId,p_scheduled_at:body.scheduledAt});
   if(error)rpcError(error);if(!data||typeof data!=='object')throw new CalendarAccessError(503,'WRITE_FAILED');
   return Response.json(data,{status:data.code==='SCHEDULE_CONFLICT'?409:200,headers});
  }
  if(body.id!==undefined&&!uuid(body.id))throw new CalendarAccessError(400,'INVALID_PLAN');
  dateOnly(body.start_date);if(body.start_date>'2099-12-31'||typeof body.name!=='string'||!body.name.trim()||body.name.length>200||!Number.isInteger(body.weeks)||body.weeks<1||body.weeks>4)throw new CalendarAccessError(400,'INVALID_WEEKPLAN');
  const timezone=body.timezone??'Europe/Berlin';if(typeof timezone!=='string'||timezone.length>100)throw new CalendarAccessError(400,'INVALID_TIMEZONE');
  try{new Intl.DateTimeFormat('en',{timeZone:timezone}).format();}catch{throw new CalendarAccessError(400,'INVALID_TIMEZONE');}
  const platforms=body.default_platforms??[];
  if(!Array.isArray(platforms)||platforms.length>20||platforms.some(p=>typeof p!=='string'||!/^[a-z][a-z0-9_-]{0,39}$/i.test(p))||new Set(platforms.map(p=>p.toLowerCase())).size!==platforms.length)throw new CalendarAccessError(400,'INVALID_PLATFORMS');
  if(body.id!==undefined)instant(body.expected_updated_at);else if(body.expected_updated_at!==undefined)throw new CalendarAccessError(400,'INVALID_CREATE_VERSION');
  await calendarWorkspace(client,user.id,body.workspace_id,'edit');
  const config:any={name:body.name.trim(),start_date:body.start_date,weeks:body.weeks,timezone,default_platforms:platforms};
  if(body.id!==undefined)config.expected_updated_at=body.expected_updated_at;
  const {data,error}=await client.rpc('upsert_weekplan_guarded',{p_request_id:body.request_id,p_workspace_id:body.workspace_id,p_plan_id:body.id??null,p_body:config});
  if(error)rpcError(error);if(!data||typeof data!=='object'||!uuid(data.id)||data.workspace_id!==body.workspace_id)throw new CalendarAccessError(503,'WRITE_FAILED');
  return Response.json(data,{headers});
 }catch(error){return calendarError(error,headers);}
};}

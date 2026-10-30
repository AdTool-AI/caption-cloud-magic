import { calendarRequestGuard, calendarUser, calendarWorkspace, calendarError, CalendarAccessError, type CalendarDeps } from '../_shared/calendarWorkspaceAccess.ts';
import { bodyObject, uuid, minutes, readRows } from '../_shared/calendarContracts.ts';
const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type, x-app-lang'};
export function createHandler(deps:CalendarDeps){return async(req:Request)=>{
  const early=calendarRequestGuard(req,headers);if(early)return early;
  try{
    const {client,user}=await calendarUser(req,deps);
    const body=await bodyObject(req,['workspace_id','name','template_event','recurrence_pattern','auto_render','video_template_id']);
    await calendarWorkspace(client,user.id,body.workspace_id,'admin');
    const t=body.template_event;
    if(typeof body.name!=='string'||!body.name.trim()||body.name.length>200||!['daily','weekly','monthly'].includes(body.recurrence_pattern)||
      (body.auto_render!==undefined&&typeof body.auto_render!=='boolean')||!t||typeof t!=='object'||Array.isArray(t)||
      Object.keys(t).some(k=>!['title','caption','channels','brand_kit_id','assignees','eta_minutes','status','workspace_id','created_by','owner_id'].includes(k))||
      typeof t.title!=='string'||!t.title.trim()||t.title.length>2000||
      (t.caption!=null&&(typeof t.caption!=='string'||t.caption.length>20000))||
      !Array.isArray(t.channels)||!t.channels.length||t.channels.length>20||t.channels.some((c:unknown)=>typeof c!=='string'||!c.trim()||c.length>80)||
      (t.status!==undefined&&!['draft','briefing'].includes(t.status))||
      (t.eta_minutes!==undefined&&!minutes(t.eta_minutes))||
      (t.assignees!==undefined&&(!Array.isArray(t.assignees)||t.assignees.length>100||t.assignees.some((id:unknown)=>!uuid(id))||new Set(t.assignees).size!==t.assignees.length)))
      throw new CalendarAccessError(400,'INVALID_RECURRING_RULE');
    if(body.auto_render===true)throw new CalendarAccessError(409,'RECURRING_AUTO_RENDER_NOT_AVAILABLE');
    if(t.brand_kit_id!=null){
      if(!uuid(t.brand_kit_id))throw new CalendarAccessError(400,'INVALID_BRAND');
      const brand=await client.from('brand_kits').select('id').eq('id',t.brand_kit_id).eq('user_id',user.id).maybeSingle();
      if(brand.error)throw new CalendarAccessError(503,'REFERENCE_CHECK_FAILED');
      if(!brand.data)throw new CalendarAccessError(403,'REFERENCE_FORBIDDEN');
    }
    if(body.video_template_id!=null){
      if(!uuid(body.video_template_id))throw new CalendarAccessError(400,'INVALID_VIDEO_TEMPLATE');
      const template=await client.from('video_templates').select('id').eq('id',body.video_template_id).eq('is_public',true).maybeSingle();
      if(template.error)throw new CalendarAccessError(503,'REFERENCE_CHECK_FAILED');
      if(!template.data)throw new CalendarAccessError(403,'REFERENCE_FORBIDDEN');
    }
    if(t.assignees?.length){
      const members=await readRows(client.from('workspace_members').select('user_id',{count:'exact'}).eq('workspace_id',body.workspace_id));
      const ids=new Set(members.map(m=>m.user_id));
      if(t.assignees.some((id:string)=>!ids.has(id)))throw new CalendarAccessError(403,'REFERENCE_FORBIDDEN');
    }
    const next=new Date();next.setUTCDate(next.getUTCDate()+(body.recurrence_pattern==='weekly'?7:1));
    if(body.recurrence_pattern==='monthly'){const now=new Date();next.setUTCDate(1);next.setUTCFullYear(now.getUTCFullYear(),now.getUTCMonth()+1,Math.min(now.getUTCDate(),new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth()+2,0)).getUTCDate()));}
    next.setUTCHours(9,0,0,0);
    const event={title:t.title.trim(),caption:t.caption??null,channels:t.channels,brand_kit_id:t.brand_kit_id??null,
      assignees:t.assignees??[],eta_minutes:t.eta_minutes??0,status:'briefing',workspace_id:body.workspace_id,created_by:user.id,owner_id:user.id};
    const saved=await client.from('recurring_event_rules').insert({workspace_id:body.workspace_id,name:body.name.trim(),template_event:event,
      recurrence_pattern:body.recurrence_pattern,auto_render:false,video_template_id:body.video_template_id??null,next_execution:next.toISOString(),is_active:false}).select('id,next_execution').single();
    if(saved.error||!saved.data?.id)throw new CalendarAccessError(503,'RECURRING_RULE_SAVE_FAILED');
    return Response.json({success:true,rule_id:saved.data.id,next_execution:saved.data.next_execution,is_active:false,execution_enabled:false},{headers});
  }catch(error){return calendarError(error,headers);}
};}

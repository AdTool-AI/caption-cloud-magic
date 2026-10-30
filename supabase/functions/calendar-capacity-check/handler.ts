import { calendarRequestGuard, calendarUser, calendarWorkspace, calendarError, CalendarAccessError, type CalendarDeps } from '../_shared/calendarWorkspaceAccess.ts';
import { bodyObject, uuid, dateOnly, minutes, readRows } from '../_shared/calendarContracts.ts';
const headers = {'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type, x-app-lang'};

export function createHandler(deps:CalendarDeps) { return async(req:Request) => {
  const early=calendarRequestGuard(req,headers); if(early)return early;
  try {
    const {client,user}=await calendarUser(req,deps);
    const body=await bodyObject(req,['workspace_id','week_start','assignments']);
    const start=dateOnly(body.week_start);
    const assignments=body.assignments ?? [];
    if(!Array.isArray(assignments)||assignments.length>200||assignments.some(a=>!a||typeof a!=='object'||Array.isArray(a)||
      Object.keys(a).some(k=>!['user_id','eta_minutes'].includes(k))||!uuid(a.user_id)||!minutes(a.eta_minutes)))
      throw new CalendarAccessError(400,'INVALID_ASSIGNMENTS');
    await calendarWorkspace(client,user.id,body.workspace_id,'read');
    const workspace=await client.from('workspaces').select('owner_id').eq('id',body.workspace_id).maybeSingle();
    if(workspace.error||!workspace.data)throw new CalendarAccessError(503,'WORKSPACE_CHECK_FAILED');
    const scope=workspace.data.owner_id===user.id?'workspace':'self';
    let memberQuery=client.from('workspace_members').select('user_id, profiles:user_id(email)',{count:'exact'}).eq('workspace_id',body.workspace_id);
    if(scope==='self')memberQuery=memberQuery.eq('user_id',user.id);
    const members=await readRows(memberQuery);
    if(!members.length||members.length>=1000||new Set(members.map(m=>m.user_id)).size!==members.length||members.some(m=>!uuid(m.user_id)))
      throw new CalendarAccessError(503,'CAPACITY_MEMBERS_UNAVAILABLE');
    const ids=new Set(members.map(m=>m.user_id));
    if(assignments.some(a=>!ids.has(a.user_id)))throw new CalendarAccessError(403,'ASSIGNMENT_OUTSIDE_REPORT_SCOPE');
    const end=new Date(start);end.setUTCDate(end.getUTCDate()+7);
    const events=await readRows(client.from('calendar_events').select('assignees, eta_minutes',{count:'exact'}).eq('workspace_id',body.workspace_id)
      .gte('start_at',start.toISOString()).lt('start_at',end.toISOString()));
    let capacityQuery=client.from('user_capacity').select('user_id, available_minutes',{count:'exact'}).eq('workspace_id',body.workspace_id).eq('week_start',body.week_start);
    if(scope==='self')capacityQuery=capacityQuery.eq('user_id',user.id);
    const settings=await readRows(capacityQuery);
    const capacity=new Map<string,number>();
    for(const row of settings){
      if(!ids.has(row.user_id)||!minutes(row.available_minutes)||capacity.has(row.user_id))throw new CalendarAccessError(503,'INVALID_CAPACITY_DATA');
      capacity.set(row.user_id,row.available_minutes);
    }
    const planned=new Map<string,number>();
    for(const event of events){
      const assignees=event.assignees??[];const eta=event.eta_minutes??0;
      if(!Array.isArray(assignees)||assignees.some(id=>!uuid(id))||new Set(assignees).size!==assignees.length||!minutes(eta))
        throw new CalendarAccessError(503,'INVALID_CAPACITY_DATA');
      for(const id of assignees)if(ids.has(id))planned.set(id,(planned.get(id)??0)+eta/assignees.length);
    }
    for(const a of assignments)planned.set(a.user_id,(planned.get(a.user_id)??0)+a.eta_minutes);
    const users=members.map(m=>{
      const profile=Array.isArray(m.profiles)?m.profiles[0]:m.profiles;
      const email=typeof profile?.email==='string'?profile.email:null;
      const available=capacity.get(m.user_id)??2400;const total=planned.get(m.user_id)??0;
      return {user_id:m.user_id,email,username:email?email.split('@')[0]:'Unknown',available_minutes:available,
        planned_minutes:Math.round(total),remaining_minutes:Math.round(available-total),
        utilization_percent:available===0?(total===0?0:null):Math.round(total/available*100),overbooked:total>available};
    });
    return Response.json({users,summary:{scope,workspace_report_complete:scope==='workspace',complete_within_scope:true,
      total_users:users.length,overbooked_count:users.filter(u=>u.overbooked).length,week_start:body.week_start,week_end:end.toISOString().slice(0,10)}},{headers});
  }catch(error){return calendarError(error,headers);}
};}

import type { Session,SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import { readAwsCalendarMemberships } from './awsCalendarRead';
import { createCalendarReadQuery } from './calendarReadContract';
import { createPlannerReadQuery,PLANNER_READ_PROJECTIONS,type PlannerReadKind } from './plannerReadContract';
type Row=Record<string,unknown>;
export interface PlannerPlan {id:string;workspace_id:string;name:string;start_date:string;weeks:number;timezone:string;status:string;updated_at:string|null}
export interface PlannerBlock {id:string;workspace_id:string;weekplan_id:string;content_id:string|null;platform:string;start_at:string;end_at:string;title_override:string|null;caption_override:string|null;status:string;updated_at:string|null}
export interface PlannerContent {id:string;workspace_id:string;type:string;title:string;caption:string|null;media_id:string|null;duration_sec:number|null;updated_at:string|null}
export interface PlannerPages {plans:number;blocks:number;content:number}
export interface AwsPlannerResult {userId:string;workspaceId:string;workspaceName:string;pages:PlannerPages;plans:PlannerPlan[];plan:PlannerPlan|null;blocks:PlannerBlock[];content:PlannerContent[]}
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(v);
const text=(v:unknown)=>v===null||typeof v==='string';
const date=(v:unknown)=>typeof v==='string'&&Number.isFinite(Date.parse(v));
const fail=():never=>{throw Error('PLANNER_RESPONSE_SCOPE_REVIEW');};
async function rows(client:SupabaseClient<Database>,session:Session,kind:PlannerReadKind,workspaceId:string,offset:number,planId?:string):Promise<Row[]>{
 const result=await createPlannerReadQuery(client,kind,{workspaceId,offset,planId}).setHeader('Authorization','Bearer '+session.access_token);
 const table=kind==='plans'?'weekplans':kind==='plan_blocks'?'schedule_blocks':'content_items';const fields=PLANNER_READ_PROJECTIONS[table].split(',').sort().join(',');
 if(result.error||!Array.isArray(result.data)||result.data.length>100||result.data.some((r:unknown)=>!r||typeof r!=='object'||Array.isArray(r)||Object.keys(r).sort().join(',')!==fields))fail();
 const values=result.data as Row[];
 if(values.some(r=>!uuid(r.id)||r.workspace_id!==workspaceId)||new Set(values.map(r=>r.id)).size!==values.length)fail();
 return values;
}
export async function readAwsPlanner(client:SupabaseClient<Database>,session:Session,workspaceId:string,pages:PlannerPages,selectedPlanId=''):Promise<AwsPlannerResult>{
 if(!uuid(workspaceId)||Object.values(pages).some(v=>!Number.isInteger(v)||v<0||v>900||v%100!==0))throw Error('PLANNER_PAGE_SCOPE_REVIEW');
 const members=await readAwsCalendarMemberships(client,session);if(!members.some(m=>m.workspace_id===workspaceId))throw Error('PLANNER_WORKSPACE_SCOPE_REVIEW');
 const [workspace,plans,content]=await Promise.all([
  createCalendarReadQuery(client,'workspace',{workspaceId}).setHeader('Authorization','Bearer '+session.access_token),
  rows(client,session,'plans',workspaceId,pages.plans),rows(client,session,'content',workspaceId,pages.content),
 ]);
 if(workspace.error||!Array.isArray(workspace.data)||workspace.data.length!==1||workspace.data[0].id!==workspaceId||typeof workspace.data[0].name!=='string')fail();
 if(plans.some(r=>typeof r.name!=='string'||typeof r.status!=='string'||typeof r.timezone!=='string'||typeof r.start_date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(r.start_date)||!Number.isInteger(r.weeks)||Number(r.weeks)<1||Number(r.weeks)>52||r.updated_at!==null&&!date(r.updated_at)))fail();
 if(content.some(r=>typeof r.title!=='string'||typeof r.type!=='string'||!text(r.caption)||r.media_id!==null&&!uuid(r.media_id)||r.duration_sec!==null&&(!Number.isFinite(r.duration_sec)||Number(r.duration_sec)<0)||r.updated_at!==null&&!date(r.updated_at)))fail();
 const plan=selectedPlanId?plans.find(r=>r.id===selectedPlanId):plans[0];if(selectedPlanId&&!plan)throw Error('PLANNER_PLAN_SCOPE_REVIEW');
 const blocks=plan?await rows(client,session,'plan_blocks',workspaceId,pages.blocks,plan.id as string):[];
 if(blocks.some(r=>r.weekplan_id!==plan?.id||r.content_id!==null&&!uuid(r.content_id)||typeof r.platform!=='string'||typeof r.status!=='string'||!text(r.title_override)||!text(r.caption_override)||!date(r.start_at)||!date(r.end_at)||Date.parse(r.end_at as string)<=Date.parse(r.start_at as string)||r.updated_at!==null&&!date(r.updated_at)))fail();
 return {userId:session.user.id,workspaceId,workspaceName:workspace.data[0].name,pages:{...pages},plans:plans as unknown as PlannerPlan[],plan:plan ? plan as unknown as PlannerPlan : null,blocks:blocks as unknown as PlannerBlock[],content:content as unknown as PlannerContent[]};
}

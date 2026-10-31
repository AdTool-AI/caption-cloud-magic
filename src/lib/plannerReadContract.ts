export const PLANNER_READ_PROJECTIONS={weekplans:'id,workspace_id,name,start_date,weeks,timezone,default_platforms,status,updated_at',schedule_blocks:'id,workspace_id,weekplan_id,content_id,platform,start_at,end_at,title_override,caption_override,status,position,meta,updated_at',content_items:'id,workspace_id,type,title,caption,media_id,duration_sec,targets,updated_at'} as const;
export type PlannerReadKind='plans'|'blocks'|'content'|'plan'|'block'|'content_item'|'plan_blocks';
export interface PlannerReadScope {workspaceId:string;id?:string;planId?:string;offset?:number}
function id(v:unknown):string{if(typeof v!=='string'||!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(v))throw Error('PLANNER_SCOPE_REQUIRED');return v.toLowerCase();}
export function plannerReadPlan(kind:PlannerReadKind,scope:PlannerReadScope){
 const offset=scope.offset??0;if(!Number.isInteger(offset)||offset<0||offset>900||offset%100!==0)throw Error('PLANNER_PAGE_LIMIT');
 const table=kind==='plans'||kind==='plan'?'weekplans':kind==='blocks'||kind==='block'||kind==='plan_blocks'?'schedule_blocks':kind==='content'||kind==='content_item'?'content_items':null;
 if(!table)throw Error('PLANNER_KIND_REQUIRED');const filters:[string,string][]=[['workspace_id',id(scope.workspaceId)]];
 const detail=['plan','block','content_item'].includes(kind);
 if(detail)filters.push(['id',id(scope.id)]);if(kind==='plan_blocks')filters.push(['weekplan_id',id(scope.planId)]);
 return {table,filters,detail,offset};
}
export function canonicalPlannerReadUri(kind:PlannerReadKind,scope:PlannerReadScope){
 const p=plannerReadPlan(kind,scope);const params=new URLSearchParams([['select',PLANNER_READ_PROJECTIONS[p.table]],...p.filters.map(([k,v])=>[k,'eq.'+v])]);
 if(!p.detail)params.set('order','id.asc');params.set('limit',p.detail?'1':'100');if(!p.detail)params.set('offset',String(p.offset));return '/rest/v1/'+p.table+'?'+params.toString();
}
export function isCanonicalPlannerReadUri(uri:string){try{const u=new URL(uri,'https://planner.invalid');const v=(k:string)=>u.searchParams.get(k)?.replace(/^eq\./,'');return (['plans','blocks','content','plan','block','content_item','plan_blocks'] as PlannerReadKind[]).some(k=>{try{return canonicalPlannerReadUri(k,{workspaceId:v('workspace_id')!,id:v('id'),planId:v('weekplan_id'),offset:Number(u.searchParams.get('offset')??0)})===uri;}catch{return false;}});}catch{return false;}}
export function createPlannerReadQuery(client:{from:(table:string)=>any},kind:PlannerReadKind,scope:PlannerReadScope){const p=plannerReadPlan(kind,scope);let q=client.from(p.table).select(PLANNER_READ_PROJECTIONS[p.table]);for(const [k,v]of p.filters)q=q.eq(k,v);if(!p.detail)q=q.order('id',{ascending:true});q=q.limit(p.detail?1:100);if(!p.detail)q=q.range(p.offset,p.offset+99);return q;}

import { describe, expect, it, vi } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { canonicalCalendarReadUri, isCanonicalCalendarReadUri, createCalendarReadQuery, type CalendarReadKind } from '../calendarReadContract';
import { createAwsValidationFetch } from '../awsValidationFetch';
import { readAwsCalendar, readAwsCalendarMemberships } from '../awsCalendarRead';
const actor='10000000-0000-4000-8000-000000000001',workspace='20000000-0000-4000-8000-000000000002';
const other='30000000-0000-4000-8000-000000000003';
const session={user:{id:actor},access_token:'synthetic-token'} as any;
function client(overrides:Record<string,unknown>={}) {
 const data:Record<string,any>={workspace_members:[{user_id:actor,workspace_id:workspace,role:'owner'}],workspaces:[{id:workspace,name:'Test workspace'}],calendar_events:[],clients:[],brand_kits:[],profiles:[{id:actor,email:'test@example.invalid'}],...overrides};
 const reads=vi.fn((table:string)=>{const result={data:data[table],error:null};const q:any={then:(resolve:any)=>Promise.resolve(result).then(resolve)};for(const method of ['select','eq','order','limit','range','setHeader'])q[method]=vi.fn(()=>q);return q;});
 return {from:reads,auth:{getUser:vi.fn().mockResolvedValue({data:{user:{id:actor}},error:null})}} as any;
}
describe('canonical calendar reads',()=>{
 it('actual SDK URLs pass the shared guard for all eight query kinds and bounded pages',async()=>{
  const fetched=vi.fn(async(_input: RequestInfo | URL, _init?: RequestInit)=>new Response('[]',{headers:{'Content-Type':'application/json'}}));
  const url='https://api-prod.useadtool.ai';const guarded=createAwsValidationFetch(fetched as typeof fetch,url);
  const sdk=createClient(url,'synthetic-public',{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:guarded}});
  for(const kind of ['events','event','workspace','members','memberships','clients','brands','profile'] as CalendarReadKind[]){
   for(const offset of [0,100,900]){
    const scope={actorId:actor,workspaceId:workspace,eventId:other,offset};
    const result=await createCalendarReadQuery(sdk,kind,scope);expect(result.error).toBeNull();
    const input=fetched.mock.calls.at(-1)![0] as unknown as string;
    const actual=new URL(input);expect(actual.pathname+actual.search).toBe(canonicalCalendarReadUri(kind,scope));
   }
  }
  expect(fetched).toHaveBeenCalledTimes(24);
 });
 it('rejects expanded columns, duplicate parameters, excessive pages and writes',async()=>{
  const uri=canonicalCalendarReadUri('events',{workspaceId:workspace});
  for(const bad of [uri+'&limit=100',uri.replace('offset=0','offset=1'),uri.replace('offset=0','offset=1000'),uri.replace('%2Ccaption','%2Cpublish_results'),uri.replace('workspace_id=eq.','workspace_id=neq.')])expect(isCanonicalCalendarReadUri(bad)).toBe(false);
  const fetched=vi.fn();const guarded=createAwsValidationFetch(fetched,'https://api-prod.useadtool.ai');
  for(const method of ['POST','PATCH','DELETE','HEAD'])await expect(guarded('https://api-prod.useadtool.ai'+uri,{method})).rejects.toThrow();
  expect(fetched).not.toHaveBeenCalled();
 });
 it('accepts a verified workspace with an empty calendar without treating it as an error',async()=>{
  const result=await readAwsCalendar(client(),session,workspace);expect(result.events).toEqual([]);expect(result.workspaceId).toBe(workspace);
 });
 it('rejects a foreign membership and fails before calendar queries on a missing membership',async()=>{
  await expect(readAwsCalendarMemberships(client({workspace_members:[{workspace_id:workspace,user_id:other,role:'owner'}]}),session)).rejects.toThrow();
  const c=client({workspace_members:[]});await expect(readAwsCalendar(c,session,workspace)).rejects.toThrow();expect(c.from).toHaveBeenCalledTimes(1);
 });
 it('rejects extra response columns and foreign client rows',async()=>{
  for(const override of [{workspaces:[{id:workspace,name:'Test',secret:'hidden'}]},{clients:[{id:other,workspace_id:other,name:'Foreign'}]}])await expect(readAwsCalendar(client(override),session,workspace)).rejects.toThrow();
 });
 it('rejects an expired or mismatched Auth verification before table reads',async()=>{
  const c=client();c.auth.getUser.mockResolvedValue({data:{user:{id:other}},error:null});await expect(readAwsCalendarMemberships(c,session)).rejects.toThrow();expect(c.from).not.toHaveBeenCalled();
 });
});

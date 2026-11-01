import {describe,it,expect,vi} from 'vitest';
import {createHandler as handoff} from '../../../supabase/functions/planner-to-calendar/handler';
import {createHandler as createDraft} from '../../../supabase/functions/calendar-create-draft/handler';
import {createHandler as editDraft} from '../../../supabase/functions/calendar-edit-draft/handler';
import {createHandler as deleteDraft} from '../../../supabase/functions/calendar-delete-draft/handler';
import {createHandler as requestApproval} from '../../../supabase/functions/calendar-request-approval/handler';
import {createHandler as approve} from '../../../supabase/functions/calendar-approve-stage/handler';
import {createHandler as reject} from '../../../supabase/functions/calendar-reject-approval/handler';
const actor='00000000-0000-4000-8000-000000000001',workspace='00000000-0000-4000-8000-000000000002',event='00000000-0000-4000-8000-000000000003',request='00000000-0000-4000-8000-000000000004',approval='00000000-0000-4000-8000-000000000005',other='00000000-0000-4000-8000-000000000006';
const stamp='2026-10-31T10:00:00.123456Z',next='2026-10-31T10:00:00.123457Z';
const base={request_id:request,workspace_id:workspace};
const eventRow={id:event,workspace_id:workspace,title:'Text',brief:null,caption:'Caption',channels:['instagram'],timezone:'UTC',status:'briefing',start_at:null,end_at:null,version:1,updated_at:next};
const draftFlags={...base,draft_only:true,publication_enabled:false,availability_reserved:false};
const cases=[
 {name:'handoff',factory:handoff,body:{...base,timezone:'UTC',blocks:[{id:event,expected_updated_at:stamp,expected_content_updated_at:null}]},receipt:{...draftFlags,timezone:'UTC',source_blocks_unchanged:true,results:[{block_id:event,event_id:other,status:'briefing',source_block_version:stamp}]},rpc:'handoff_planner_drafts_atomic'},
 {name:'create',factory:createDraft,body:{...base,draft:{title:'Text',caption:'Caption',brief:null,channels:['instagram'],timezone:'UTC'}},receipt:{...draftFlags,event:eventRow},rpc:'create_calendar_draft_atomic'},
 {name:'edit',factory:editDraft,body:{...base,event_id:event,expected_version:1,expected_updated_at:stamp,patch:{title:'Text'}},receipt:{...draftFlags,event:{...eventRow,version:2}},rpc:'edit_calendar_draft_atomic'},
 {name:'delete',factory:deleteDraft,body:{...base,event_id:event,expected_version:1,expected_updated_at:stamp},receipt:{...draftFlags,event_id:event,deleted:true},rpc:'delete_calendar_draft_atomic'},
 {name:'approval_request',factory:requestApproval,body:{...base,event_id:event,expected_version:1,expected_updated_at:stamp,approver_ids:[other],expires_at:'2026-11-01T10:00:00Z'},receipt:{event_id:event,batch_id:request,expires_at:'2026-11-01T10:00:00Z',approvals:[{approval_id:approval,approver_id:other}],publication_enabled:false},rpc:'request_calendar_approval_atomic'},
 {name:'approve',factory:approve,body:{...base,approval_id:approval},receipt:{event_id:event,approval_id:approval,decision:'approved',all_approved:true,publication_enabled:false},rpc:'decide_calendar_approval_atomic'},
 {name:'reject',factory:reject,body:{...base,approval_id:approval},receipt:{event_id:event,approval_id:approval,decision:'rejected',all_approved:false,publication_enabled:false},rpc:'decide_calendar_approval_atomic'},
];
function token(role='authenticated',sub=actor){return 'header.'+Buffer.from(JSON.stringify({role,sub})).toString('base64url')+'.verified-by-test-auth';}
function fixture(data:unknown,error:unknown=null,role='owner'){
 const rpc=vi.fn().mockResolvedValue({data,error});
 const client={auth:{getUser:vi.fn().mockResolvedValue({data:{user:{id:actor}},error:null})},rpc,from:vi.fn((table:string)=>{const q:any={};for(const n of ['select','eq'])q[n]=()=>q;q.maybeSingle=async()=>({data:table==='workspaces'?{id:workspace,owner_id:role==='owner'?actor:other}:{role},error:null});return q;})};
 const deps={createClient:vi.fn(()=>client),env:(name:string)=>({SUPABASE_URL:'http://isolated.invalid',SUPABASE_ANON_KEY:'synthetic-public'}[name])};return {rpc,client,deps};
}
function req(body:unknown,headers:Record<string,string>={},method='POST'){return new Request('http://isolated.invalid/handler',{method,headers:{Authorization:'Bearer '+token(),'Content-Type':'application/json',...headers},...(method==='POST'?{body:JSON.stringify(body)}:{})});}
describe.each(cases)('$name accepted handler',c=>{
 it('rejects unsupported methods and QA flags before authenticating',async()=>{const f=fixture(c.receipt),h=c.factory(f.deps);expect((await h(req({}, {},'DELETE'))).status).toBe(405);expect((await h(req({}, {'x-qa-test':'1'}))).status).toBe(403);expect(f.deps.createClient).not.toHaveBeenCalled();expect(f.rpc).not.toHaveBeenCalled();});
 it('rejects missing authorization and service claims without RPC writes',async()=>{const f=fixture(c.receipt),h=c.factory(f.deps);expect((await h(req(c.body,{Authorization:''}))).status).toBe(401);expect((await h(req(c.body,{Authorization:'Bearer '+token('service_role')}))).status).toBe(401);expect(f.rpc).not.toHaveBeenCalled();});
 it('rejects unknown body fields',async()=>{const f=fixture(c.receipt);expect((await c.factory(f.deps)(req({...c.body,service_role:true}))).status).toBe(400);expect(f.rpc).not.toHaveBeenCalled();});
 it('dispatches only the accepted atomic RPC with the caller identity',async()=>{const f=fixture({...c.receipt,private_diagnostic:'must not escape'});const response=await c.factory(f.deps)(req(c.body));expect(response.status).toBe(200);expect(f.rpc).toHaveBeenCalledTimes(1);expect(f.rpc.mock.calls[0][0]).toBe(c.rpc);expect(f.rpc.mock.calls[0][1].p_request_id).toBe(request);expect(f.deps.createClient.mock.calls[0][1]).toBe('synthetic-public');expect(f.deps.createClient.mock.calls[0][2].global.headers.Authorization).toBe('Bearer '+token());const receipt=await response.json();expect(receipt.publication_enabled).toBe(false);expect(receipt.private_diagnostic).toBeUndefined();});
 it('fails closed on malformed receipts',async()=>{const f=fixture({...c.receipt,publication_enabled:true});expect((await c.factory(f.deps)(req(c.body))).status).toBe(503);});
 it('preserves authorization and stale-write failures',async()=>{for(const [code,status]of [['42501',403],['PT409',409],['P0002',404]]){const f=fixture(null,{code,message:'private database detail'});const response=await c.factory(f.deps)(req(c.body));expect(response.status).toBe(status);expect(await response.text()).not.toContain('private database detail');}});
});
it('viewer membership cannot create, edit, delete, hand off or request approval',async()=>{for(const c of cases.filter(c=>!['approve','reject'].includes(c.name))){const f=fixture(c.receipt,null,'viewer');expect((await c.factory(f.deps)(req(c.body))).status).toBe(403);expect(f.rpc).not.toHaveBeenCalled();}});

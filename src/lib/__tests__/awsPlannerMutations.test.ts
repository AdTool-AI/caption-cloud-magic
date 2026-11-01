import { beforeEach,expect,it,vi } from 'vitest';
import { webcrypto } from 'node:crypto';
import { createAwsPlannerMutator,canWriteTextBlock,type PlannerMutation } from '../awsPlannerMutations';
import { createAwsValidationFetch } from '../awsValidationFetch';
const actor='00000000-0000-4000-8000-000000000001',workspace='00000000-0000-4000-8000-000000000002',id='00000000-0000-4000-8000-000000000003',blockId='00000000-0000-4000-8000-000000000004',requestId='00000000-0000-4000-8000-000000000005';
const version='2026-10-31T10:00:00.123456Z';
const fields={name:'Plan',start_date:'2027-01-04',weeks:1,timezone:'UTC',default_platforms:['instagram']};
const plan={id,workspace_id:workspace,...fields,status:'draft',updated_at:version};
const block={id:blockId,workspace_id:workspace,weekplan_id:id,content_id:null,platform:'instagram',start_at:'2027-01-05T10:00:00Z',end_at:'2027-01-05T11:00:00Z',title_override:'Text',caption_override:'Caption',status:'draft',meta:{},updated_at:version};
const create:PlannerMutation={operation:'plan',fields,row:null};
beforeEach(()=>{Object.defineProperty(globalThis,'crypto',{value:webcrypto,configurable:true});sessionStorage.clear();});
it('reuses uncertain request identity after reload without storing draft text or tokens',async()=>{
 const first=vi.fn().mockRejectedValue(Error('network'));
 await expect(createAwsPlannerMutator(sessionStorage,()=>requestId).run(actor,workspace,create,first)).rejects.toMatchObject({code:'RETRY_REQUIRED'});
 expect(JSON.stringify({...sessionStorage})).not.toContain('2027-01-04');
 const invoke=vi.fn().mockResolvedValue({data:plan,error:null});
 await createAwsPlannerMutator(sessionStorage,()=>{throw Error('new request');}).run(actor,workspace,create,invoke);
 expect(invoke.mock.calls[0][1].request_id).toBe(requestId);expect(sessionStorage.length).toBe(0);
});
it('deduplicates concurrent create clicks',async()=>{
 let resolve!:(r:unknown)=>void;const invoke=vi.fn(()=>new Promise<any>(r=>resolve=r));
 const m=createAwsPlannerMutator(sessionStorage,()=>requestId),a=m.run(actor,workspace,create,invoke),b=m.run(actor,workspace,create,invoke);
 await vi.waitFor(()=>expect(invoke).toHaveBeenCalledTimes(1));resolve({data:plan,error:null});await Promise.all([a,b]);
});
it('rejects invalid dates and stale scope before invoking',async()=>{
 const invoke=vi.fn(),m=createAwsPlannerMutator(sessionStorage,()=>requestId);
 await expect(m.run(actor,workspace,{...create,fields:{...fields,start_date:'2027-02-30'}},invoke)).rejects.toThrow();
 await expect(m.run(actor,workspace,{operation:'plan',row:{...plan,workspace_id:actor},fields},invoke)).rejects.toThrow();
 expect(invoke).not.toHaveBeenCalled();
});
it('sends the exact loaded timestamp on rename and rejects mismatched receipts',async()=>{
 const invoke=vi.fn().mockResolvedValue({data:{...plan,workspace_id:actor},error:null});
 await expect(createAwsPlannerMutator(sessionStorage,()=>requestId).run(actor,workspace,{operation:'plan',fields,row:plan},invoke)).rejects.toMatchObject({code:'RETRY_REQUIRED'});
 expect(invoke.mock.calls[0][1].expected_updated_at).toBe(version);expect(sessionStorage.length).toBe(1);
});
it('keeps actor identities separate and reports denied requests',async()=>{
 const invoke=vi.fn().mockResolvedValue({data:null,error:{context:new Response('{}',{status:403})}});
 const m=createAwsPlannerMutator(sessionStorage,()=>requestId);
 await expect(m.run(actor,workspace,create,invoke)).rejects.toMatchObject({code:'FORBIDDEN'});
 await expect(m.run(id,workspace,create,invoke)).rejects.toMatchObject({code:'FORBIDDEN'});
 expect(sessionStorage.length).toBe(2);
});
it('saves an exact text block with its six-digit source version',async()=>{
 const {id:bid,workspace_id,status,updated_at,...f}=block;
 const invoke=vi.fn().mockResolvedValue({data:{results:[block]},error:null});
 await createAwsPlannerMutator(sessionStorage,()=>requestId).run(actor,workspace,{operation:'block',row:block,fields:{...f,id:bid,expected_updated_at:version}},invoke);
 expect(invoke.mock.calls[0][0]).toBe('planner-upsert-blocks');expect(invoke.mock.calls[0][1].blocks[0].expected_updated_at).toBe(version);
});
it('refuses media, non-draft and linked content blocks',async()=>{
 for(const row of [{...block,content_id:id},{...block,status:'scheduled'},{...block,meta:{image_url:'hidden'}}]){
  expect(canWriteTextBlock(row)).toBe(false);const invoke=vi.fn();
  await expect(createAwsPlannerMutator(sessionStorage).run(actor,workspace,{operation:'handoff',row,timezone:'UTC'},invoke)).rejects.toThrow();expect(invoke).not.toHaveBeenCalled();
 }
});
it('replays an already successful handoff using the same request ID after reload',async()=>{
 const receipt={request_id:requestId,workspace_id:workspace,timezone:'UTC',results:[{block_id:blockId,event_id:id,status:'briefing',source_block_version:version}],draft_only:true,publication_enabled:false,source_blocks_unchanged:true,availability_reserved:false};
 const invoke=vi.fn().mockResolvedValue({data:receipt,error:null});const change:PlannerMutation={operation:'handoff',row:block,timezone:'UTC'};
 await createAwsPlannerMutator(sessionStorage,()=>requestId).run(actor,workspace,change,invoke);
 await createAwsPlannerMutator(sessionStorage,()=>{throw Error('new request');}).run(actor,workspace,change,invoke);
 expect(invoke).toHaveBeenCalledTimes(2);expect(invoke.mock.calls[1][1].request_id).toBe(requestId);expect(invoke.mock.calls[1][1].blocks[0].expected_updated_at).toBe(version);
});
it('retains the handoff ID if a receipt claims publication or the wrong source version',async()=>{
 const invoke=vi.fn().mockResolvedValue({data:{request_id:requestId,workspace_id:workspace,publication_enabled:true},error:null});
 await expect(createAwsPlannerMutator(sessionStorage,()=>requestId).run(actor,workspace,{operation:'handoff',row:block,timezone:'UTC'},invoke)).rejects.toMatchObject({code:'RETRY_REQUIRED'});expect(sessionStorage.length).toBe(1);
});
it('fails closed before dispatch when request storage is unavailable',async()=>{
 const invoke=vi.fn();const storage={getItem:()=>null,setItem:()=>{throw Error('blocked');},removeItem:vi.fn()};
 await expect(createAwsPlannerMutator(storage).run(actor,workspace,create,invoke)).rejects.toMatchObject({code:'REQUEST_STORAGE_REQUIRED'});expect(invoke).not.toHaveBeenCalled();
});
it('allows only the three exact planner POST URLs and strips override headers',async()=>{
 const fetcher=vi.fn().mockResolvedValue(new Response('{}')),fetch=createAwsValidationFetch(fetcher,'https://api-prod.useadtool.ai');
 for(const slug of ['planner-upsert-weekplan','planner-upsert-blocks','planner-to-calendar'])await fetch('https://api-prod.useadtool.ai/functions/v1/'+slug,{method:'POST',headers:{Cookie:'x',Prefer:'x','X-HTTP-Method-Override':'DELETE'}});
 expect(fetcher).toHaveBeenCalledTimes(3);const headers=fetcher.mock.calls[0][1].headers;expect(headers.has('Cookie')).toBe(false);expect(headers.has('Prefer')).toBe(false);
 for(const [path,method]of [['/functions/v1/planner-to-calendar?x=1','POST'],['/functions/v1/planner-to-calendar/','POST'],['/functions/v1/planner-upsert-blocks','DELETE'],['/rest/v1/weekplans','POST'],['/rest/v1/rpc/upsert_weekplan_guarded','POST']])await expect(fetch('https://api-prod.useadtool.ai'+path,{method})).rejects.toThrow('scope');
 expect(fetcher).toHaveBeenCalledTimes(3);
});

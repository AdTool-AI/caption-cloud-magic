import { expect,it,vi,beforeEach } from 'vitest';
import { webcrypto } from 'node:crypto';
import { createAwsDraftMutator } from '../awsDraftMutations';
import { createAwsValidationFetch } from '../awsValidationFetch';
const actor='00000000-0000-4000-8000-000000000001',workspace='00000000-0000-4000-8000-000000000002',id='00000000-0000-4000-8000-000000000003';
const fields={title:'Draft',brief:null,caption:'Text',timezone:'UTC',channels:['instagram']};
beforeEach(()=>{Object.defineProperty(globalThis,'crypto',{value:webcrypto,configurable:true});sessionStorage.clear();});
it('preserves the request ID across an uncertain response and a new client instance',async()=>{
 const first=vi.fn().mockRejectedValue(new Error('network'));
 await expect(createAwsDraftMutator(sessionStorage,()=>id).run(actor,workspace,'create',fields,null,first)).rejects.toMatchObject({code:'RETRY_REQUIRED'});
 const invoke=vi.fn(async(_slug:string,body:Record<string,unknown>)=>({data:{request_id:body.request_id,workspace_id:workspace,draft_only:true,publication_enabled:false,availability_reserved:false,event:{id,workspace_id:workspace,...fields,status:'briefing',version:1,updated_at:'2026-10-31T10:00:00.000001Z',start_at:null,end_at:null}},error:null}));
 await createAwsDraftMutator(sessionStorage,()=>{throw Error('new request generated');}).run(actor,workspace,'create',fields,null,invoke);
 expect(invoke.mock.calls[0][1].request_id).toBe(id);expect(sessionStorage.length).toBe(0);
});
it('rejects a receipt from another workspace and retains the uncertain request',async()=>{
 await expect(createAwsDraftMutator(sessionStorage,()=>id).run(actor,workspace,'create',fields,null,async()=>({data:{request_id:id,workspace_id:actor,draft_only:true,publication_enabled:false},error:null}))).rejects.toMatchObject({code:'RETRY_REQUIRED'});
 expect(sessionStorage.length).toBe(1);
});
it('refuses delete for a row from another workspace before invoking',async()=>{
 const invoke=vi.fn();await expect(createAwsDraftMutator(sessionStorage,()=>id).run(actor,workspace,'delete',null,{id,workspace_id:actor,status:'briefing'} as never,invoke)).rejects.toThrow();expect(invoke).not.toHaveBeenCalled();
});
it('allows only exact POST mutation URLs through the browser guard',async()=>{
 const fetcher=vi.fn().mockResolvedValue(new Response('{}'));const call=createAwsValidationFetch(fetcher,'https://api-prod.useadtool.ai');
 for(const slug of ['calendar-create-draft','calendar-edit-draft','calendar-delete-draft'])await call('https://api-prod.useadtool.ai/functions/v1/'+slug,{method:'POST',body:'{}'});
 expect(fetcher).toHaveBeenCalledTimes(3);
 for(const [path,method] of [['/functions/v1/calendar-create-draft?x=1','POST'],['/functions/v1/calendar-edit-draft','GET'],['/rest/v1/rpc/create_calendar_draft_atomic','POST']])await expect(call('https://api-prod.useadtool.ai'+path,{method})).rejects.toThrow('scope');
 expect(fetcher).toHaveBeenCalledTimes(3);
});

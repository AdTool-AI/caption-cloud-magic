import { describe,it,expect,vi } from 'vitest';
import { createPlannerHandoffWriter,handoffInstant,handoffPayload,PlannerHandoffError,type PlannerHandoffSource } from '../plannerHandoff';
const A='fa000000-0000-4000-8000-000000000001',W='fb000000-0000-4000-8000-000000000001';
const B='fc000000-0000-4000-8000-000000000001',E='fd000000-0000-4000-8000-000000000001';
const R='fe000000-0000-4000-8000-000000000001',V='2027-01-04T10:00:00.123456Z';
const source=(extra:Partial<PlannerHandoffSource>={}):PlannerHandoffSource=>({id:B,workspace_id:W,updated_at:V,status:'draft',content_id:null,...extra});
function receipt(body:Record<string,any>){return {request_id:body.request_id,workspace_id:body.workspace_id,timezone:body.timezone,
 results:body.blocks.map((block:any)=>({block_id:block.id,event_id:E,status:'briefing',source_block_version:block.expected_updated_at})),
 draft_only:true,publication_enabled:false,source_blocks_unchanged:true,availability_reserved:false};}
const success=()=>vi.fn(async(body:Record<string,unknown>)=>({data:receipt(body),error:null}));

describe('planner handoff caller',()=>{
 it('sends exact versions and no legacy publishing or content payload',async()=>{
  const invoke=success();await createPlannerHandoffWriter(()=>R).transfer(A,W,'UTC',[source()],invoke);
  expect(invoke.mock.calls[0][0]).toEqual({request_id:R,workspace_id:W,timezone:'UTC',blocks:[{id:B,expected_updated_at:V,expected_content_updated_at:null}]});
 });
 it('requires the displayed content version and matching joined content ID',()=>{
  const row=source({content_id:E,content_items:{id:E,updated_at:V}});
  expect(handoffPayload(W,'UTC',[row]).blocks[0].expected_content_updated_at).toBe(V);
  for(const content_items of [null,{id:B,updated_at:V},{id:E,updated_at:null}])expect(()=>handoffPayload(W,'UTC',[{...row,content_items}])).toThrow('HANDOFF_VERSION_REQUIRED');
 });
 it.each(['queued','scheduled','approved','posted'])('refuses %s blocks instead of filtering a partial batch',status=>{
  expect(()=>handoffPayload(W,'UTC',[source(),source({id:E,status})])).toThrow('HANDOFF_DRAFT_REQUIRED');
 });
 it('rejects missing versions, duplicates, foreign workspace and empty/oversized batches',()=>{
  expect(()=>handoffPayload(W,'UTC',[source({updated_at:null})])).toThrow('HANDOFF_VERSION_REQUIRED');
  expect(()=>handoffPayload(W,'UTC',[source(),source({id:B.toUpperCase()})])).toThrow('HANDOFF_DUPLICATE_BLOCK');
  expect(()=>handoffPayload(W,'UTC',[source({workspace_id:E})])).toThrow('HANDOFF_SCOPE_CHANGED');
  for(const rows of [[],Array.from({length:51},()=>source())])expect(()=>handoffPayload(W,'UTC',rows)).toThrow('HANDOFF_BATCH_LIMIT');
 });
 it.each(['media_urls','media_id','assets','assets_json','image_url','video_url','thumb_url','media'])('rejects %s metadata without silently removing it',key=>{
  expect(()=>handoffPayload(W,'UTC',[source({meta:{[key]:[]}})])).toThrow('MEDIA_REVIEW_REQUIRED');
 });
 it('rejects linked media and thumbnails',()=>{
  for(const extra of [{media_id:B},{thumb_url:'https://example.invalid/test.png'}])expect(()=>handoffPayload(W,'UTC',[source({content_id:E,content_items:{id:E,updated_at:V,...extra}})])).toThrow('MEDIA_REVIEW_REQUIRED');
 });
 it('uses an explicit valid timezone without rewriting absolute versions',()=>{
  expect(handoffPayload(W,'Europe/Berlin',[source()]).blocks[0].expected_updated_at).toBe(V);
  expect(()=>handoffPayload(W,'Not/AZone',[source()])).toThrow('HANDOFF_TIMEZONE_REQUIRED');
 });
 it('shares one pending request and preserves ID for an uncertain outcome retry',async()=>{
  const writer=createPlannerHandoffWriter(()=>R);let release!:(x:any)=>void;
  const invoke=vi.fn(()=>new Promise<any>(resolve=>{release=resolve;}));
  const p=writer.transfer(A,W,'UTC',[source()],invoke),q=writer.transfer(A,W,'UTC',[source()],invoke);
  expect(p).toBe(q);await Promise.resolve();expect(invoke).toHaveBeenCalledTimes(1);
  release({data:null,error:new Error('private sentinel')});await expect(p).rejects.toThrow('HANDOFF_RETRY_REQUIRED');
  const retry=success();await writer.transfer(A,W,'UTC',[source()],retry);expect(retry.mock.calls[0][0].request_id).toBe(R);
 });
 it('revalidates successful replays against the backend instead of returning cached data',async()=>{
  const writer=createPlannerHandoffWriter(()=>R);const invoke=success();
  await writer.transfer(A,W,'UTC',[source()],invoke);await writer.transfer(A,W,'UTC',[source()],invoke);
  expect(invoke).toHaveBeenCalledTimes(2);expect(invoke.mock.calls[1][0].request_id).toBe(R);
 });
 it('canonicalizes selection order without changing timestamps',async()=>{
  let next=0;const writer=createPlannerHandoffWriter(()=>{next++;return R;});
  const invoke=vi.fn(async(body:Record<string,any>)=>({data:{...receipt(body),results:body.blocks.map((b:any,i:number)=>({...receipt(body).results[i],event_id:i?A:E}))},error:null}));
  await writer.transfer(A,W,'UTC',[source({id:E}),source()],invoke);
  await writer.transfer(A,W,'UTC',[source(),source({id:E})],invoke);
  expect(next).toBe(1);expect(invoke.mock.calls[0][0].blocks[0].id).toBe(B);
 });
 it('clears pending scope without accepting an old account/workspace result',async()=>{
  const writer=createPlannerHandoffWriter(()=>R);let release!:(x:any)=>void;
  const invoke=vi.fn((body:Record<string,unknown>)=>new Promise<any>(resolve=>{release=x=>resolve(x??{data:receipt(body),error:null});}));
  const pending=writer.transfer(A,W,'UTC',[source()],invoke);await Promise.resolve();writer.clear();release(null);
  await expect(pending).rejects.toThrow('HANDOFF_SCOPE_CHANGED');
 });
 it.each(['HANDOFF_FORBIDDEN','HANDOFF_CONFLICT','MEDIA_REVIEW_REQUIRED','REQUEST_ID_REUSED'])('preserves bounded %s response errors',async code=>{
  const invoke=vi.fn(async()=>({data:null,error:{context:new Response(JSON.stringify({error:code}),{status:409})}}));
  await expect(createPlannerHandoffWriter(()=>R).transfer(A,W,'UTC',[source()],invoke)).rejects.toThrow(code);
 });
 it('never exposes an unknown backend error body',async()=>{
  const invoke=vi.fn(async()=>({data:null,error:{context:new Response(JSON.stringify({error:'PRIVATE_SENTINEL'}),{status:500})}}));
  await expect(createPlannerHandoffWriter(()=>R).transfer(A,W,'UTC',[source()],invoke)).rejects.toThrow('HANDOFF_RETRY_REQUIRED');
 });
 it('rejects a one-microsecond mismatch and verifies draft receipt flags',async()=>{
  for(const changes of [{publication_enabled:true},{draft_only:false},{availability_reserved:true},{source_blocks_unchanged:false},
    {results:[{block_id:B,event_id:E,status:'briefing',source_block_version:'2027-01-04T10:00:00.123457Z'}]}]){
   const invoke=vi.fn(async(body:Record<string,unknown>)=>({data:{...receipt(body),...changes},error:null}));
   await expect(createPlannerHandoffWriter(()=>R).transfer(A,W,'UTC',[source()],invoke)).rejects.toThrow('HANDOFF_RETRY_REQUIRED');
  }
 });
 it('projects only public receipt fields',async()=>{
  const invoke=vi.fn(async(body:Record<string,unknown>)=>({data:{...receipt(body),private_hash:'secret'},error:null}));
  const result=await createPlannerHandoffWriter(()=>R).transfer(A,W,'UTC',[source()],invoke);
  expect(result).not.toHaveProperty('private_hash');expect(result.results[0]).not.toHaveProperty('content_sha256');
 });
 it('rejects invalid calendar dates and does not accept imprecise/relative versions',()=>{
  for(const value of ['now','infinity','2027-02-30T10:00:00Z','2027-01-04T24:00:00Z','2027-01-04T10:00:00.1234567Z'])expect(handoffInstant(value)).toBe(false);
  expect(handoffInstant(V)).toBe(true);
 });
});

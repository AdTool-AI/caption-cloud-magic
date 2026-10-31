import { describe, it, expect, vi } from 'vitest';
import { calendarDraftMove, createCalendarDraftWriter, draftPatch, type CalendarDraftSource } from '../calendarDraftEdit';
const actor='10000000-0000-4000-8000-000000000001', workspace='20000000-0000-4000-8000-000000000001';
const request='30000000-0000-4000-8000-000000000001';
const row: CalendarDraftSource={id:'40000000-0000-4000-8000-000000000001',workspace_id:workspace,status:'briefing',version:7,
 updated_at:'2026-10-31T10:00:00.123456Z',title:'Draft',brief:null,caption:'',start_at:'2027-01-01T10:00:00.123456Z',end_at:'2027-01-01T11:00:00.123789Z',timezone:'UTC'};
function answer(body: Record<string, unknown>, overrides={}) { return { data:{request_id:body.request_id,workspace_id:workspace,draft_only:true,publication_enabled:false,availability_reserved:false,
 event:{...row,...body.patch as object,version:8,updated_at:'2026-10-31T10:00:00.123457Z'},...overrides},error:null}; }
describe('calendar draft caller',()=>{
 it('retains duration and microseconds when moving a draft',()=>{expect(calendarDraftMove(row,new Date('2027-02-01T15:00:00.123Z'))).toEqual({start_at:'2027-02-01T15:00:00.123456Z',end_at:'2027-02-01T16:00:00.123789Z'});});
 it('requires a loaded date pair for drag',()=>{expect(()=>calendarDraftMove({...row,end_at:null},new Date())).toThrow('DRAFT_RANGE_REQUIRED');});
 it.each([ {status:'scheduled'}, {start_at:'2027-01-01T10:00:00Z'}, {start_at:null,end_at:'2027-01-01T11:00:00Z'}, {title:''}, {timezone:'Not/AZone'}, {caption:undefined}, {start_at:'2027-02-30T10:00:00Z',end_at:'2027-03-01T11:00:00Z'} ])('rejects unsupported or invalid patch %j',patch=>{expect(()=>draftPatch(patch as any)).toThrow('INVALID_DRAFT_EDIT');});
 it('preserves nulls, empty text and unicode codepoints',()=>{expect(draftPatch({brief:null,caption:'',title:'😀'.repeat(500)})).toEqual({brief:null,caption:'',title:'😀'.repeat(500)});});
 it('coalesces double clicks and snapshots the version/body before dispatch',async()=>{
  const writer=createCalendarDraftWriter(()=>request),patch={title:'Saved'},source={...row};const invoke=vi.fn(async body=>answer(body));
  const one=writer.edit(actor,workspace,source,patch,invoke),two=writer.edit(actor,workspace,source,patch,invoke);
  patch.title='Changed';source.version=99;expect(one).toBe(two);await one;expect(invoke).toHaveBeenCalledOnce();
  expect(invoke.mock.calls[0][0]).toMatchObject({expected_version:7,expected_updated_at:row.updated_at,patch:{title:'Saved'}});
 });
 it('reuses request identity after an unknown outcome',async()=>{
  let count=0;const writer=createCalendarDraftWriter(()=>request),bodies:Record<string,unknown>[]=[];
  const invoke=async(body:Record<string,unknown>)=>{bodies.push(body);if(!count++)throw new Error('private detail');return answer(body);};
  await expect(writer.edit(actor,workspace,row,{title:'Saved'},invoke)).rejects.toThrow('DRAFT_EDIT_RETRY_REQUIRED');
  await writer.edit(actor,workspace,row,{title:'Saved'},invoke);expect(bodies[0]).toEqual(bodies[1]);
 });
 it('validates and projects receipt fields',async()=>{
  const writer=createCalendarDraftWriter(()=>request);const receipt=await writer.edit(actor,workspace,row,{title:'Saved'},async body=>{
   const result=answer(body);(result.data.event as any).private_ledger='secret';return result;
  });expect(receipt.event.title).toBe('Saved');expect(receipt.event).not.toHaveProperty('private_ledger');
 });
 it.each([{publication_enabled:true},{workspace_id:actor},{event:{...row,version:8,title:'Wrong',updated_at:'2026-10-31T10:00:00.123457Z'}},{event:{...row,title:'Saved',version:8}}])('rejects mismatched or stale receipt %j',async overrides=>{
  await expect(createCalendarDraftWriter(()=>request).edit(actor,workspace,row,{title:'Saved'},async body=>answer(body,overrides))).rejects.toThrow('DRAFT_EDIT_RETRY_REQUIRED');
 });
 it('invalidates a late receipt when the scope is cleared',async()=>{
  let release!:(value:any)=>void;const writer=createCalendarDraftWriter(()=>request);
  const pending=writer.edit(actor,workspace,row,{title:'Saved'},body=>new Promise(resolve=>{release=value=>resolve(answer(body,value));}));
  await Promise.resolve();writer.clear();release({});await expect(pending).rejects.toThrow('DRAFT_SCOPE_CHANGED');
 });
 it('does not dispatch an old queued call after clear',async()=>{
  const writer=createCalendarDraftWriter(()=>request),invoke=vi.fn();const pending=writer.edit(actor,workspace,row,{title:'Saved'},invoke);writer.clear();
  await expect(pending).rejects.toThrow('DRAFT_SCOPE_CHANGED');expect(invoke).not.toHaveBeenCalled();
 });
 it('rejects cross-workspace or non-draft source',()=>{
  const writer=createCalendarDraftWriter(()=>request),invoke=vi.fn();
  expect(()=>writer.edit(actor,actor,row,{title:'Saved'},invoke)).toThrow('DRAFT_SCOPE_CHANGED');
  expect(()=>writer.edit(actor,workspace,{...row,status:'scheduled'},{title:'Saved'},invoke)).toThrow('DRAFT_REQUIRED');expect(invoke).not.toHaveBeenCalled();
 });
 it('returns only a bounded backend error',async()=>{
  const writer=createCalendarDraftWriter(()=>request);
  await expect(writer.edit(actor,workspace,row,{title:'Saved'},async()=>({data:null,error:{context:Response.json({error:'raw SQL password'},{status:503})}}))).rejects.toThrow('DRAFT_EDIT_RETRY_REQUIRED');
 });
});

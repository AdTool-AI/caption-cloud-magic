import { describe, expect, it, vi } from 'vitest';
import { approvalEvent, createCalendarApprovalWriter } from '@/lib/calendarApprovalWrite';
const actor='11111111-1111-4111-8111-111111111111';
const workspace='22222222-2222-4222-8222-222222222222';
const eventId='33333333-3333-4333-8333-333333333333';
const reviewer='44444444-4444-4444-8444-444444444444';
const approvalId='55555555-5555-4555-8555-555555555555';
const requestId='66666666-6666-4666-8666-666666666666';
const batch='77777777-7777-4777-8777-777777777777';
const snapshot={ id:eventId,workspace_id:workspace,updated_at:'2026-10-29T10:00:00.123456+00:00',version:7 };
const expires='2026-11-01T10:00:00.123Z';
const context={ approval_id:approvalId,event_id:eventId,workspace_id:workspace,approver_id:reviewer };
function receipt(ids=[reviewer]) { return { batch_id:batch,event_id:eventId,approvals:ids.map((id,i)=>({ approval_id:i ? batch : approvalId,approver_id:id })),expires_at:expires,publication_enabled:false }; }
function decision(value='approved') { return {approval_id:approvalId,event_id:eventId,decision:value,all_approved:true,publication_enabled:false}; }

describe('Signed-in approval caller contracts',()=>{
 it('preserves exact event microseconds and sends only the accepted request fields',async()=>{
  const invoke=vi.fn(async(_slug: unknown, _body: Record<string, unknown>)=>({data:receipt()}));
  await createCalendarApprovalWriter(()=>requestId).request(actor,{...snapshot,status:'scheduled'} as typeof snapshot,[reviewer],expires,invoke);
  expect(invoke).toHaveBeenCalledWith('calendar-request-approval',{request_id:requestId,workspace_id:workspace,event_id:eventId,expected_updated_at:snapshot.updated_at,expected_version:7,approver_ids:[reviewer],expires_at:expires});
  expect(invoke.mock.calls[0][1]).not.toHaveProperty('status');
 });
 it.each([0,1.5,2147483648])('refuses invalid event version %s before a request',version=>{
  expect(()=>approvalEvent({...snapshot,version})).toThrow('APPROVAL_VERSION_REQUIRED');
 });
 it.each(['2026-02-30T12:00:00Z','2026-10-29T25:00:00Z','2026-10-29','bad'])('refuses invalid event timestamp %s',updated_at=>{
  expect(()=>approvalEvent({...snapshot,updated_at})).toThrow('APPROVAL_VERSION_REQUIRED');
 });
 it('allows only one through ten distinct member IDs',()=>{
  const writer=createCalendarApprovalWriter(()=>requestId),invoke=vi.fn();
  for(const ids of [[],[reviewer,reviewer.toUpperCase()],['someone@example.com'],Array(11).fill(reviewer)]) expect(()=>writer.request(actor,snapshot,ids,expires,invoke)).toThrow();
  expect(invoke).not.toHaveBeenCalled();
 });
 it('coalesces a double click into one pending invocation',async()=>{
  let finish!:(value:{data:ReturnType<typeof receipt>})=>void;
  const invoke=vi.fn(()=>new Promise<{data:ReturnType<typeof receipt>}>(resolve=>{finish=resolve;}));
  const writer=createCalendarApprovalWriter(()=>requestId);
  const first=writer.request(actor,snapshot,[reviewer],expires,invoke);
  const second=writer.request(actor,snapshot,[reviewer],expires,invoke);
  expect(first).toBe(second);
  await Promise.resolve();finish({data:receipt()});await first;
  expect(invoke).toHaveBeenCalledTimes(1);
 });
 it('retains the request ID after an unknown network outcome',async()=>{
  const ids=vi.fn(()=>requestId),writer=createCalendarApprovalWriter(ids);
  const invoke=vi.fn().mockRejectedValueOnce(new Error('private network details')).mockResolvedValueOnce({data:receipt()});
  await expect(writer.request(actor,snapshot,[reviewer],expires,invoke)).rejects.toThrow('APPROVAL_RETRY_REQUIRED');
  await writer.request(actor,snapshot,[reviewer],expires,invoke);
  expect(ids).toHaveBeenCalledTimes(1);
  expect(invoke.mock.calls[0][1]).toEqual(invoke.mock.calls[1][1]);
 });
 it('rechecks successful replays with the backend rather than caching permission',async()=>{
  const writer=createCalendarApprovalWriter(()=>requestId);
  const invoke=vi.fn().mockResolvedValueOnce({data:receipt()}).mockResolvedValueOnce({error:{context:new Response(JSON.stringify({error:'APPROVAL_FORBIDDEN'}),{status:403})}});
  await writer.request(actor,snapshot,[reviewer],expires,invoke);
  await expect(writer.request(actor,snapshot,[reviewer],expires,invoke)).rejects.toThrow('APPROVAL_FORBIDDEN');
  expect(invoke).toHaveBeenCalledTimes(2);
  expect(invoke.mock.calls[0][1].request_id).toBe(invoke.mock.calls[1][1].request_id);
 });
 it('canonicalizes reviewer order without changing request identity',async()=>{
  const ids=vi.fn(()=>requestId),writer=createCalendarApprovalWriter(ids);
  const invoke=vi.fn(async(_slug: unknown, _body: Record<string, unknown>)=>({data:receipt([reviewer,actor])}));
  await writer.request(actor,snapshot,[reviewer,actor],expires,invoke);
  await writer.request(actor,snapshot,[actor,reviewer],expires,invoke);
  expect(ids).toHaveBeenCalledTimes(1);expect(invoke.mock.calls[0]).toEqual(invoke.mock.calls[1]);
 });
 it('rejects duplicate returned approval IDs and foreign reviewers',async()=>{
  for(const approvals of [[{approval_id:approvalId,approver_id:actor}],[{approval_id:approvalId,approver_id:reviewer},{approval_id:approvalId,approver_id:actor}]]){
   const invoke=vi.fn(async(_slug: unknown, _body: Record<string, unknown>)=>({data:{...receipt(),approvals}}));
   await expect(createCalendarApprovalWriter(()=>requestId).request(actor,snapshot,approvals.length===2?[reviewer,actor]:[reviewer],expires,invoke)).rejects.toThrow('APPROVAL_RETRY_REQUIRED');
  }
 });
 it.each([{publication_enabled:true},{event_id:actor},{event_id:12},{expires_at:'2026-11-02T10:00:00Z'},{approvals:[]}])('refuses an unbound request receipt %o',async wrong=>{
  await expect(createCalendarApprovalWriter(()=>requestId).request(actor,snapshot,[reviewer],expires,async()=>({data:{...receipt(),...wrong}}))).rejects.toThrow('APPROVAL_RETRY_REQUIRED');
 });
 it('projects the request receipt without private response fields',async()=>{
  const result=await createCalendarApprovalWriter(()=>requestId).request(actor,snapshot,[reviewer],expires,async()=>({data:{...receipt(),review_token:'private',event_snapshot:{secret:true},approvals:[{approval_id:approvalId,approver_id:reviewer,private:true}]}}));
  expect(result).toEqual(receipt());
 });
 it.each(['approved','rejected'] as const)('sends %s only to its fixed decision route',async status=>{
  const invoke=vi.fn(async(_slug: unknown, _body: Record<string, unknown>)=>({data:decision(status)}));
  await createCalendarApprovalWriter(()=>requestId).decide(reviewer,context,status,'Feedback',invoke);
  expect(invoke).toHaveBeenCalledWith(status==='approved'?'calendar-approve-stage':'calendar-reject-approval',{request_id:requestId,workspace_id:workspace,approval_id:approvalId,comment:'Feedback'});
  expect(invoke.mock.calls[0][1]).not.toHaveProperty('approved_changes');
 });
 it('rejects a different designated user before any invocation',()=>{
  const invoke=vi.fn();expect(()=>createCalendarApprovalWriter(()=>requestId).decide(actor,context,'approved',undefined,invoke)).toThrow('APPROVAL_FORBIDDEN');expect(invoke).not.toHaveBeenCalled();
 });
 it('refuses long comments and caller-injected decision values',()=>{
  const writer=createCalendarApprovalWriter(()=>requestId),invoke=vi.fn();
  expect(()=>writer.decide(reviewer,context,'approved','x'.repeat(4001),invoke)).toThrow('INVALID_APPROVAL_REQUEST');
  expect(()=>writer.decide(reviewer,context,'scheduled' as 'approved',undefined,invoke)).toThrow('INVALID_APPROVAL_REQUEST');
  expect(invoke).not.toHaveBeenCalled();
 });
 it.each([{decision:'rejected'},{approval_id:actor},{event_id:actor},{publication_enabled:true},{all_approved:'yes'}])('refuses a misleading decision receipt %o',async wrong=>{
  await expect(createCalendarApprovalWriter(()=>requestId).decide(reviewer,context,'approved',undefined,async()=>({data:{...decision(),...wrong}}))).rejects.toThrow('APPROVAL_RETRY_REQUIRED');
 });
 it('rejects a response from a cleared actor scope',async()=>{
  let finish!:(value:{data:ReturnType<typeof receipt>})=>void;
  const writer=createCalendarApprovalWriter(()=>requestId);
  const promise=writer.request(actor,snapshot,[reviewer],expires,()=>new Promise(resolve=>{finish=resolve;}));
  await Promise.resolve();writer.clear();finish({data:receipt()});
  await expect(promise).rejects.toThrow('APPROVAL_SCOPE_CHANGED');
 });
});

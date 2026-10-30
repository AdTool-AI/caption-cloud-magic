import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks=vi.hoisted(()=>({ auth:{user:{id:'44444444-4444-4444-8444-444444444444'} as {id:string}|null,session:{user:{id:'44444444-4444-4444-8444-444444444444'},access_token:'fixture-user-token'},loading:false},approval:{} as Record<string,unknown>,event:{} as Record<string,unknown>,queries:[] as {table:string;fields?:string;filters:[string,unknown][]}[],from:vi.fn(),invoke:vi.fn(),write:vi.fn(),approve:vi.fn(),reject:vi.fn(),toast:vi.fn() }));
vi.mock('@/hooks/useAuth',()=>({useAuth:()=>mocks.auth}));
vi.mock('@/hooks/use-toast',()=>({useToast:()=>({toast:mocks.toast})}));
vi.mock('@/components/SEO',()=>({SEO:()=>null}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{from:(...args:unknown[])=>mocks.from(...args),functions:{invoke:(...args:unknown[])=>mocks.invoke(...args)}}}));
vi.mock('@/hooks/useCalendarApprovals',()=>({APPROVAL_READ_FIELDS:'id,event_id,approver_id,status,stage,comment,created_at,reviewed_at,token_expires_at',useCalendarApprovals:()=>({approveStage:mocks.approve,rejectApproval:mocks.reject,loading:false})}));
import ReviewLink from '@/pages/ReviewLink';
const reviewer='44444444-4444-4444-8444-444444444444',approval='55555555-5555-4555-8555-555555555555',event='33333333-3333-4333-8333-333333333333',workspace='22222222-2222-4222-8222-222222222222';
function page(path=`/review/request/${approval}`) {
 return render(<MemoryRouter initialEntries={[path]}><Routes><Route path="/review/request/:approvalId" element={<ReviewLink/>}/><Route path="/review/:token" element={<ReviewLink/>}/></Routes></MemoryRouter>);
}
beforeEach(()=>{
 vi.clearAllMocks();mocks.queries.length=0;mocks.auth.user={id:reviewer};mocks.auth.session={user:{id:reviewer},access_token:'fixture-user-token'};
 mocks.approval={id:approval,event_id:event,approver_id:reviewer,status:'pending',stage:'review',comment:null,token_expires_at:new Date(Date.now()+86400000).toISOString()};
 mocks.event={id:event,workspace_id:workspace,title:'Test event',brief:'Brief',caption:'Caption'};
 mocks.from.mockImplementation((table:string)=>{
  const seen={table,fields:undefined as string|undefined,filters:[] as [string,unknown][]};mocks.queries.push(seen);
  const query={select:vi.fn((fields:string)=>{seen.fields=fields;return query;}),eq:vi.fn((key:string,value:unknown)=>{seen.filters.push([key,value]);return query;}),single:vi.fn(async()=>({data:table==='calendar_approvals'?{...mocks.approval}:{...mocks.event},error:null})),update:mocks.write,insert:mocks.write,delete:mocks.write};return query;
 });
 mocks.approve.mockImplementation(async()=>{mocks.approval.status='approved';return {approval_id:approval,event_id:event,decision:'approved',all_approved:true,publication_enabled:false};});
 mocks.reject.mockResolvedValue(null);
});

describe('Signed-in review page',()=>{
 it('never reads legacy token URLs, including tokens shaped like UUIDs',()=>{
  page(`/review/${approval}`);expect(screen.getByText(/link format is no longer supported/i)).toBeInTheDocument();expect(mocks.from).not.toHaveBeenCalled();
 });
 it('requires sign-in before loading a new request ID',()=>{
  mocks.auth.user=null;page();expect(screen.getByRole('link',{name:'Sign in'})).toBeInTheDocument();expect(mocks.from).not.toHaveBeenCalled();
 });
 it('reads only the designated reviewer row and excludes review tokens',async()=>{
  page();await screen.findByText('Test event');
  expect(mocks.queries[0].filters).toEqual([['id',approval],['approver_id',reviewer]]);
  expect(mocks.queries[0].fields).not.toContain('review_token');
  expect(mocks.queries[0].fields).not.toContain('approved_changes');
  expect(mocks.queries[1].filters).toEqual([['id',event]]);
  expect(mocks.write).not.toHaveBeenCalled();
 });
 it('rejects another reviewer row even if a read returns it',async()=>{
  mocks.approval.approver_id=workspace;page();await screen.findByRole('alert');expect(mocks.queries).toHaveLength(1);expect(mocks.approve).not.toHaveBeenCalled();
 });
 it('submits through the decision hook and never updates event or approval rows',async()=>{
  page();await screen.findByText('Test event');fireEvent.change(screen.getByLabelText('Feedback (optional)'),{target:{value:'Reviewed'}});fireEvent.click(screen.getByRole('button',{name:'Record approval'}));
  await screen.findByText('Recorded review: Approved');
  expect(mocks.approve).toHaveBeenCalledWith(expect.objectContaining({approval_id:approval,event_id:event,workspace_id:workspace,approver_id:reviewer}),'Reviewed');
  expect(mocks.write).not.toHaveBeenCalled();expect(mocks.invoke).not.toHaveBeenCalled();
 });
 it('does not claim a decision succeeded when its outcome is unconfirmed',async()=>{
  mocks.reject.mockResolvedValue(null);page();await screen.findByText('Test event');fireEvent.click(screen.getByRole('button',{name:'Request changes'}));await waitFor(()=>expect(mocks.reject).toHaveBeenCalledTimes(1));
  expect(screen.queryByText(/Recorded review:/)).not.toBeInTheDocument();expect(mocks.write).not.toHaveBeenCalled();
 });
 it('disables expired requests and renders untrusted captions as text',async()=>{
  mocks.approval.token_expires_at='2020-01-01T00:00:00Z';mocks.event.caption='<img src=x onerror=alert(1)>';
  const view=page();await screen.findByText(/has expired or cannot be reviewed/i);expect(screen.queryByRole('button',{name:'Record approval'})).not.toBeInTheDocument();expect(view.container.querySelector('img')).toBeNull();
 });
});

describe('Approval hook caller session binding',()=>{
 it('pins invocation to the current caller JWT and preserves the exact version',async()=>{
  const actual=await vi.importActual<typeof import('@/hooks/useCalendarApprovals')>('@/hooks/useCalendarApprovals');
  const expiry='2026-11-01T10:00:00Z';mocks.invoke.mockResolvedValue({data:{batch_id:workspace,event_id:event,approvals:[{approval_id:approval,approver_id:reviewer}],expires_at:expiry,publication_enabled:false},error:null});
  const hook=renderHook(()=>actual.useCalendarApprovals());
  await act(async()=>{await hook.result.current.requestApproval({id:event,workspace_id:workspace,updated_at:'2026-10-29T10:00:00.123456Z',version:9},[{user_id:reviewer,email:'label-only'}],expiry);});
  expect(mocks.invoke).toHaveBeenCalledWith('calendar-request-approval',expect.objectContaining({headers:{Authorization:'Bearer fixture-user-token'},body:expect.objectContaining({workspace_id:workspace,expected_updated_at:'2026-10-29T10:00:00.123456Z',expected_version:9,approver_ids:[reviewer]})}));
  expect(mocks.invoke.mock.calls[0][1].body).not.toHaveProperty('approvers');
 });
 it('does not invoke under a session belonging to another user',async()=>{
  const actual=await vi.importActual<typeof import('@/hooks/useCalendarApprovals')>('@/hooks/useCalendarApprovals');
  mocks.auth.session={user:{id:workspace},access_token:'different-fixture-token'};
  const hook=renderHook(()=>actual.useCalendarApprovals());
  await act(async()=>{expect(await hook.result.current.approveStage({approval_id:approval,event_id:event,workspace_id:workspace,approver_id:reviewer})).toBeNull();});
  expect(mocks.invoke).not.toHaveBeenCalled();expect(mocks.write).not.toHaveBeenCalled();
 });
});

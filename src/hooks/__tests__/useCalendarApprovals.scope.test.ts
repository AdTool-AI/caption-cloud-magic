import {act,cleanup,renderHook} from '@testing-library/react';
import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({auth:null as any,invoke:vi.fn(),read:vi.fn(),toast:vi.fn()}));
vi.mock('@/hooks/useAuth',()=>({useAuth:()=>m.auth}));
vi.mock('@/hooks/use-toast',()=>({useToast:()=>({toast:m.toast})}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{functions:{invoke:m.invoke},from:()=>{const q:any={};q.select=q.eq=q.order=()=>q;q.then=(a:any,b:any)=>m.read().then(a,b);return q;}}}));
import {useCalendarApprovals} from '../useCalendarApprovals';
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222',E='33333333-3333-4333-8333-333333333333',R='44444444-4444-4444-8444-444444444444';
const context={approval_id:R,event_id:E,workspace_id:B,approver_id:A};
const receipt={approval_id:R,event_id:E,decision:'approved',all_approved:true,publication_enabled:false};
function login(id:string){m.auth={user:{id},session:{user:{id},access_token:'synthetic-token'}};}
function deferred(){let resolve!:(v:any)=>void;const promise=new Promise(r=>{resolve=r});return {promise,resolve};}
beforeEach(()=>{login(A);m.invoke.mockReset().mockResolvedValue({data:receipt,error:null});m.read.mockReset().mockResolvedValue({data:[{event_id:E}],error:null});m.toast.mockReset();});
afterEach(cleanup);
describe('Approval hook account ownership',()=>{
 it('sends the explicit caller JWT and receipt-only success',async()=>{
  const {result}=renderHook(()=>useCalendarApprovals());await act(async()=>{await result.current.approveStage(context);});
  expect(m.invoke.mock.calls[0][1].headers).toEqual({Authorization:'Bearer synthetic-token'});expect(m.toast.mock.calls[0][0].description).toContain('event status are unchanged');
 });
 it('does not surface late success after A to B to A',async()=>{
  const late=deferred();m.invoke.mockReturnValue(late.promise);const {result,rerender}=renderHook(()=>useCalendarApprovals());let pending:any;
  await act(async()=>{pending=result.current.approveStage(context)});login(B);rerender();login(A);rerender();
  await act(async()=>{late.resolve({data:receipt});expect(await pending).toBeNull();});expect(m.toast).not.toHaveBeenCalled();expect(result.current.loading).toBe(false);
 });
 it('does not show a late result after unmount',async()=>{
  const late=deferred();m.invoke.mockReturnValue(late.promise);const {result,unmount}=renderHook(()=>useCalendarApprovals());let pending:any;
  await act(async()=>{pending=result.current.approveStage(context)});unmount();await act(async()=>{late.resolve({data:receipt});expect(await pending).toBeNull();});expect(m.toast).not.toHaveBeenCalled();
 });
 it('does not let an old completion clear a new account pending indicator',async()=>{
  const old=deferred(),current=deferred();m.invoke.mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
  const {result,rerender}=renderHook(()=>useCalendarApprovals());let first:any,second:any;
  await act(async()=>{first=result.current.approveStage(context)});login(B);rerender();
  await act(async()=>{second=result.current.approveStage({...context,approver_id:B})});expect(result.current.loading).toBe(true);
  await act(async()=>{old.resolve({data:receipt});await first});expect(result.current.loading).toBe(true);
  await act(async()=>{current.resolve({data:receipt});await second});expect(result.current.loading).toBe(false);
 });
 it('rejects history that finishes after an account change',async()=>{
  const late=deferred();m.read.mockReturnValue(late.promise);const {result,rerender}=renderHook(()=>useCalendarApprovals());
  const outcome=result.current.getApprovals(E).catch(error=>error.code);login(B);rerender();late.resolve({data:[{event_id:E}]});expect(await outcome).toBe('APPROVAL_SCOPE_CHANGED');
 });
 it('rejects foreign-event history and malformed IDs',async()=>{
  m.read.mockResolvedValue({data:[{event_id:R}],error:null});const {result}=renderHook(()=>useCalendarApprovals());
  await expect(result.current.getApprovals(E)).rejects.toThrow('APPROVAL_RETRY_REQUIRED');await expect(result.current.getApprovals('bad')).rejects.toThrow('APPROVAL_RECORD_NOT_FOUND');
 });
});

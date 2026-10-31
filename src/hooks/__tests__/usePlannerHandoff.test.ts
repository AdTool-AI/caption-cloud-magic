import { act,renderHook } from '@testing-library/react';
import { beforeEach,describe,expect,it,vi } from 'vitest';
import { usePlannerHandoff } from '../usePlannerHandoff';
import type { PlannerHandoffSource } from '@/lib/plannerHandoff';
const mocks=vi.hoisted(()=>({auth:{current:null as any},invoke:vi.fn()}));
vi.mock('@/hooks/useAuth',()=>({useAuth:()=>mocks.auth.current}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{functions:{invoke:mocks.invoke}}}));
const A='fa000000-0000-4000-8000-000000000001',W='fb000000-0000-4000-8000-000000000001';
const B='fc000000-0000-4000-8000-000000000001',E='fd000000-0000-4000-8000-000000000001';
const source=(workspace_id=W):PlannerHandoffSource=>({id:B,workspace_id,updated_at:'2027-01-04T10:00:00.123456Z',status:'draft',content_id:null});
function reply(body:any){return {data:{request_id:body.request_id,workspace_id:body.workspace_id,timezone:body.timezone,
 results:body.blocks.map((b:any)=>({block_id:b.id,event_id:E,status:'briefing',source_block_version:b.expected_updated_at})),
 draft_only:true,publication_enabled:false,source_blocks_unchanged:true,availability_reserved:false},error:null};}
beforeEach(()=>{
 mocks.auth.current={user:{id:A},session:{user:{id:A},access_token:'synthetic-token'}};
 mocks.invoke.mockReset().mockImplementation(async(_slug,options)=>reply(options.body));
});
describe('usePlannerHandoff',()=>{
 it('uses the caller session explicitly and the loaded versions without rereading rows',async()=>{
  const {result}=renderHook(()=>usePlannerHandoff(W));
  await act(async()=>{expect((await result.current.transfer([source()]))?.results).toHaveLength(1);});
  const [slug,options]=mocks.invoke.mock.calls[0];expect(slug).toBe('planner-to-calendar');
  expect(options.headers).toEqual({Authorization:'Bearer synthetic-token'});
  expect(options.body.blocks).toEqual([{id:B,expected_updated_at:source().updated_at,expected_content_updated_at:null}]);
  expect(options.body.timezone).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
 });
 it('retains the request ID after an unknown response and retries only when called again',async()=>{
  const {result}=renderHook(()=>usePlannerHandoff(W));mocks.invoke.mockRejectedValueOnce(new Error('private'));
  await act(async()=>{await expect(result.current.transfer([source()])).rejects.toThrow('HANDOFF_RETRY_REQUIRED');});
  expect(mocks.invoke).toHaveBeenCalledTimes(1);const request=mocks.invoke.mock.calls[0][1].body.request_id;
  await act(async()=>{await result.current.transfer([source()]);});
  expect(mocks.invoke.mock.calls[1][1].body.request_id).toBe(request);
 });
 it('ignores a rapid second click while one transfer is pending',async()=>{
  let release!:(value:any)=>void;mocks.invoke.mockImplementation((_slug,options)=>new Promise(resolve=>{release=()=>resolve(reply(options.body));}));
  const {result}=renderHook(()=>usePlannerHandoff(W));let pending!:ReturnType<typeof result.current.transfer>;
  await act(async()=>{pending=result.current.transfer([source()]);await expect(result.current.transfer([source()])).resolves.toBeNull();});
  expect(mocks.invoke).toHaveBeenCalledTimes(1);
  await act(async()=>{release(null);await pending;});
 });
 it('does not surface a stale result after workspace change',async()=>{
  let release!:(value:any)=>void;mocks.invoke.mockImplementationOnce((_slug,options)=>new Promise(resolve=>{release=()=>resolve(reply(options.body));}));
  const {result,rerender}=renderHook(({workspace})=>usePlannerHandoff(workspace),{initialProps:{workspace:W}});
  let pending!:ReturnType<typeof result.current.transfer>;
  await act(async()=>{pending=result.current.transfer([source()]);});
  rerender({workspace:E});await act(async()=>{release(null);expect(await pending).toBeNull();});
  await act(async()=>{expect((await result.current.transfer([source(E)]))?.workspace_id).toBe(E);});
  expect(mocks.invoke.mock.calls[1][1].body.workspace_id).toBe(E);
 });
 it('rejects mismatched or missing sessions before invoking the handler',async()=>{
  for(const session of [null,{user:{id:E},access_token:'synthetic-token'}]){
   mocks.auth.current={user:{id:A},session};const {result,unmount}=renderHook(()=>usePlannerHandoff(W));
   await expect(result.current.transfer([source()])).rejects.toThrow('UNAUTHORIZED');unmount();
  }
  expect(mocks.invoke).not.toHaveBeenCalled();
 });
 it('does not surface a result after logout even if the user object has not cleared yet',async()=>{
  let release!:(value:any)=>void;mocks.invoke.mockImplementationOnce((_slug,options)=>new Promise(resolve=>{release=()=>resolve(reply(options.body));}));
  const {result,rerender}=renderHook(()=>usePlannerHandoff(W));let pending!:ReturnType<typeof result.current.transfer>;
  await act(async()=>{pending=result.current.transfer([source()]);});
  mocks.auth.current={user:{id:A},session:null};rerender();
  await act(async()=>{release(null);expect(await pending).toBeNull();});
 });
 it('does not surface a completion after unmount',async()=>{
  let release!:(value:any)=>void;mocks.invoke.mockImplementationOnce((_slug,options)=>new Promise(resolve=>{release=()=>resolve(reply(options.body));}));
  const {result,unmount}=renderHook(()=>usePlannerHandoff(W));let pending!:ReturnType<typeof result.current.transfer>;
  await act(async()=>{pending=result.current.transfer([source()]);});unmount();
  release(null);expect(await pending).toBeNull();
 });
});

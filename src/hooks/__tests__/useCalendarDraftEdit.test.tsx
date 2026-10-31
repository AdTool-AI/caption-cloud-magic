import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useCalendarDraftEdit } from '../useCalendarDraftEdit';
const state=vi.hoisted(()=>({auth:null as any,invoke:vi.fn()}));
vi.mock('@/hooks/useAuth',()=>({useAuth:()=>state.auth}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{functions:{invoke:state.invoke}}}));
const a='10000000-0000-4000-8000-000000000001',b='10000000-0000-4000-8000-000000000002',w='20000000-0000-4000-8000-000000000001';
const row={id:'40000000-0000-4000-8000-000000000001',workspace_id:w,status:'briefing',version:1,updated_at:'2026-10-31T10:00:00.123456Z',title:'Draft',brief:null,caption:'',start_at:null,end_at:null,timezone:'UTC'};
function auth(id:string){state.auth={user:{id},session:{user:{id},access_token:'synthetic-'+id}};}
function answer(options:any){const body=options.body;return {data:{request_id:body.request_id,workspace_id:w,draft_only:true,publication_enabled:false,availability_reserved:false,event:{...row,...body.patch,version:2,updated_at:'2026-10-31T10:00:00.123457Z'}},error:null};}
beforeEach(()=>{state.invoke.mockReset();auth(a);});
describe('scoped calendar draft hook',()=>{
 it('uses the current caller JWT and exact handler',async()=>{
  state.invoke.mockImplementation(async(_,options)=>answer(options));const {result}=renderHook(()=>useCalendarDraftEdit(w));
  await act(async()=>{await result.current.edit(row,{title:'Saved'});});
  expect(state.invoke.mock.calls[0][0]).toBe('calendar-edit-draft');expect(state.invoke.mock.calls[0][1].headers.Authorization).toBe('Bearer synthetic-'+a);
 });
 it('suppresses a late result across A to B to A',async()=>{
  let release!:(x:any)=>void;state.invoke.mockImplementation((_,options)=>new Promise(resolve=>{release=()=>resolve(answer(options));}));
  const {result,rerender}=renderHook(()=>useCalendarDraftEdit(w));let pending:any;
  act(()=>{pending=result.current.edit(row,{title:'Saved'});});await waitFor(()=>expect(state.invoke).toHaveBeenCalledOnce());
  auth(b);rerender();auth(a);rerender();await act(async()=>{release(null);expect(await pending).toBeNull();});expect(result.current.pending).toBe(false);
 });
 it('old callbacks cannot dispatch after a workspace change',async()=>{
  const {result,rerender}=renderHook(({workspace})=>useCalendarDraftEdit(workspace),{initialProps:{workspace:w}});const old=result.current.edit;
  rerender({workspace:a});await expect(old(row,{title:'Saved'})).resolves.toBeNull();expect(state.invoke).not.toHaveBeenCalled();
 });
 it('suppresses completion after unmount',async()=>{
  let release!:()=>void;state.invoke.mockImplementation((_,options)=>new Promise(resolve=>{release=()=>resolve(answer(options));}));
  const {result,unmount}=renderHook(()=>useCalendarDraftEdit(w));let pending:any;
  act(()=>{pending=result.current.edit(row,{title:'Saved'});});await waitFor(()=>expect(state.invoke).toHaveBeenCalledOnce());unmount();release();expect(await pending).toBeNull();
 });
 it('rejects a mismatched session before dispatch',async()=>{
  state.auth.session.user.id=b;const {result}=renderHook(()=>useCalendarDraftEdit(w));await expect(result.current.edit(row,{title:'Saved'})).rejects.toThrow('UNAUTHORIZED');expect(state.invoke).not.toHaveBeenCalled();
 });
 it('does not duplicate a pending write',async()=>{
  let release!:()=>void;state.invoke.mockImplementation((_,options)=>new Promise(resolve=>{release=()=>resolve(answer(options));}));
  const {result}=renderHook(()=>useCalendarDraftEdit(w));let pending:any;
  act(()=>{pending=result.current.edit(row,{title:'Saved'});});await waitFor(()=>expect(state.invoke).toHaveBeenCalledOnce());
  await expect(result.current.edit(row,{title:'Other'})).resolves.toBeNull();await act(async()=>{release();await pending;});expect(state.invoke).toHaveBeenCalledOnce();
 });
});

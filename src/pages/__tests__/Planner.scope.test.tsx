import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
const m=vi.hoisted(()=>({auth:null as any,modern:false,from:vi.fn(),invoke:vi.fn(),read:vi.fn()}));
vi.mock('@/hooks/useAuth',()=>({useAuth:()=>m.auth}));
vi.mock('@/hooks/useFeatureFlag',()=>({useFeatureFlag:()=>m.modern}));
vi.mock('@/hooks/usePlannerShortcuts',()=>({usePlannerShortcuts:()=>{}}));
vi.mock('@/hooks/useUserBehavior',()=>({useUserBehavior:()=>({trackProjectCreate:vi.fn()})}));
vi.mock('@/lib/i18nText',()=>({tx:(v:any)=>v.en}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{from:m.from,functions:{invoke:m.invoke}}}));
vi.mock('sonner',()=>({toast:{success:vi.fn(),error:vi.fn(),info:vi.fn(),loading:vi.fn(),dismiss:vi.fn()}}));
vi.mock('react-router-dom',()=>({useSearchParams:()=>[new URLSearchParams(),vi.fn()]}));
vi.mock('@dnd-kit/core',()=>({DndContext:({children}:any)=>children,DragOverlay:()=>null}));
vi.mock('@/components/Footer',()=>({Footer:()=>null}));
vi.mock('@/components/planner/PlannerV2',()=>({PlannerV2:()=> <div>modern-planner</div>}));
vi.mock('@/components/planner/WeekGrid',()=>({WeekGrid:({blocks}:any)=> <div>{blocks.map((b:any)=><span key={b.id}>{b.title}</span>)}</div>}));
vi.mock('@/components/planner/ContentLibrary',()=>({ContentLibrary:()=>null}));
vi.mock('@/components/planner/PlannerToolbar',()=>({PlannerToolbar:()=>null}));
vi.mock('@/components/planner/InspectorDrawer',()=>({InspectorDrawer:()=>null}));
vi.mock('@/components/planner/AIRecommendationsOverlay',()=>({AIRecommendationsOverlay:()=>null}));
vi.mock('@/components/planner/TimePickerDialog',()=>({TimePickerDialog:()=>null}));
vi.mock('@/components/planner/PlannerRecommendationsDialog',()=>({PlannerRecommendationsDialog:()=>null}));
import Planner from '../Planner';
const response=(data:any,error:any=null)=>({data,error});
function login(id:string){m.auth={user:{id},session:{user:{id},access_token:'test-only-token'}};}
function deferred(){let resolve!:(v:any)=>void;const promise=new Promise(r=>{resolve=r});return {promise,resolve};}
beforeEach(()=>{
 login('A');m.modern=false;m.invoke.mockReset();m.read.mockReset();m.from.mockReset();
 m.from.mockImplementation((table:string)=>{
  const filters:Record<string,any>={};const q:any={};
  for(const method of ['select','limit','order'])q[method]=()=>q;
  q.eq=(key:string,value:any)=>{filters[key]=value;return q};
  q.then=(resolve:any,reject:any)=>Promise.resolve(m.read(table,{...filters})).then(resolve,reject);
  return q;
 });
 m.read.mockImplementation((table:string,f:any)=>table==='workspace_members'?response([{workspace_id:'W'+f.user_id}]):table==='weekplans'?response([{id:'P'+f.workspace_id,workspace_id:f.workspace_id,start_date:'2026-10-01',weeks:2}]):response([]));
});
afterEach(cleanup);
describe('Planner read ownership and mounting',()=>{
 it('mounts the modern planner without running legacy effects',()=>{
  m.modern=true;render(<Planner/>);expect(screen.getByText('modern-planner')).toBeTruthy();
  expect(m.from).not.toHaveBeenCalled();expect(m.invoke).not.toHaveBeenCalled();
 });
 it.each([response(null,{message:'denied'}),response([])])('does not provision a workspace after an unavailable membership read %#',async result=>{
  m.read.mockResolvedValue(result);render(<Planner/>);
  await screen.findByText(/workspace could not be loaded/i);
  expect(m.from.mock.calls.map(c=>c[0])).toEqual(['workspace_members']);expect(m.invoke).not.toHaveBeenCalled();
 });
 it('does not create a plan when the plan read fails',async()=>{
  m.read.mockImplementation((table:string)=>table==='workspace_members'?response([{workspace_id:'WA'}]):table==='weekplans'?response(null,{message:'denied'}):response([]));
  render(<Planner/>);await screen.findByText(/plan could not be loaded or saved/i);expect(m.invoke).not.toHaveBeenCalled();
 });
 it('ignores a late membership response from the previous account',async()=>{
  const late=deferred(),base=m.read.getMockImplementation()!;
  m.read.mockImplementation((table:string,f:any)=>table==='workspace_members'&&f.user_id==='A'?late.promise:base(table,f));
  const view=render(<Planner/>);login('B');view.rerender(<Planner/>);
  await waitFor(()=>expect(m.read).toHaveBeenCalledWith('schedule_blocks',expect.objectContaining({weekplan_id:'PWB'})));
  await act(async()=>late.resolve(response([{workspace_id:'WA'}])));
  expect(m.read.mock.calls.some(([table,f])=>table==='weekplans'&&f.workspace_id==='WA')).toBe(false);
  expect(m.read.mock.calls.some(([table,f])=>table==='brand_kits'&&f.user_id==='A')).toBe(false);
 });
 it('keeps late block rows from a previous account off the screen',async()=>{
  const late=deferred(),base=m.read.getMockImplementation()!;
  m.read.mockImplementation((table:string,f:any)=>table==='schedule_blocks'?(f.weekplan_id==='PWA'?late.promise:response([{id:'b',title:'B private draft',workspace_id:'WB',weekplan_id:'PWB',start_at:'2026-10-01T10:00:00Z',status:'draft'}])):base(table,f));
  const view=render(<Planner/>);await waitFor(()=>expect(m.read).toHaveBeenCalledWith('schedule_blocks',{weekplan_id:'PWA'}));
  login('B');view.rerender(<Planner/>);await screen.findByText('B private draft');
  await act(async()=>late.resolve(response([{id:'a',title:'A private draft',workspace_id:'WA',weekplan_id:'PWA',start_at:'2026-10-01T10:00:00Z',status:'draft'}])));
  expect(screen.queryByText('A private draft')).toBeNull();expect(screen.getByText('B private draft')).toBeTruthy();
 });
});

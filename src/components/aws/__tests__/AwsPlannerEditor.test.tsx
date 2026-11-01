import { act,fireEvent,render,screen,waitFor } from '@testing-library/react';
import { beforeEach,expect,it,vi } from 'vitest';
import { AwsPlannerEditor,type PlannerAction } from '../AwsPlannerEditor';
const mocks=vi.hoisted(()=>({run:vi.fn(),getUser:vi.fn(),invoke:vi.fn()}));
vi.mock('@/lib/awsPlannerMutations',()=>({createAwsPlannerMutator:()=>({run:mocks.run})}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{auth:{getUser:mocks.getUser},functions:{invoke:mocks.invoke}}}));
const actor='00000000-0000-4000-8000-000000000001',workspace='00000000-0000-4000-8000-000000000002',id='00000000-0000-4000-8000-000000000003';
const session={user:{id:actor},access_token:'synthetic'} as never;
const plan={id,workspace_id:workspace,name:'Plan',start_date:'2027-01-04',weeks:1,timezone:'UTC',status:'draft',updated_at:'2026-10-31T00:00:00.123456Z',default_platforms:['instagram']};
const block={id:actor,workspace_id:workspace,weekplan_id:id,content_id:null,platform:'instagram',start_at:'2027-01-05T10:00:15.123456Z',end_at:'2027-01-05T11:00:15.123456Z',title_override:'Text block',caption_override:'Caption',meta:{},status:'draft',updated_at:'2026-10-31T00:00:00.654321Z'};
const props=(action:PlannerAction)=>({session,workspace,action,onClose:vi.fn(),onSaved:vi.fn()});
beforeEach(()=>{vi.clearAllMocks();mocks.getUser.mockResolvedValue({data:{user:{id:actor}},error:null});mocks.run.mockResolvedValue(plan);});
it('creates a UTC weekplan with only accepted fields and caller JWT',async()=>{
 const p=props({kind:'new-plan'});render(<AwsPlannerEditor {...p}/>);
 fireEvent.change(screen.getByLabelText('Plan name'),{target:{value:'My plan'}});fireEvent.change(screen.getByLabelText('Start date'),{target:{value:'2027-01-04'}});
 fireEvent.click(screen.getByRole('button',{name:'Save weekplan'}));await waitFor(()=>expect(p.onSaved).toHaveBeenCalled());
 expect(mocks.run.mock.calls[0].slice(0,3)).toEqual([actor,workspace,{operation:'plan',row:null,fields:{name:'My plan',start_date:'2027-01-04',weeks:1,timezone:'UTC',default_platforms:['instagram']}}]);
 mocks.invoke.mockResolvedValue({data:plan,error:null});await mocks.run.mock.calls[0][3]('planner-upsert-weekplan',{});expect(mocks.invoke).toHaveBeenCalledWith('planner-upsert-weekplan',{body:{},headers:{Authorization:'Bearer synthetic'}});
});
it('keeps unknown outcomes locked and retries the frozen payload',async()=>{
 mocks.run.mockRejectedValueOnce({code:'RETRY_REQUIRED'}).mockResolvedValueOnce(plan);
 const p=props({kind:'rename-plan',plan});render(<AwsPlannerEditor {...p}/>);
 fireEvent.change(screen.getByLabelText('Plan name'),{target:{value:'Changed'}});fireEvent.click(screen.getByRole('button',{name:'Save weekplan'}));await screen.findByRole('button',{name:'Retry same request'});
 expect(screen.getByLabelText('Plan name')).toBeDisabled();expect(p.onClose).not.toHaveBeenCalled();fireEvent.click(screen.getByRole('button',{name:'Retry same request'}));await waitFor(()=>expect(p.onSaved).toHaveBeenCalled());expect(mocks.run.mock.calls[0][2]).toBe(mocks.run.mock.calls[1][2]);
});
it('preserves untouched event instants and exact source timestamp while editing text',async()=>{
 const p=props({kind:'edit-block',plan,block});render(<AwsPlannerEditor {...p}/>);fireEvent.change(screen.getByLabelText('Title'),{target:{value:'Edited'}});fireEvent.click(screen.getByRole('button',{name:'Save text block'}));await waitFor(()=>expect(p.onSaved).toHaveBeenCalled());
 const f=mocks.run.mock.calls[0][2].fields;expect(f.start_at).toBe(block.start_at);expect(f.end_at).toBe(block.end_at);expect(f.expected_updated_at).toBe(block.updated_at);expect(f.title_override).toBe('Edited');
});
it('does not dispatch after account verification returns for an old workspace',async()=>{
 let resolve!:(v:unknown)=>void;mocks.getUser.mockReturnValueOnce(new Promise(r=>resolve=r));
 const p=props({kind:'rename-plan',plan}),view=render(<AwsPlannerEditor {...p}/>);fireEvent.click(screen.getByRole('button',{name:'Save weekplan'}));
 view.rerender(<AwsPlannerEditor {...p} workspace={id} action={null}/>);await act(async()=>resolve({data:{user:{id:actor}},error:null}));expect(mocks.run).not.toHaveBeenCalled();expect(p.onSaved).not.toHaveBeenCalled();
});
it('suppresses an old mutation result after switching workspace',async()=>{
 let resolve!:(v:unknown)=>void;mocks.run.mockReturnValueOnce(new Promise(r=>resolve=r));
 const p=props({kind:'rename-plan',plan}),view=render(<AwsPlannerEditor {...p}/>);fireEvent.click(screen.getByRole('button',{name:'Save weekplan'}));await waitFor(()=>expect(mocks.run).toHaveBeenCalled());view.rerender(<AwsPlannerEditor {...p} workspace={id} action={null}/>);await act(async()=>resolve(plan));expect(p.onSaved).not.toHaveBeenCalled();expect(p.onClose).not.toHaveBeenCalled();
});
it('requires an explicit transfer click and carries the loaded source into the request',async()=>{
 const p=props({kind:'handoff',plan,block});render(<AwsPlannerEditor {...p}/>);expect(mocks.run).not.toHaveBeenCalled();expect(screen.getByText(/will not be published/)).toBeInTheDocument();fireEvent.click(screen.getByRole('button',{name:'Create calendar draft'}));await waitFor(()=>expect(p.onSaved).toHaveBeenCalled());expect(mocks.run.mock.calls[0][2]).toEqual({operation:'handoff',row:block,timezone:'UTC'});
});

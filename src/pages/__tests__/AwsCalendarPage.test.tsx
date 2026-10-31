import { act,fireEvent,render,screen,waitFor } from '@testing-library/react';
import { beforeEach,expect,it,vi } from 'vitest';
import Page from '../AwsCalendarPage';
const mocks=vi.hoisted(()=>({members:vi.fn(),read:vi.fn(),month:vi.fn()}));
const actor='10000000-0000-4000-8000-000000000001',workspace='20000000-0000-4000-8000-000000000002',other='30000000-0000-4000-8000-000000000003';
vi.mock('@/hooks/useAuth',()=>({useAuth:()=>({session:{user:{id:actor},access_token:'synthetic'}})}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{}}));
vi.mock('@/lib/awsCalendarRead',()=>({readAwsCalendarMemberships:mocks.members,readAwsCalendar:mocks.read}));
vi.mock('@/components/calendar/CalendarHeroHeader',()=>({CalendarHeroHeader:()=>null}));
vi.mock('@/components/calendar/CalendarBackgroundAurora',()=>({CalendarBackgroundAurora:()=>null}));
vi.mock('@/components/calendar/views/MonthView',()=>({MonthView:(props:any)=>{mocks.month(props);return <div>Original month view</div>;}}));
const result={userId:actor,workspaceId:workspace,workspaceName:'My workspace',offset:0,events:[],membersReturned:1,clientsReturned:0,ownBrandsReturned:0};
beforeEach(()=>{vi.clearAllMocks();mocks.members.mockResolvedValue([{user_id:actor,workspace_id:workspace,role:'owner'},{user_id:actor,workspace_id:other,role:'viewer'}]);mocks.read.mockResolvedValue(result);});
it('loads the selected workspace automatically into a read-only month view',async()=>{
 render(<Page/>);await screen.findByText('Your calendar has no events on this page.');
 expect(mocks.read).toHaveBeenCalledWith({},expect.objectContaining({access_token:'synthetic'}),workspace,0);
 const props=mocks.month.mock.calls.at(-1)![0];expect(props.readOnly).toBe(true);expect(props.onPostMove).toBeUndefined();expect(props.onDateClick).toBeUndefined();
 expect(screen.queryByRole('button',{name:/create|publish|save/i})).not.toBeInTheDocument();
});
it('does not turn failed reads into an empty calendar',async()=>{
 mocks.read.mockRejectedValue(new Error('PRIVATE_DATA'));render(<Page/>);await screen.findByRole('alert');expect(screen.queryByText('Your calendar has no events on this page.')).not.toBeInTheDocument();expect(screen.queryByText('PRIVATE_DATA')).not.toBeInTheDocument();
});
it('discards old workspace results after a workspace switch',async()=>{
 let resolve!:(v:any)=>void;mocks.read.mockReturnValueOnce(new Promise(r=>resolve=r)).mockResolvedValueOnce({...result,workspaceId:other,workspaceName:'Second workspace'});
 render(<Page/>);await waitFor(()=>expect(mocks.read).toHaveBeenCalledTimes(1));
 fireEvent.change(screen.getByLabelText('Calendar workspace'),{target:{value:other}});await screen.findByRole('option',{name:'Second workspace'});
 await act(async()=>resolve(result));expect(screen.queryByRole('option',{name:'My workspace'})).not.toBeInTheDocument();
});
it('does not invent workspace data when membership reads fail',async()=>{
 mocks.members.mockRejectedValue(new Error('failure'));render(<Page/>);await screen.findByRole('alert');expect(mocks.read).not.toHaveBeenCalled();
});

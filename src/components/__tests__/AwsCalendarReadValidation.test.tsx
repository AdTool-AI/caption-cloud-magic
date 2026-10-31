import { act,fireEvent,render,screen } from '@testing-library/react';
import { beforeEach,expect,it,vi } from 'vitest';
import Panel from '../AwsCalendarReadValidation';
const mocks=vi.hoisted(()=>({members:vi.fn(),read:vi.fn()}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{}}));
vi.mock('@/lib/awsCalendarRead',()=>({readAwsCalendarMemberships:mocks.members,readAwsCalendar:mocks.read}));
const actor='10000000-0000-4000-8000-000000000001',workspace='20000000-0000-4000-8000-000000000002';
const session={user:{id:actor},access_token:'synthetic-token'} as any;
const result={userId:actor,workspaceId:workspace,workspaceName:'Test workspace',offset:0,events:[],membersReturned:1,clientsReturned:0,ownBrandsReturned:0};
beforeEach(()=>{vi.clearAllMocks();mocks.members.mockResolvedValue([{user_id:actor,workspace_id:workspace,role:'owner'}]);mocks.read.mockResolvedValue(result);});
it('shows valid empty calendars and offers no write action',async()=>{
 render(<Panel session={session}/>);fireEvent.click(screen.getByText('Load calendar workspaces'));await screen.findByText('Read selected calendar');fireEvent.click(screen.getByText('Read selected calendar'));
 await screen.findByText('No events returned on this page.');expect(screen.queryByRole('button',{name:/publish|save|create|delete/i})).not.toBeInTheDocument();
});
it('discards late results when the session-keyed panel unmounts',async()=>{
 let resolve!:(v:any)=>void;mocks.read.mockReturnValue(new Promise(r=>resolve=r));
 const {rerender}=render(<Panel key="old-session" session={session}/>);fireEvent.click(screen.getByText('Load calendar workspaces'));await screen.findByText('Read selected calendar');fireEvent.click(screen.getByText('Read selected calendar'));
 rerender(<Panel key="new-session" session={{...session,access_token:'new-token'}}/>);await act(async()=>resolve(result));expect(screen.queryByRole('region',{name:'Calendar read results'})).not.toBeInTheDocument();
});
it('does not render backend error details as calendar content',async()=>{
 mocks.members.mockRejectedValue(new Error('PRIVATE_DETAIL'));render(<Panel session={session}/>);fireEvent.click(screen.getByText('Load calendar workspaces'));await screen.findByRole('alert');expect(screen.queryByText('PRIVATE_DETAIL')).not.toBeInTheDocument();expect(screen.queryByText('No events returned on this page.')).not.toBeInTheDocument();
});

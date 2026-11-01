import { beforeEach,expect,it,vi } from 'vitest';
import { fireEvent,render,screen,waitFor,cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Page from '../AwsBillingPage';
vi.mock('react-router-dom',async()=>{const actual=await vi.importActual<typeof import('react-router-dom')>('react-router-dom');return {...actual};});
const m=vi.hoisted(()=>({read:vi.fn(),invoke:vi.fn()}));
vi.mock('@/hooks/useAuth',()=>({useAuth:()=>({session:{user:{id:'actor'},access_token:'jwt'}})}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{from:()=>({select:()=>({setHeader:m.read})}),functions:{invoke:m.invoke}}}));
beforeEach(()=>{cleanup();vi.clearAllMocks();m.read.mockResolvedValue({data:[{id:'actor',plan:'free'}],error:null});});
it('loads the plan without starting checkout or granting credits',async()=>{
 render(<MemoryRouter><Page/></MemoryRouter>);await screen.findByText('free');
 expect(m.invoke).not.toHaveBeenCalled();expect(screen.getByRole('button',{name:'Open starter checkout'})).toBeDisabled();
});
it('coalesces rapid clicks into one checkout and shows the reviewed Stripe link',async()=>{
 m.invoke.mockResolvedValue({data:{url:'https://checkout.stripe.com/c/pay/cs_live_accepted'},error:null});
 render(<MemoryRouter><Page/></MemoryRouter>);await screen.findByText('free');
 const button=screen.getByRole('button',{name:'Open subscription checkout'});fireEvent.click(button);fireEvent.click(button);
 expect(await screen.findByRole('link',{name:'Continue on Stripe'})).toHaveAttribute('href','https://checkout.stripe.com/c/pay/cs_live_accepted');expect(m.invoke).toHaveBeenCalledOnce();
});
it('does not claim subscription payment from a return URL',async()=>{
 render(<MemoryRouter initialEntries={['/welcome?session_id=cs_live_fake']}><Page/></MemoryRouter>);
 await screen.findByText('free');expect(screen.getByText(/does not confirm payment by itself/)).toBeInTheDocument();expect(m.invoke).not.toHaveBeenCalled();
});
it('verifies a credit return only when requested and displays the server balance',async()=>{
 m.read.mockResolvedValue({data:[{id:'actor',plan:'basic'}],error:null});m.invoke.mockResolvedValue({data:{success:true,newBalance:9},error:null});
 render(<MemoryRouter initialEntries={['/ai-video-studio?payment=success&session_id=cs_live_'+'a'.repeat(40)]}><Page/></MemoryRouter>);
 await screen.findByText('basic');expect(m.invoke).not.toHaveBeenCalled();fireEvent.click(screen.getByRole('button',{name:'Verify credit purchase'}));
 await screen.findByText('Verified wallet balance: 9.00 credits');expect(m.invoke).toHaveBeenCalledOnce();
});
it('hides a foreign profile and leaves checkout disabled',async()=>{
 m.read.mockResolvedValue({data:[{id:'foreign',plan:'basic'}],error:null});render(<MemoryRouter><Page/></MemoryRouter>);
 await screen.findByRole('alert');expect(screen.getByRole('button',{name:'Open subscription checkout'})).toBeDisabled();expect(m.invoke).not.toHaveBeenCalled();
});
it('keeps an uncertain checkout disabled instead of creating a second one',async()=>{
 m.invoke.mockResolvedValue({data:null,error:{context:new Response('{}',{status:503})}});render(<MemoryRouter><Page/></MemoryRouter>);await screen.findByText('free');
 fireEvent.click(screen.getByRole('button',{name:'Open subscription checkout'}));await screen.findByRole('alert');
 expect(screen.getByRole('button',{name:'Open subscription checkout'})).toBeDisabled();expect(m.invoke).toHaveBeenCalledOnce();
});

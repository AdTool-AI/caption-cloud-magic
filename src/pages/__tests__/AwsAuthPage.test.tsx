import { act,fireEvent,render,screen,waitFor } from '@testing-library/react';
import { beforeEach,expect,it,vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import Auth from '../Auth';
vi.unmock('react-router-dom');
const m=vi.hoisted(()=>({state:null as any,signin:vi.fn(),signup:vi.fn(),signout:vi.fn(),clearMfa:vi.fn()}));
vi.mock('@/lib/backendTarget',()=>({isAwsTestBackend:true}));
vi.mock('@/hooks/useAuth',()=>({useAuth:()=>({...m.state,signIn:m.signin,signUp:m.signup,signOut:m.signout,clearMfaRequirement:m.clearMfa})}));
vi.mock('@/hooks/useTranslation',()=>({useTranslation:()=>({t:(key:string)=>({auth_login_title:'Welcome back',auth_welcome_back:'Sign in to AdTool AI',auth_login_description:'Access your workspace',auth_email:'Email',auth_password:'Password',btn_login:'Sign in',auth_show_password:'Show password',auth_hide_password:'Hide password'}[key]??key)})}));
vi.mock('@/components/SEO',()=>({SEO:()=>null}));
vi.mock('@/components/auth/GoogleSignInButton',()=>({GoogleSignInButton:()=>{throw Error('Unsupported Google sign-in mounted');}}));
vi.mock('@/components/account/TwoFactorChallenge',()=>({TwoFactorChallenge:()=>{throw Error('Unsupported MFA transport mounted');}}));
vi.mock('@/components/system-status/AuthStatusIndicator',()=>({AuthStatusIndicator:()=>{throw Error('Unsupported status transport mounted');}}));
vi.mock('@/components/landing/BlackTieFooter',()=>({BlackTieFooter:()=>null}));
vi.mock('@/lib/analytics',()=>({trackEvent:vi.fn(),ANALYTICS_EVENTS:{}}));
const mount=()=>render(<MemoryRouter><Auth/></MemoryRouter>);
beforeEach(()=>{vi.clearAllMocks();localStorage.clear();m.state={user:null,session:null,loading:false,requiresMfa:false};m.signin.mockResolvedValue({error:null});m.signout.mockResolvedValue(undefined);});
it('reuses the original sign-in design with only available AWS controls',()=>{
 mount();expect(screen.getByRole('heading',{name:'Welcome back'})).toBeInTheDocument();expect(screen.getByLabelText('Email')).toHaveAttribute('autocomplete','email');expect(screen.getByLabelText('Password')).toHaveAttribute('autocomplete','current-password');
 expect(screen.queryByText(/AWS connection validation/)).not.toBeInTheDocument();expect(screen.getByRole('link',{name:'Forgot password?'})).toHaveAttribute('href','/forgot-password');expect(screen.queryByText(/signup|remember/i)).not.toBeInTheDocument();
});
it('uses real email/password sign-in and clears password after completion',async()=>{
 mount();fireEvent.change(screen.getByLabelText('Email'),{target:{value:'owner@example.invalid'}});fireEvent.change(screen.getByLabelText('Password'),{target:{value:'synthetic-password'}});fireEvent.click(screen.getByRole('button',{name:'Sign in',exact:true}));
 await waitFor(()=>expect(m.signin).toHaveBeenCalledWith('owner@example.invalid','synthetic-password'));await waitFor(()=>expect(screen.getByLabelText('Password')).toHaveValue(''));expect(m.signup).not.toHaveBeenCalled();
});
it('shows a safe failure without disclosing backend messages',async()=>{
 m.signin.mockRejectedValue(Error('private backend details'));mount();fireEvent.change(screen.getByLabelText('Email'),{target:{value:'owner@example.invalid'}});fireEvent.change(screen.getByLabelText('Password'),{target:{value:'synthetic-password'}});fireEvent.click(screen.getByRole('button',{name:'Sign in',exact:true}));
 await screen.findByRole('alert');expect(screen.queryByText(/private backend details/)).not.toBeInTheDocument();expect(screen.getByLabelText('Password')).toHaveValue('');expect(screen.getByRole('button',{name:'Sign in',exact:true})).toBeEnabled();
});
it('does not submit a rapid double click twice',async()=>{
 let finish!:(v:any)=>void;m.signin.mockReturnValue(new Promise(r=>finish=r));mount();fireEvent.change(screen.getByLabelText('Email'),{target:{value:'owner@example.invalid'}});fireEvent.change(screen.getByLabelText('Password'),{target:{value:'synthetic-password'}});
 const button=screen.getByRole('button',{name:'Sign in',exact:true});fireEvent.click(button);fireEvent.click(button);expect(m.signin).toHaveBeenCalledOnce();await act(async()=>finish({error:null}));
});
it('keeps MFA-incomplete sessions blocked and never clears assurance locally',async()=>{
 m.state={user:{id:'actor'},session:{user:{id:'actor'}},requiresMfa:true,loading:false};mount();expect(screen.getByRole('alert')).toHaveTextContent('additional verification');expect(screen.queryByLabelText('Password')).not.toBeInTheDocument();fireEvent.click(screen.getByRole('button',{name:'Sign out'}));expect(m.signout).toHaveBeenCalledOnce();expect(m.clearMfa).not.toHaveBeenCalled();
});
it('retains the password visibility toggle',()=>{
 mount();fireEvent.click(screen.getByRole('button',{name:'Show password'}));expect(screen.getByLabelText('Password')).toHaveAttribute('type','text');fireEvent.click(screen.getByRole('button',{name:'Hide password'}));expect(screen.getByLabelText('Password')).toHaveAttribute('type','password');
});

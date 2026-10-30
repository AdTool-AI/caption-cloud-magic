import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import AwsValidation from '../AwsValidation';
const mocks=vi.hoisted(()=>({auth:{current:null as any},read:vi.fn(),signIn:vi.fn(),signOut:vi.fn()}));
vi.mock('@/hooks/useAuth',()=>({useAuth:()=>mocks.auth.current}));
vi.mock('@/lib/awsBootstrap',()=>({readAwsBootstrap:mocks.read}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{}}));
function auth(id='one') {return {user:{id,email:'synthetic@example.invalid'},session:{user:{id},access_token:'synthetic-'+id},loading:false,requiresMfa:false,subscriptionCheckStatus:'unavailable',signIn:mocks.signIn,signOut:mocks.signOut};}
function summary(id='one') {return {userId:id,tables:[{name:'user_roles',rowsReturned:0}],pricingModels:39,visibleTemplates:0};}
beforeEach(()=>{vi.stubEnv('VITE_SUPABASE_URL','https://api-prod.useadtool.ai');vi.clearAllMocks();mocks.auth.current=auth();mocks.read.mockResolvedValue(summary());});
it('shows only count results and never tokens, email or false full-application acceptance in the report',async()=>{
 const {container}=render(<AwsValidation />);fireEvent.click(screen.getByRole('button',{name:'Validate account reads and catalogs'}));
 await screen.findByRole('region',{name:'Validation results'});
 const report=container.querySelector('pre')!.textContent!;expect(report).toContain('"fullApplicationAccepted": false');expect(report).toContain('"globalAdminAccess": false');expect(report).not.toContain('synthetic-one');expect(report).not.toContain('synthetic@example.invalid');
});
it('drops a late account response after a session change',async()=>{
 let resolve!:(value:any)=>void;mocks.read.mockReturnValue(new Promise(r=>resolve=r));
 const {rerender}=render(<AwsValidation />);fireEvent.click(screen.getByRole('button',{name:'Validate account reads and catalogs'}));
 mocks.auth.current=auth('two');rerender(<AwsValidation />);
 await act(async()=>resolve(summary()));expect(screen.queryByRole('region',{name:'Validation results'})).not.toBeInTheDocument();
});
it('shows failures without treating them as empty success',async()=>{
 mocks.read.mockRejectedValue(new Error('PRIVATE_BACKEND_DETAIL'));render(<AwsValidation />);fireEvent.click(screen.getByRole('button',{name:'Validate account reads and catalogs'}));
 await screen.findByRole('alert');expect(screen.queryByRole('region',{name:'Validation results'})).not.toBeInTheDocument();expect(screen.queryByText('PRIVATE_BACKEND_DETAIL')).not.toBeInTheDocument();
});
it('does not offer signup or billing actions and requires a completed MFA session',()=>{
 mocks.auth.current={...auth(),requiresMfa:true};render(<AwsValidation />);expect(screen.queryByRole('button',{name:'Validate account reads and catalogs'})).not.toBeInTheDocument();expect(mocks.read).not.toHaveBeenCalled();
});

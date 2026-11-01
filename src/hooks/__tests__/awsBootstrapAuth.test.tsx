import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from '../useAuth';
const mocks=vi.hoisted(()=>({aws:true,invoke:vi.fn(),signup:vi.fn(),signin:vi.fn(),identify:vi.fn(),track:vi.fn(),assurance:vi.fn(),authEvent:null as any,session:{user:{id:'one'},access_token:'synthetic'} as any}));
vi.mock('@/lib/backendTarget',()=>({get isAwsTestBackend(){return mocks.aws;},awsTestAuthStorageKey:()=> 'aws-auth-fixed'}));
vi.mock('@/lib/analytics',()=>({identifyUser:mocks.identify,resetUser:vi.fn(),trackEvent:mocks.track,ANALYTICS_EVENTS:{}}));
vi.mock('sonner',()=>({toast:{success:vi.fn(),error:vi.fn()}}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{functions:{invoke:mocks.invoke},auth:{
 getSession:()=>Promise.resolve({data:{session:mocks.session}}),onAuthStateChange:(callback:any)=>{mocks.authEvent=callback;return {data:{subscription:{unsubscribe:vi.fn()}}};},
 signUp:mocks.signup,signInWithPassword:mocks.signin,signOut:vi.fn(),mfa:{getAuthenticatorAssuranceLevel:mocks.assurance}
}}}));
beforeEach(()=>{mocks.aws=true;localStorage.clear();vi.clearAllMocks();mocks.session={user:{id:'one'},access_token:'synthetic'};mocks.assurance.mockResolvedValue({data:{currentLevel:'aal1',nextLevel:'aal1'},error:null});mocks.invoke.mockResolvedValue({data:{subscribed:true,product_id:'paid',subscription_end:'future'},error:null});mocks.signin.mockResolvedValue({data:{user:{id:'one'}},error:null});});
it('AWS ignores cached paid state and never invokes the missing billing handler',async()=>{
 localStorage.setItem('subscription_cache:aws-auth-fixed',JSON.stringify({subscribed:true,productId:'paid',subscriptionEnd:'future',cachedAt:Date.now()}));
 const {result}=renderHook(()=>useAuth(),{wrapper:AuthProvider});
 await waitFor(()=>expect(result.current.subscriptionCheckStatus).toBe('unavailable'));
 expect(result.current.subscribed).toBe(false);expect(result.current.productId).toBeNull();expect(localStorage.getItem('subscription_cache:aws-auth-fixed')).toBeNull();
 await act(async()=>result.current.refreshSubscription());expect(mocks.invoke).not.toHaveBeenCalled();
});
it('AWS blocks self-service signup and does not identify sign-ins to analytics',async()=>{
 const {result}=renderHook(()=>useAuth(),{wrapper:AuthProvider});await waitFor(()=>expect(result.current.loading).toBe(false));
 await act(async()=>{expect((await result.current.signUp('synthetic@example.invalid','synthetic')).error).toBeInstanceOf(Error);await result.current.signIn('synthetic@example.invalid','synthetic');});
 expect(mocks.signup).not.toHaveBeenCalled();expect(mocks.identify).not.toHaveBeenCalled();expect(mocks.invoke).not.toHaveBeenCalled();
});

it('rechecks restored sessions and blocks an incomplete MFA challenge after reload',async()=>{
 mocks.assurance.mockResolvedValue({data:{currentLevel:'aal1',nextLevel:'aal2'},error:null});
 const {result}=renderHook(()=>useAuth(),{wrapper:AuthProvider});
 await waitFor(()=>expect(result.current.loading).toBe(false));
 expect(mocks.assurance).toHaveBeenCalledWith('synthetic');expect(result.current.requiresMfa).toBe(true);
 act(()=>result.current.clearMfaRequirement());expect(result.current.requiresMfa).toBe(true);
});
it('keeps assurance failures and missing claims blocked',async()=>{
 mocks.assurance.mockResolvedValue({data:{currentLevel:null,nextLevel:null},error:null});
 const {result}=renderHook(()=>useAuth(),{wrapper:AuthProvider});
 await waitFor(()=>expect(result.current.loading).toBe(false));expect(result.current.requiresMfa).toBe(true);
});
it('ignores an old successful assurance response after signout',async()=>{
 let resolve:any;mocks.assurance.mockImplementation(()=>new Promise(r=>{resolve=r;}));
 const {result}=renderHook(()=>useAuth(),{wrapper:AuthProvider});
 await waitFor(()=>expect(mocks.assurance).toHaveBeenCalled());
 act(()=>mocks.authEvent('SIGNED_OUT',null));
 await act(async()=>resolve({data:{currentLevel:'aal1',nextLevel:'aal1'},error:null}));
 expect(result.current.user).toBeNull();expect(result.current.session).toBeNull();expect(result.current.loading).toBe(false);
});
it('ignores a previous account assurance response while a new account remains blocked',async()=>{
 let resolve:any;mocks.assurance.mockImplementationOnce(()=>new Promise(r=>{resolve=r;})).mockResolvedValue({data:{currentLevel:'aal1',nextLevel:'aal2'},error:null});
 const {result}=renderHook(()=>useAuth(),{wrapper:AuthProvider});
 await waitFor(()=>expect(mocks.assurance).toHaveBeenCalledTimes(1));
 act(()=>mocks.authEvent('SIGNED_IN',{user:{id:'two'},access_token:'second'}));
 await waitFor(()=>expect(mocks.assurance).toHaveBeenCalledWith('second'));
 await waitFor(()=>expect(result.current.loading).toBe(false));
 await act(async()=>resolve({data:{currentLevel:'aal1',nextLevel:'aal1'},error:null}));
 expect(result.current.user?.id).toBe('two');expect(result.current.requiresMfa).toBe(true);
});

it('keeps thrown assurance checks blocked',async()=>{
 mocks.assurance.mockRejectedValue(new Error('Unavailable'));
 const {result}=renderHook(()=>useAuth(),{wrapper:AuthProvider});
 await waitFor(()=>expect(result.current.loading).toBe(false));expect(result.current.requiresMfa).toBe(true);
});
it('accepts a restored session only after complete aal2 verification',async()=>{
 let resolve:any;mocks.assurance.mockImplementation(()=>new Promise(r=>{resolve=r;}));
 const {result}=renderHook(()=>useAuth(),{wrapper:AuthProvider});
 await waitFor(()=>expect(mocks.assurance).toHaveBeenCalled());
 expect(result.current.loading).toBe(true);expect(result.current.requiresMfa).toBe(true);
 await act(async()=>resolve({data:{currentLevel:'aal2',nextLevel:'aal2'},error:null}));
 expect(result.current.loading).toBe(false);expect(result.current.requiresMfa).toBe(false);
});

import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from '../useAuth';
const mocks=vi.hoisted(()=>({aws:true,invoke:vi.fn(),signup:vi.fn(),signin:vi.fn(),identify:vi.fn(),track:vi.fn(),session:{user:{id:'one'},access_token:'synthetic'} as any}));
vi.mock('@/lib/backendTarget',()=>({get isAwsTestBackend(){return mocks.aws;},awsTestAuthStorageKey:()=> 'aws-auth-fixed'}));
vi.mock('@/lib/analytics',()=>({identifyUser:mocks.identify,resetUser:vi.fn(),trackEvent:mocks.track,ANALYTICS_EVENTS:{}}));
vi.mock('sonner',()=>({toast:{success:vi.fn(),error:vi.fn()}}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{functions:{invoke:mocks.invoke},auth:{
 getSession:()=>Promise.resolve({data:{session:mocks.session}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe:vi.fn()}}}),
 signUp:mocks.signup,signInWithPassword:mocks.signin,signOut:vi.fn(),mfa:{getAuthenticatorAssuranceLevel:()=>Promise.resolve({data:{currentLevel:'aal1',nextLevel:'aal1'}})}
}}}));
beforeEach(()=>{mocks.aws=true;localStorage.clear();vi.clearAllMocks();mocks.invoke.mockResolvedValue({data:{subscribed:true,product_id:'paid',subscription_end:'future'},error:null});mocks.signin.mockResolvedValue({data:{user:{id:'one'}},error:null});});
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

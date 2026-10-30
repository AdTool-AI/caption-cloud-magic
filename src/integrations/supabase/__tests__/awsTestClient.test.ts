import {beforeEach,expect,it,vi} from 'vitest';
vi.unmock('@/integrations/supabase/client');
const mocks=vi.hoisted(()=>({create:vi.fn()}));
vi.mock('@supabase/supabase-js',()=>({createClient:mocks.create}));
beforeEach(()=>{vi.resetModules();vi.clearAllMocks();vi.stubEnv('VITE_BACKEND_TARGET','aws-test');vi.stubEnv('VITE_SUPABASE_URL','https://api-prod.useadtool.ai');vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY','public-anon');mocks.create.mockReturnValue({});});
it('uses only the AWS origin, namespaced local session and scoped transport',async()=>{
 await import('../client');const args=mocks.create.mock.calls[0];
 expect(args[0]).toBe('https://api-prod.useadtool.ai');expect(args[2].auth.storage).toBe(window.localStorage);
 expect(args[2].auth.storageKey).toBe('adtool-aws-test-api-prod.useadtool.ai-auth');expect(args[2].global.fetch).toBeTypeOf('function');
});
it('has no OAuth fallback button before native OAuth is configured',async()=>{
 const {GoogleSignInButton}=await import('@/components/auth/GoogleSignInButton');expect(GoogleSignInButton({})).toBeNull();expect(mocks.create).not.toHaveBeenCalled();
});

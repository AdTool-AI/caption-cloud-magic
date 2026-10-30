import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { useUserRoles } from '../useUserRoles';
const mocks=vi.hoisted(()=>({aws:true,from:vi.fn(),eq:vi.fn(),user:{id:'one'}}));
vi.mock('@/lib/backendTarget',()=>({get isAwsTestBackend(){return mocks.aws;}}));
vi.mock('../useAuth',()=>({useAuth:()=>({user:mocks.user})}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{from:mocks.from}}));
beforeEach(()=>{mocks.aws=true;vi.clearAllMocks();mocks.eq.mockResolvedValue({data:[{role:'admin'}],error:null});mocks.from.mockReturnValue({select:()=>({eq:mocks.eq})});});
it('AWS makes no global-role query and grants no admin or moderator authority',async()=>{
 const {result}=renderHook(()=>useUserRoles());await waitFor(()=>expect(result.current.loading).toBe(false));
 expect(result.current.roles).toEqual([]);expect(result.current.isAdmin).toBe(false);expect(result.current.isModerator).toBe(false);expect(result.current.globalRoleStatus).toBe('unavailable');expect(mocks.from).not.toHaveBeenCalled();
});

import {beforeEach,expect,it,vi} from 'vitest';
import {updateAwsRecoveryPassword} from '../awsRecoveryPassword';
const fetcher=vi.fn();
beforeEach(()=>{vi.clearAllMocks();vi.stubEnv('VITE_SUPABASE_URL','https://api-prod.useadtool.ai');vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY','synthetic-public-anon');});
it('binds the password update and logout to the verified token',async()=>{
 fetcher.mockResolvedValueOnce(new Response(JSON.stringify({id:'owner'}))).mockResolvedValueOnce(new Response(null,{status:204}));
 expect(await updateAwsRecoveryPassword('owner','verified-token','LongEnough123!',fetcher)).toEqual({sessionsEnded:true});
 const [url,options]=fetcher.mock.calls[0];expect(url).toBe('https://api-prod.useadtool.ai/auth/v1/user');expect(options.method).toBe('PUT');expect(options.headers.get('Authorization')).toBe('Bearer verified-token');expect(JSON.parse(options.body)).toEqual({password:'LongEnough123!'});expect(options.credentials).toBe('omit');expect(options.redirect).toBe('error');
 expect(fetcher.mock.calls[1][0]).toMatch(/\/auth\/v1\/logout\?scope=global$/);expect(fetcher.mock.calls[1][1].headers.get('Authorization')).toBe('Bearer verified-token');
});
it('does not retry an uncertain update or export provider errors',async()=>{
 fetcher.mockResolvedValue(new Response('private backend details',{status:500}));await expect(updateAwsRecoveryPassword('owner','verified-token','LongEnough123!',fetcher)).rejects.toThrow('could not be updated');expect(fetcher).toHaveBeenCalledOnce();
});
it('rejects a response for a different account',async()=>{fetcher.mockResolvedValue(new Response(JSON.stringify({id:'foreign'})));await expect(updateAwsRecoveryPassword('owner','verified-token','LongEnough123!',fetcher)).rejects.toThrow('could not be verified');expect(fetcher).toHaveBeenCalledOnce();});
it.each(['network','server'])('reports a changed password separately from failed logout: %s',async failure=>{
 fetcher.mockResolvedValueOnce(new Response(JSON.stringify({id:'owner'})));if(failure==='network')fetcher.mockRejectedValueOnce(Error('private'));else fetcher.mockResolvedValueOnce(new Response('{}',{status:500}));
 expect(await updateAwsRecoveryPassword('owner','verified-token','LongEnough123!',fetcher)).toEqual({sessionsEnded:false});expect(fetcher).toHaveBeenCalledTimes(2);
});
it('rejects weak passwords and foreign backends before network',async()=>{
 await expect(updateAwsRecoveryPassword('owner','token','weak',fetcher)).rejects.toThrow();vi.stubEnv('VITE_SUPABASE_URL','https://foreign.invalid');await expect(updateAwsRecoveryPassword('owner','token','LongEnough123!',fetcher)).rejects.toThrow('approved AWS');expect(fetcher).not.toHaveBeenCalled();
});

import { beforeEach, expect, it, vi } from 'vitest';
import { createAwsValidationFetch } from '../awsValidationFetch';
const fetcher=vi.fn();const origin='https://api-prod.useadtool.ai';
beforeEach(()=>fetcher.mockReset().mockResolvedValue(new Response('{}')));
it('strips only the SDK public profile and preserves caller headers without cookies or redirects',async()=>{
 const call=createAwsValidationFetch(fetcher,origin);
 await call(origin+'/rest/v1/profiles?select=*',{headers:{'Accept-Profile':'public',Authorization:'Bearer synthetic',apikey:'public'}});
 const options=fetcher.mock.calls[0][1];expect(options.headers.get('Accept-Profile')).toBeNull();expect(options.headers.get('Authorization')).toBe('Bearer synthetic');expect(options.redirect).toBe('error');expect(options.credentials).toBe('omit');
});
it.each([
 ['/rest/v1/profiles?select=*,workspaces(*)','GET'],['/rest/v1/profiles?select=*&id=eq.one','GET'],
 ['/rest/v1/profiles','PATCH'],['/rest/v1/rpc/render_queue_stats','GET'],['/graphql/v1','POST'],
 ['/auth/v1/signup','POST'],['/auth/v1/token?grant_type=id_token','POST'],
 ['/auth/v1/token?grant_type=password&grant_type=id_token','POST'],['/functions/v1/check-subscription','POST'],
])('blocks unsupported request %s %s before network',async(path,method)=>{
 await expect(createAwsValidationFetch(fetcher,origin)(origin+path,{method})).rejects.toThrow('scope');expect(fetcher).not.toHaveBeenCalled();
});
it('rejects other origins and schema overrides',async()=>{
 const call=createAwsValidationFetch(fetcher,origin);
 await expect(call('https://old.supabase.co/auth/v1/user')).rejects.toThrow('another backend');
 for(const headers of [{'Accept-Profile':'private'},{'Content-Profile':'public'}]) await expect(call(origin+'/rest/v1/profiles',{headers})).rejects.toThrow('Schema');
 expect(fetcher).not.toHaveBeenCalled();
});
it.each(['/auth/v1/token?grant_type=password','/auth/v1/token?grant_type=refresh_token','/auth/v1/logout?scope=global','/functions/v1/get-video-templates'])('permits canonical SDK POST %s',async path=>{
 await createAwsValidationFetch(fetcher,origin)(origin+path,{method:'POST',body:'{}'});expect(fetcher).toHaveBeenCalledOnce();
});

it('permits pricing GET and rejects pricing POST before network',async()=>{
 const call=createAwsValidationFetch(fetcher,origin);
 await call(origin+'/functions/v1/pricing-catalog',{method:'GET'});
 expect(fetcher).toHaveBeenCalledOnce();fetcher.mockClear();
 await expect(call(origin+'/functions/v1/pricing-catalog',{method:'POST',body:'{}'})).rejects.toThrow('scope');
 expect(fetcher).not.toHaveBeenCalled();
});

it.each(['create-checkout','ai-video-purchase-credits','ai-video-verify-purchase'])('permits only exact browser billing POST %s',async slug=>{
 const call=createAwsValidationFetch(fetcher,origin);const path=origin+'/functions/v1/'+slug;
 await call(path,{method:'POST',body:'{}'});expect(fetcher).toHaveBeenCalledOnce();fetcher.mockClear();
 for(const [url,method] of [[path,'GET'],[path+'?override=true','POST'],[path+'/','POST']] as const)await expect(call(url,{method})).rejects.toThrow('scope');
 expect(fetcher).not.toHaveBeenCalled();
});
it('keeps direct webhook submission and generation outside the browser client',async()=>{
 const call=createAwsValidationFetch(fetcher,origin);
 for(const path of ['/functions/v1/stripe-webhook','/functions/v1/generate-image-replicate'])await expect(call(origin+path,{method:'POST',body:'{}'})).rejects.toThrow('scope');
 expect(fetcher).not.toHaveBeenCalled();
});

it.each(['https://legacy.supabase.co','https://ai.gateway.lovable.dev','https://api-prod.useadtool.ai.evil.example','https://user:pass@api-prod.useadtool.ai','https://api-prod.useadtool.ai/rest/v1','http://127.0.0.1:9999'])('refuses a non-AWS client configuration %s before network',backend=>{
 expect(()=>createAwsValidationFetch(fetcher,backend)).toThrow('approved AWS');expect(fetcher).not.toHaveBeenCalled();
});
it('permits the fixed local AWS proxy as the development client origin',async()=>{
 await createAwsValidationFetch(fetcher,'http://127.0.0.1:4174')('http://127.0.0.1:4174/auth/v1/user');expect(fetcher).toHaveBeenCalledOnce();
});

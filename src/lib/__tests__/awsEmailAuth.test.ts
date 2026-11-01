import {expect,it,vi} from 'vitest';
import {createClient} from '@supabase/supabase-js';
import {createAwsValidationFetch} from '../awsValidationFetch';
import {AWS_EMAIL_CALLBACK,AWS_RECOVERY_URI,readAwsEmailCallback,isAwsEmailAuthRequest,validAwsRecoveryPassword} from '../awsEmailAuth';
const params={access_token:'header.payload.signature',refresh_token:'synthetic_refresh_token',type:'recovery',token_type:'bearer',expires_in:'3600'};
const url=(values=params)=>({pathname:'/auth/callback',search:'',hash:'#'+new URLSearchParams(values).toString()});
it('captures a supported email callback without persisting it',()=>{expect(readAwsEmailCallback(url())).toEqual({kind:'recovery',accessToken:params.access_token});expect(readAwsEmailCallback(url({...params,type:'signup'}))).toEqual({kind:'signup',accessToken:params.access_token});});
it.each(['magiclink','invite','email_change','google',''])('does not consume unsupported callback type %s',type=>{expect(readAwsEmailCallback(url({...params,type}))).toEqual({kind:'invalid'});});
it('rejects duplicates, errors, query redirects and malformed credentials',()=>{
 for(const value of [{...url(),hash:url().hash+'&type=signup'},{...url(),search:'?next=https://evil.invalid'},{...url(),hash:'#error_description=private-details'},{...url(),hash:'#'+new URLSearchParams({...params,access_token:'bad'}).toString()},{...url(),hash:'#'+new URLSearchParams({...params,refresh_token:''}).toString()}])expect(readAwsEmailCallback(value)).toEqual({kind:'invalid'});
});
it('ignores tokens at every route except the explicit callback',()=>{expect(readAwsEmailCallback({...url(),pathname:'/home'})).toEqual({kind:'none'});});
it('permits only the accepted recover query and user PUT',()=>{
 expect(AWS_EMAIL_CALLBACK).toBe('https://prodtest.useadtool.ai/auth/callback');expect(isAwsEmailAuthRequest(AWS_RECOVERY_URI,'POST')).toBe(true);expect(isAwsEmailAuthRequest('/auth/v1/user','PUT')).toBe(true);
 for(const [uri,method] of [[AWS_RECOVERY_URI+'&next=evil','POST'],['/auth/v1/signup?redirect_to='+encodeURIComponent(AWS_EMAIL_CALLBACK),'POST'],['/auth/v1/recover','POST'],['/auth/v1/user?x=1','PUT'],['/auth/v1/user','PATCH']])expect(isAwsEmailAuthRequest(uri,method)).toBe(false);
});
it('requires a strong bounded new password',()=>{expect(validAwsRecoveryPassword('LongEnough123!')).toBe(true);for(const value of ['short1!','abcdefghijklmnop','1'.repeat(14),'a1!'.repeat(100)])expect(validAwsRecoveryPassword(value)).toBe(false);});

it('matches the actual Auth SDK recovery URL and canonicalizes its UTF-8 JSON header',async()=>{
 const network=vi.fn().mockResolvedValue(new Response('{}',{headers:{'Content-Type':'application/json'}}));const origin='https://api-prod.useadtool.ai';
 const client=createClient(origin,'synthetic-public-anon',{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:createAwsValidationFetch(network,origin)}});
 const result=await client.auth.resetPasswordForEmail('synthetic@example.invalid',{redirectTo:AWS_EMAIL_CALLBACK});
 expect(result.error).toBeNull();expect(network).toHaveBeenCalledOnce();expect(network.mock.calls[0][0]).toBe(origin+AWS_RECOVERY_URI);expect(network.mock.calls[0][1].headers.get('Content-Type')).toBe('application/json');expect(JSON.parse(network.mock.calls[0][1].body).email).toBe('synthetic@example.invalid');
});

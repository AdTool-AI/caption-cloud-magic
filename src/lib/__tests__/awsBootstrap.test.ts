import { createClient, type Session } from '@supabase/supabase-js';
import { beforeEach, expect, it, vi } from 'vitest';
import { readAwsBootstrap } from '../awsBootstrap';
import { createAwsValidationFetch } from '../awsValidationFetch';
const ID='11111111-1111-4111-8111-111111111111',OTHER='22222222-2222-4222-8222-222222222222';
const session={user:{id:ID},access_token:'caller-token'} as Session;
let data:Record<string,unknown>; let calls:Array<{url:URL;headers:Headers;method:string}>;
function client() {
 return createClient<any>('https://api-prod.useadtool.ai','public-anon',{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false,storageKey:'synthetic-'+Math.random()},global:{fetch:createAwsValidationFetch(async(input,init)=>{
  const url=new URL(String(input));calls.push({url,headers:new Headers(init?.headers),method:init?.method??'GET'});
  return new Response(JSON.stringify(data[url.pathname]),{status:200,headers:{'Content-Type':'application/json'}});
 },'https://api-prod.useadtool.ai')}});
}
beforeEach(()=>{
 calls=[];data={'/auth/v1/user':{id:ID},'/rest/v1/profiles':[{id:ID}],'/rest/v1/workspaces':[{id:'workspace',owner_id:ID}],
 '/rest/v1/workspace_members':[{user_id:ID,workspace_id:'workspace'}],'/rest/v1/user_roles':[],
 '/functions/v1/pricing-catalog':{models:[{id:'model',sellEUR:1,sellUSD:1,listEUR:1,listUSD:1}]},'/functions/v1/get-video-templates':{ok:true,templates:[]}};
});
it('real SDK sends only canonical read queries and explicit caller JWTs',async()=>{
 const result=await readAwsBootstrap(client(),session);
 expect(result.visibleTemplates).toBe(0);expect(result.tables.find(t=>t.name==='user_roles')?.rowsReturned).toBe(0);
 expect(calls).toHaveLength(7);
 for(const call of calls){
  expect(call.url.origin).toBe('https://api-prod.useadtool.ai');expect(call.headers.get('Authorization')).toBe('Bearer caller-token');
  expect(call.headers.get('Accept-Profile')).toBeNull();expect(call.headers.get('apikey')).toBe('public-anon');
  if(call.url.pathname.startsWith('/rest/')){expect(call.url.search).toBe('?select=*');expect(call.method).toBe('GET');}
  else if(call.url.pathname.startsWith('/functions/')){expect(call.method).toBe(call.url.pathname.endsWith('/pricing-catalog')?'GET':'POST');expect(call.url.search).toBe('');}
 }
 expect(JSON.stringify(result)).not.toContain('caller-token');
});
it('rejects unverified identity before any table or function read',async()=>{
 data['/auth/v1/user']={id:OTHER};await expect(readAwsBootstrap(client(),session)).rejects.toThrow('verified');expect(calls).toHaveLength(1);
});
it('blocks MFA-enabled accounts on the screen without an MFA challenge',async()=>{
 data['/auth/v1/user']={id:ID,factors:[{status:'verified'}]};await expect(readAwsBootstrap(client(),session)).rejects.toThrow('MFA');expect(calls).toHaveLength(1);
});
it.each(['profiles','workspaces','workspace_members','user_roles'])('rejects foreign %s rows instead of showing a successful summary',async table=>{
 data['/rest/v1/'+table]=table==='profiles'?[{id:OTHER}]:table==='workspaces'?[{id:'foreign',owner_id:OTHER}]:[{user_id:OTHER,workspace_id:'workspace'}];
 await expect(readAwsBootstrap(client(),session)).rejects.toThrow();expect(calls.some(c=>c.url.pathname.startsWith('/functions/'))).toBe(false);
});
it('rejects mocked/error catalogs and invalid numeric prices',async()=>{
 data['/functions/v1/pricing-catalog']={mock:true,models:[]};await expect(readAwsBootstrap(client(),session)).rejects.toThrow('pricing');
 data['/functions/v1/pricing-catalog']={models:[{id:'x',sellEUR:-1,sellUSD:1,listEUR:1,listUSD:1}]};await expect(readAwsBootstrap(client(),session)).rejects.toThrow('pricing');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {createAwsLocalProxy,LOCAL_FRONTEND,AWS_API} from './aws-local-proxy.mjs';
async function fixture(t,upstream){
 const calls=[];
 const server=createAwsLocalProxy({allow:async(path,method)=>{if(path!=='/auth/v1/user'||method!=='GET')throw Error('denied');},upstream:upstream??(async(...args)=>{calls.push(args);return {status:401,headers:{'content-type':'application/json','set-cookie':'private'},body:Buffer.from('{}')};})});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>{server.closeAllConnections();server.close(r);}));
 return {calls,url:'http://127.0.0.1:'+server.address().port};
}
test('health declares the actual fixed AWS upstream without contacting it',async t=>{const {url,calls}=await fixture(t);const response=await fetch(url+'/__local_health');assert.equal((await response.json()).backend,AWS_API);assert.equal(calls.length,0);});
test('requires the exact local browser origin',async t=>{const {url,calls}=await fixture(t);for(const origin of ['', 'https://evil.invalid','http://localhost:5173'])assert.equal((await fetch(url+'/auth/v1/user',{headers:origin?{Origin:origin}:{}})).status,403);assert.equal(calls.length,0);});
test('forwards only allowed headers, preserves AWS denial, strips cookies',async t=>{const {url,calls}=await fixture(t);const r=await fetch(url+'/auth/v1/user',{headers:{Origin:LOCAL_FRONTEND,Authorization:'Bearer synthetic',apikey:'public',Cookie:'private','X-HTTP-Method-Override':'DELETE'}});assert.equal(r.status,401);assert.equal(r.headers.get('access-control-allow-origin'),LOCAL_FRONTEND);assert.equal(r.headers.get('set-cookie'),null);assert.deepEqual(calls[0].slice(0,3),['/auth/v1/user','GET',{authorization:'Bearer synthetic',apikey:'public'}]);});
test('denies unreviewed routes, query changes and write methods before forwarding',async t=>{const {url,calls}=await fixture(t);for(const [path,method]of [['/rest/v1/rpc/admin','POST'],['/auth/v1/user?x=1','GET'],['/auth/v1/user','DELETE']])assert.equal((await fetch(url+path,{method,headers:{Origin:LOCAL_FRONTEND}})).status,404);assert.equal(calls.length,0);});
test('preflight checks method, route and header names without AWS calls',async t=>{const {url,calls}=await fixture(t);const headers={Origin:LOCAL_FRONTEND,'Access-Control-Request-Method':'GET','Access-Control-Request-Headers':'authorization,apikey'};assert.equal((await fetch(url+'/auth/v1/user',{method:'OPTIONS',headers})).status,204);assert.equal((await fetch(url+'/auth/v1/user',{method:'OPTIONS',headers:{...headers,'Access-Control-Request-Headers':'x-unreviewed'}})).status,403);assert.equal(calls.length,0);});
test('rejects redirects and does not leak transport errors',async t=>{const a=await fixture(t,async()=>({status:302,headers:{location:'https://evil.invalid'},body:Buffer.alloc(0)}));assert.equal((await fetch(a.url+'/auth/v1/user',{headers:{Origin:LOCAL_FRONTEND}})).status,502);const b=await fixture(t,async()=>{throw Error('private detail');});const r=await fetch(b.url+'/auth/v1/user',{headers:{Origin:LOCAL_FRONTEND}});assert.equal(r.status,502);assert.deepEqual(await r.json(),{error:'AWS_CONNECTION_UNAVAILABLE'});});


test('Supabase SDK password login forwards UTF-8 JSON using the canonical AWS media type',async t=>{
 const {createClient}=await import('@supabase/supabase-js');
 const calls=[];
 const server=createAwsLocalProxy({allow:async(path,method)=>{assert.equal(path,'/auth/v1/token?grant_type=password');assert.equal(method,'POST');},upstream:async(...args)=>{calls.push(args);return {status:400,headers:{'content-type':'application/json'},body:Buffer.from(JSON.stringify({error_code:'invalid_credentials',msg:'Invalid login credentials'}))};}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>{server.closeAllConnections();server.close(r);}));
 const url='http://127.0.0.1:'+server.address().port;
 const client=createClient(url,'synthetic-public-key',{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:(input,init)=>fetch(input,{...init,headers:{...init.headers,Origin:LOCAL_FRONTEND}})}});
 const {error}=await client.auth.signInWithPassword({email:'synthetic@example.invalid',password:'synthetic-not-a-real-password'});
 assert.equal(calls.length,1);assert.equal(calls[0][2]['content-type'],'application/json');assert.equal(error?.code,'invalid_credentials');assert.equal(error?.status,400);
});

test('unsupported charset is rejected without forwarding',async t=>{
 let calls=0;const server=createAwsLocalProxy({allow:async()=>{},upstream:async()=>{calls++;throw Error('must not reach AWS');}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>{server.closeAllConnections();server.close(r);}));
 const r=await fetch('http://127.0.0.1:'+server.address().port+'/auth/v1/token?grant_type=password',{method:'POST',headers:{Origin:LOCAL_FRONTEND,'Content-Type':'application/json;charset=ISO-8859-1'},body:'{}'});
 assert.equal(r.status,415);assert.equal(calls,0);
});


test('permits the reviewed password-update PUT and preflight without broadening other methods',async t=>{
 const calls=[];const server=createAwsLocalProxy({allow:async(path,method)=>{if(path!=='/auth/v1/user'||method!=='PUT')throw Error('denied');},upstream:async(...args)=>{calls.push(args);return {status:401,headers:{'content-type':'application/json'},body:Buffer.from('{}')};}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>{server.closeAllConnections();server.close(r);}));const url='http://127.0.0.1:'+server.address().port;
 const pre=await fetch(url+'/auth/v1/user',{method:'OPTIONS',headers:{Origin:LOCAL_FRONTEND,'Access-Control-Request-Method':'PUT','Access-Control-Request-Headers':'authorization,apikey,content-type'}});assert.equal(pre.status,204);assert.equal(pre.headers.get('access-control-allow-methods'),'PUT');assert.equal(calls.length,0);
 const body=JSON.stringify({password:'synthetic-proxy-only'});const response=await fetch(url+'/auth/v1/user',{method:'PUT',headers:{Origin:LOCAL_FRONTEND,'Content-Type':'application/json',Authorization:'Bearer synthetic',apikey:'synthetic-public'},body});assert.equal(response.status,401);assert.equal(calls.length,1);assert.equal(calls[0][1],'PUT');assert.equal(calls[0][3].toString(),body);
});
test('denies PUT to other paths even when the injected policy is permissive',async t=>{
 let count=0;const server=createAwsLocalProxy({allow:async()=>{},upstream:async()=>{count++;throw Error('must not forward');}});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>{server.closeAllConnections();server.close(r);}));const url='http://127.0.0.1:'+server.address().port;
 assert.equal((await fetch(url+'/rest/v1/profiles',{method:'PUT',headers:{Origin:LOCAL_FRONTEND}})).status,404);
 assert.equal((await fetch(url+'/auth/v1/user',{method:'PATCH',headers:{Origin:LOCAL_FRONTEND}})).status,404);
 assert.equal(count,0);
});

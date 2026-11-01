import {afterEach,describe,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import ts from 'typescript';
import {CAPTION_MODEL,CaptionProviderError,completeReplicateCaption} from '../../../supabase/functions/_shared/replicateCaption';
const text='CAPTION: Ein Test\nHASHTAGS: #test #content #marketing';
afterEach(()=>vi.unstubAllGlobals());
describe('direct Replicate caption adapter',()=>{
 it('preserves prompt/system language and bounds output tokens on the same model',async()=>{
  const run=vi.fn().mockResolvedValue(text);
  expect(await completeReplicateCaption(run,'User prompt','Schreibe IMMER auf Deutsch.')).toBe(text);
  expect(run).toHaveBeenCalledExactlyOnceWith(CAPTION_MODEL,{input:{prompt:'User prompt',system_instruction:'Schreibe IMMER auf Deutsch.',max_output_tokens:2048}});
 });
 it('joins ordered text chunks without inserting or dropping separators',async()=>{
  expect(await completeReplicateCaption(vi.fn().mockResolvedValue(['CAPTION: ','Test','\nHASHTAGS: #test']),'p','s')).toBe('CAPTION: Test\nHASHTAGS: #test');
 });
 it.each([null,{},[],['ok',null],'','  ','x'.repeat(32769)])('rejects empty/malformed/oversized outputs (%#)',async output=>{
  await expect(completeReplicateCaption(vi.fn().mockResolvedValue(output),'p','s')).rejects.toBeInstanceOf(CaptionProviderError);
 });
 it.each([402,429,500])('maps provider status %s without leaking logs, credentials or replaying a prediction',async status=>{
  const run=vi.fn().mockRejectedValue({response:{status},message:'PRIVATE_TOKEN AND PROMPT'});
  try {await completeReplicateCaption(run,'p','s');throw Error('Expected failure');}catch(error){
   expect(error).toBeInstanceOf(CaptionProviderError);expect((error as CaptionProviderError).status).toBe(status===500?503:status);
   expect(String(error)).not.toContain('PRIVATE_TOKEN');expect(run).toHaveBeenCalledTimes(1);
  }
 });
});

function load(source:string,deps:Record<string,unknown>,env:(name:string)=>string|undefined){
 const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
 const module={exports:{}};
 new Function('require','module','exports','Deno',code)((name:string)=>{if(!(name in deps))throw Error('Unmocked dependency '+name);return deps[name];},module,module.exports,{env:{get:env}});
 return module.exports as any;
}
const root=resolve(process.cwd(),'supabase/functions');
function cacheFixture(exact:unknown=null){
 const rows:Record<string,unknown[]>={};
 const client={from:(table:string)=>{
  const q:any={};for(const name of ['select','eq','gt'])q[name]=()=>q;
  q.maybeSingle=async()=>({data:exact});q.update=()=>q;q.then=(done:()=>void)=>Promise.resolve().then(done);
  q.insert=async(row:unknown)=>{(rows[table]??=[]).push(row);return {error:null};};return q;
 }};
 const env=vi.fn((name:string)=>name==='LOVABLE_API_KEY'?'must-not-be-used':'synthetic');
 const fetch=vi.fn().mockRejectedValue(Error('Embedding network not allowed'));vi.stubGlobal('fetch',fetch);
 const api=load(readFileSync(resolve(root,'_shared/ai-semantic-cache.ts'),'utf8'),{'npm:@supabase/supabase-js@2':{createClient:()=>client}},env);
 return {api,env,fetch,rows};
}
it('caption exact-cache misses make no embedding requests even if a legacy key exists',async()=>{
 const f=cacheFixture();expect(await f.api.lookupAiCache({endpoint:'generate-caption',promptText:'Test',language:'de',semantic:false})).toEqual({hit:false,data:null});
 expect(f.fetch).not.toHaveBeenCalled();expect(f.env).not.toHaveBeenCalledWith('LOVABLE_API_KEY');
});
it('exact cache hits remain usable without provider credentials',async()=>{
 const f=cacheFixture({id:'cache-id',response_data:{caption:'Cached',hashtags:['#cached']}});
 expect((await f.api.lookupAiCache({endpoint:'generate-caption',promptText:'Test',semantic:false})).data.caption).toBe('Cached');expect(f.fetch).not.toHaveBeenCalled();
});
it('caption cache writes preserve history payload with a null embedding and no network',async()=>{
 const f=cacheFixture();await f.api.storeAiCache({endpoint:'generate-caption',promptText:'Test',language:'de',model:CAPTION_MODEL,semantic:false},{caption:'Caption'});
 expect(f.rows.ai_response_cache).toHaveLength(1);expect(f.rows.ai_response_cache[0]).toMatchObject({model:CAPTION_MODEL,prompt_embedding:null,response_data:{caption:'Caption'},language:'de'});expect(f.fetch).not.toHaveBeenCalled();
});

function handlerFixture({user=true,key=true,cached=false,status=200}:{user?:boolean;key?:boolean;cached?:boolean;status?:number}={}){
 let handler:(r:Request)=>Promise<Response>;
 const run=vi.fn().mockImplementation(async()=>{if(status!==200)throw {response:{status}};return text;});
 const inserts:unknown[]=[];const cache={lookupAiCache:vi.fn().mockResolvedValue({hit:cached,data:cached?{caption:'Cached',hashtags:['#test']}:null}),storeAiCache:vi.fn().mockResolvedValue(undefined)};
 const client={from:(table:string)=>{const q:any={select:()=>q,eq:()=>q,single:async()=>({data:{value_json:table==='settings'?{}:null}}),insert:async(row:unknown)=>{inserts.push({table,row});return {error:null};}};return q;}};
 const error=(s:number)=>()=>new Response(JSON.stringify({error:'request failed'}),{status:s});
 const schema:any=new Proxy(()=>schema,{get:(_t,name)=>name==='safeParse'?(body:unknown)=>({success:true,data:body}):()=>schema});
 load(readFileSync(resolve(root,'generate-caption/index.ts'),'utf8'),{
  'https://deno.land/std@0.224.0/http/server.ts':{serve:(h:typeof handler)=>{handler=h;}},
  'npm:replicate@0.25.2':class Replicate{run=run;},
  '../_shared/replicateCaption.ts':{completeReplicateCaption,CaptionProviderError,CAPTION_MODEL},
  '../_shared/db-client.ts':{getSupabaseClient:()=>client},
  'npm:@supabase/supabase-js@2':{createClient:()=>({auth:{getUser:async()=>({data:{user:user?{id:'actor'}:null},error:null})}})},
  'https://deno.land/x/zod@v3.22.4/mod.ts':{z:schema},
  '../_shared/errorHandler.ts':{ErrorResponses:{authentication:error(401),validation:error(400),rateLimit:error(429),paymentRequired:error(402),serviceUnavailable:error(503),internal:error(500)}},
  '../_shared/telemetry.ts':{withTelemetry:(_name:string,h:typeof handler)=>h},
  '../_shared/ai-semantic-cache.ts':cache,
  '../_shared/qaMock.ts':{isQaMockRequest:()=>false},
 },name=>name==='REPLICATE_API_KEY'?(key?'synthetic-replicate':undefined):'synthetic');
 return {handler:handler!,run,inserts,cache};
}
const request=()=>new Request('https://api-prod.useadtool.ai/functions/v1/generate-caption',{method:'POST',headers:{Authorization:'Bearer synthetic','Content-Type':'application/json'},body:JSON.stringify({topic:'Test topic',tone:'friendly',platform:'instagram',language:'de'})});
it('caption handler rejects an invalid session before any prediction or history write',async()=>{
 const f=handlerFixture({user:false});expect((await f.handler(request())).status).toBe(401);expect(f.run).not.toHaveBeenCalled();expect(f.inserts).toEqual([]);
});
it('caption handler preserves parsed captions, language and user history through Replicate',async()=>{
 const f=handlerFixture();const response=await f.handler(request());expect(response.status).toBe(200);expect((await response.json()).caption).toBe('Ein Test');
 expect(f.inserts).toContainEqual({table:'captions',row:expect.objectContaining({user_id:'actor',language:'de',topic:'Test topic',caption_text:'Ein Test'})});
 expect(f.cache.lookupAiCache).toHaveBeenCalledWith(expect.objectContaining({semantic:false,language:'de'}));expect(f.cache.storeAiCache.mock.calls[0][0]).toMatchObject({semantic:false,model:CAPTION_MODEL});expect(f.run).toHaveBeenCalledTimes(1);
});
it('caption cache hits persist user history without a provider key or prediction',async()=>{
 const f=handlerFixture({key:false,cached:true});expect((await f.handler(request())).status).toBe(200);expect(f.run).not.toHaveBeenCalled();expect(f.inserts).toHaveLength(1);
});
it('caption cache misses fail closed when the Replicate key is absent',async()=>{
 const f=handlerFixture({key:false});expect((await f.handler(request())).status).toBe(503);expect(f.run).not.toHaveBeenCalled();expect(f.inserts).toEqual([]);
});
it.each([402,429,500])('caption provider failure %s does not save a fabricated caption',async status=>{
 const f=handlerFixture({status});expect((await f.handler(request())).status).toBe(status===500?503:status);expect(f.inserts).toEqual([]);expect(f.cache.storeAiCache).not.toHaveBeenCalled();
});

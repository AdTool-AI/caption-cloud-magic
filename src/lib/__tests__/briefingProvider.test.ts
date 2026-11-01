import {afterEach,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import ts from 'typescript';
import {getBriefingProvider,callBriefingGateway,callBriefingRepair,readToolCallArguments,GatewayError} from '../../../supabase/functions/_shared/briefing/models';
afterEach(()=>vi.unstubAllGlobals());
function fixture(overrides:Record<string,string|undefined>={}) {
 const values:Record<string,string|undefined>={BRIEFING_API_BASE_URL:'https://briefing.example.invalid/v1',BRIEFING_API_KEY:'synthetic-owned-key',BRIEFING_MODEL:'owned-primary',...overrides};
 const env=vi.fn((key:string)=>values[key]);vi.stubGlobal('Deno',{env:{get:env}});
 const fetch=vi.fn().mockResolvedValue(new Response('{}'));vi.stubGlobal('fetch',fetch);return {env,fetch};
}
it('preserves structured extraction body while using only server-owned provider settings',async()=>{
 const f=fixture();const tools=[{type:'function',function:{name:'emit',parameters:{type:'object'}}}];
 const result=await callBriefingGateway(model=>({model:'must-not-select-other-model',messages:[{role:'user',content:'briefing'}],tools,tool_choice:{type:'function',function:{name:'emit'}},max_tokens:8000}));
 expect(result.model).toBe('owned-primary');expect(result.attempt).toBe(1);expect(f.fetch).toHaveBeenCalledTimes(1);
 const [url,options]=f.fetch.mock.calls[0] as any;expect(url).toBe('https://briefing.example.invalid/v1/chat/completions');expect(options.redirect).toBe('error');expect(options.headers.Authorization).toBe('Bearer synthetic-owned-key');expect(JSON.parse(options.body)).toMatchObject({model:'owned-primary',tools,max_tokens:8000});expect(f.env).not.toHaveBeenCalledWith('LOVABLE_API_KEY');
});
it.each(['BRIEFING_API_BASE_URL','BRIEFING_API_KEY','BRIEFING_MODEL'])('missing %s fails closed without provider traffic',async key=>{
 const f=fixture({[key]:undefined});await expect(callBriefingGateway(model=>({model}))).rejects.toMatchObject({status:503});expect(f.fetch).not.toHaveBeenCalled();
});
it.each(['https://ai.gateway.lovable.dev/v1','https://connector-gateway.lovable.dev/v1','https://preview.lovable.app/v1','https://legacy.supabase.co/v1','http://briefing.example.invalid/v1','https://key@briefing.example.invalid/v1','https://briefing.example.invalid/v1?key=secret'])('rejects unsafe or legacy endpoint %s',async base=>{
 const f=fixture({BRIEFING_API_BASE_URL:base});expect(()=>getBriefingProvider()).toThrow(GatewayError);expect(f.fetch).not.toHaveBeenCalled();
});
it.each([400,401,402,403,408,425,429,500,502,503,504])('HTTP %s does not trigger a hidden retry or expose the response body',async status=>{
 const f=fixture();f.fetch.mockResolvedValue(new Response('PRIVATE_PROVIDER_BODY',{status}));
 try{await callBriefingGateway(model=>({model}));throw Error('Expected failure');}catch(error){expect(error).toBeInstanceOf(GatewayError);expect((error as GatewayError).status).toBe(status===402||status===429?status:503);expect((error as GatewayError).body).toBe('');expect(String(error)).not.toContain('PRIVATE_PROVIDER_BODY');}
 expect(f.fetch).toHaveBeenCalledTimes(1);
});
it('an uncertain network failure is not retried',async()=>{
 const f=fixture();f.fetch.mockRejectedValue(Error('PRIVATE_TOKEN_AND_PROMPT'));await expect(callBriefingGateway(model=>({model}))).rejects.toMatchObject({status:503,retryable:false,body:''});expect(f.fetch).toHaveBeenCalledTimes(1);
});
it('repair uses only its explicitly configured model and one request',async()=>{
 const f=fixture({BRIEFING_REPAIR_MODEL:'owned-repair'});expect((await callBriefingRepair(model=>({model}))).model).toBe('owned-repair');expect(f.fetch).toHaveBeenCalledTimes(1);
});
it('repair defaults to the configured primary rather than another provider/model',async()=>{
 fixture();expect((await callBriefingRepair(model=>({model}))).model).toBe('owned-primary');
});
it.each([null,[],42,'bad'])('rejects invalid request body %# without any provider call',async body=>{
 const f=fixture();await expect(callBriefingGateway(()=>body)).rejects.toMatchObject({status:400});expect(f.fetch).not.toHaveBeenCalled();
});
it.each([null,{},[],{choices:[{message:{tool_calls:[{function:{arguments:'[]'}}]}}]},{choices:[{message:{tool_calls:[{function:{arguments:'null'}}]}}]},{choices:[{message:{tool_calls:[{function:{arguments:'not-json'}}]}}]}])('rejects missing or malformed structured output %#',value=>{
 expect(()=>readToolCallArguments(value)).toThrow(GatewayError);
});
it('decodes an object without claiming schema validity',()=>{
 expect(readToolCallArguments({choices:[{message:{tool_calls:[{function:{arguments:'{"scenes":[]}'}}]}}]})).toEqual({scenes:[]});
});
function manifestFixture(repairValid=true) {
 const parse=vi.fn().mockReturnValueOnce({success:false,error:{issues:[{path:['scenes'],message:'invalid'}]}}).mockReturnValue({success:repairValid,...(repairValid?{data:{scenes:['validated']}}:{error:{issues:[{path:['scenes'],message:'still invalid'}]}})});
 const bodies:any[]=[];
 const response=()=>new Response(JSON.stringify({choices:[{message:{tool_calls:[{function:{arguments:'{"scenes":[]}'}}]}}]}));
 const first=vi.fn(async(build:(m:string)=>unknown)=>{bodies.push(build('owned-primary'));return {response:response(),model:'owned-primary'};});
 const repair=vi.fn(async(build:(m:string)=>unknown)=>{bodies.push(build('owned-repair'));return {response:response(),model:'owned-repair'};});
 const deps:Record<string,unknown>={'https://esm.sh/@supabase/supabase-js@2':{createClient:vi.fn()},'./manifestSchema.ts':{BriefingManifest:{safeParse:parse},BRIEFING_TOOL_PARAMETERS:{}},'./models.ts':{callBriefingGateway:first,callBriefingRepair:repair,readToolCallArguments},'./errors.ts':{}};
 const source=readFileSync(resolve('supabase/functions/_shared/briefing/manifest.ts'),'utf8');const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const module={exports:{}};new Function('require','module','exports','Deno',code)((name:string)=>{if(!(name in deps))throw Error('Unexpected dependency');return deps[name];},module,module.exports,{env:{get:()=> 'synthetic'}});
 return {api:module.exports as any,first,repair,parse,bodies};
}
it('manifest validation allows exactly one explicit repair and preserves the original briefing',async()=>{
 const f=manifestFixture();expect(await f.api.analyzeFreeformBriefing('ORIGINAL_BRIEFING')).toEqual({manifest:{scenes:['validated']},model:'owned-repair',repaired:true});expect(f.first).toHaveBeenCalledTimes(1);expect(f.repair).toHaveBeenCalledTimes(1);expect(JSON.stringify(f.bodies[1])).toContain('ORIGINAL_BRIEFING');expect(JSON.stringify(f.bodies[1])).toContain('invalid');
});
it('invalid repaired manifest returns 422 instead of retrying indefinitely or fabricating a plan',async()=>{
 const f=manifestFixture(false);await expect(f.api.analyzeFreeformBriefing('ORIGINAL_BRIEFING')).rejects.toMatchObject({status:422});expect(f.repair).toHaveBeenCalledTimes(1);
});

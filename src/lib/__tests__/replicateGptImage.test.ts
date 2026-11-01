import {afterEach,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import ts from 'typescript';
import {buildReplicateGptImageInput,REPLICATE_GPT_IMAGE_MODEL} from '../../../supabase/functions/_shared/replicateGptImage';
import * as capabilities from '../../../supabase/functions/_shared/pictureModelCapabilities';
import * as promptBuilder from '../../../supabase/functions/_shared/picturePromptBuilder';
import * as privateMedia from '../../../supabase/functions/_shared/privateMedia';
import {SOURCE_FORMAT} from '../../../supabase/functions/_shared/pictureFormatResolution';
afterEach(()=>vi.unstubAllGlobals());
it('uses the verified Replicate version, one image, and the existing low quality setting',()=>{
 expect(REPLICATE_GPT_IMAGE_MODEL).toBe('openai/gpt-image-2:209a275610f9165a0424dc04027edfc230cb9bd463d7fabc0b99d1a5e498319e');
 expect(buildReplicateGptImageInput('Create this','3:2',[],false)).toEqual({prompt:'Create this',aspect_ratio:'3:2',quality:'low',number_of_images:1,background:'opaque',output_format:'jpeg'});
});
it('preserves reference order and real transparency without sending an OpenAI credential',()=>{
 const refs=['https://api-prod.useadtool.ai/storage/v1/object/sign/media-assets/a/one.png?token=synthetic','https://example.com/two.png'];
 const value=buildReplicateGptImageInput('Combine','1:1',refs,true);
 expect(value).toMatchObject({input_images:refs,background:'transparent',output_format:'png'});expect('openai_api_key' in value).toBe(false);
 refs.push('https://example.com/three.png');expect(value.input_images).toHaveLength(2);
});
it.each(['16:9','1024x1024','auto',''])('rejects unsupported ratio %s',ratio=>{
 expect(()=>buildReplicateGptImageInput('Prompt',ratio,[],false)).toThrow('INVALID_GPT_IMAGE_INPUT');
});
it('rejects empty prompts and excessive reference counts',()=>{
 expect(()=>buildReplicateGptImageInput(' ','1:1',[],false)).toThrow();expect(()=>buildReplicateGptImageInput('Prompt','1:1',Array(5).fill('https://example.com/ref.png'),false)).toThrow();
});
it.each(['http://internal/ref.png','file:///etc/passwd','data:image/png;base64,x','https://user:pass@example.com/a.png','https://example.com/a.png#fragment'])('rejects unreviewed reference URL %s',url=>{
 expect(()=>buildReplicateGptImageInput('Prompt','1:1',[url],false)).toThrow('INVALID_GPT_IMAGE_REFERENCE');
});
it('reports native ratio controls and the correct reference field to both frontend and backend',()=>{
 expect(capabilities.capabilityFor('gptimage')).toMatchObject({provider:'replicate',references:{field:'input_images'},sizing:{kind:'ratio'}});
 expect(capabilities.resolveSize('gptimage','16:9',{width:2048,height:2048})).toEqual({aspectRatio:'3:2'});
});

function fixture({user=true,premium=true,balance=1,key=true,providerFails=false,deductFails=false,signFails=false}:{user?:boolean;premium?:boolean;balance?:number;key?:boolean;providerFails?:boolean;deductFails?:boolean;signFails?:boolean}={}){
 let handler:(req:Request)=>Promise<Response>;
 const run=vi.fn().mockImplementation(async()=>{if(providerFails)throw Error('Synthetic provider failed');return ['https://replicate.delivery/synthetic/image.png'];});
 const upload=vi.fn().mockResolvedValue({error:null});const rpc=vi.fn().mockResolvedValue(deductFails?{data:null,error:{message:'private deduction error'}}:{data:0.92,error:null});
 const persist=vi.fn().mockResolvedValue({ok:true,id:'persisted-id'});const from=vi.fn(()=>({select:()=>({eq:()=>({single:async()=>({data:{balance_euros:balance,currency:'EUR'},error:null})})})}));
 const client={auth:{getUser:async()=>({data:{user:user?{id:'00000000-0000-4000-8000-000000000001'}:null},error:null})},from,rpc,storage:{from:(bucket:string)=>({upload,createSignedUrl:async(path:string)=>signFails?{data:null,error:{message:'private signing error'}}:{data:{signedUrl:'http://api-gw:8000/storage/v1/object/sign/'+bucket+'/'+path+'?token=synthetic-preview'},error:null}})}};
 const fetch=vi.fn().mockResolvedValue(new Response(new Uint8Array([1,2,3]),{headers:{'Content-Type':'image/png'}}));vi.stubGlobal('fetch',fetch);
 const deps:Record<string,unknown>={
  'https://deno.land/std@0.224.0/http/server.ts':{serve:(fn:typeof handler)=>{handler=fn;}},
  'npm:@supabase/supabase-js@2':{createClient:()=>client},'npm:replicate@0.25.2':class Replicate{run=run;},
  '../_shared/replicateGptImage.ts':{buildReplicateGptImageInput,REPLICATE_GPT_IMAGE_MODEL},'../_shared/privateMedia.ts':privateMedia,
  '../_shared/qaMock.ts':{isQaMockRequest:()=>false},'../_shared/pictureModelCapabilities.ts':capabilities,
  '../_shared/imageDimensions.ts':{readImageDimensions:async()=>null},
  '../_shared/picture-studio-premium.ts':{PICTURE_FALLBACK_TIER:'fast',PICTURE_SPECIALIST_PREMIUM_REQUIRED:'PREMIUM_REQUIRED',isPictureStudioPremiumEntitled:async()=>premium,isSpecialistTier:(tier:string)=>['fast','pro','ultra','flux'].includes(tier)},
  '../_shared/pictureFormatResolution.ts':{SOURCE_FORMAT},'../_shared/studio-image-persist.ts':{persistStudioImage:persist},'../_shared/picturePromptBuilder.ts':promptBuilder,
 };
 const source=readFileSync(resolve(process.cwd(),'supabase/functions/generate-image-replicate/index.ts'),'utf8');
 const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;const module={exports:{}};
 new Function('require','module','exports','Deno',code)((name:string)=>{if(!(name in deps))throw Error('Unexpected import '+name);return deps[name];},module,module.exports,{env:{get:(name:string)=>name==='REPLICATE_API_KEY'?(key?'synthetic-replicate':undefined):name==='PUBLIC_API_URL'?'https://api-prod.useadtool.ai':'synthetic'}});
 return {handler:handler!,run,upload,rpc,persist,fetch,from};
}
function req(extra:Record<string,unknown>={}){return new Request('https://api-prod.useadtool.ai/functions/v1/generate-image-replicate',{method:'POST',headers:{Authorization:'Bearer synthetic','Content-Type':'application/json'},body:JSON.stringify({prompt:'A clear product image',tier:'gptimage',aspectRatio:'1:1',style:'none',...extra})});}
it('image handler requires real user authentication before predictions or persistence',async()=>{
 const f=fixture({user:false});expect((await f.handler(req())).status).toBe(401);expect(f.run).not.toHaveBeenCalled();expect(f.rpc).not.toHaveBeenCalled();expect(f.upload).not.toHaveBeenCalled();
});
it('specialist subscription gate still runs before wallet access and provider dispatch',async()=>{
 const f=fixture({premium:false});expect((await f.handler(req({tier:'fast'}))).status).toBe(403);expect(f.from).not.toHaveBeenCalled();expect(f.run).not.toHaveBeenCalled();expect(f.rpc).not.toHaveBeenCalled();
});
it('insufficient wallet balance cannot create a prediction or modify persistence',async()=>{
 const f=fixture({balance:0});expect((await f.handler(req())).status).toBe(402);expect(f.run).not.toHaveBeenCalled();expect(f.rpc).not.toHaveBeenCalled();expect(f.persist).not.toHaveBeenCalled();
});
it('missing Replicate configuration does not fall back to the old gateway',async()=>{
 const f=fixture({key:false});expect((await f.handler(req())).status).toBe(500);expect(f.run).not.toHaveBeenCalled();expect(f.fetch).not.toHaveBeenCalled();
});
it('create uses Replicate once and preserves persistence and the existing deduction RPC',async()=>{
 const f=fixture();const response=await f.handler(req());expect(response.status).toBe(200);expect(f.run).toHaveBeenCalledTimes(1);
 expect(f.run.mock.calls[0][0]).toBe(REPLICATE_GPT_IMAGE_MODEL);expect(f.run.mock.calls[0][1].input).toMatchObject({aspect_ratio:'1:1',quality:'low',number_of_images:1,output_format:'jpeg'});
 expect(f.fetch).toHaveBeenCalledExactlyOnceWith('https://replicate.delivery/synthetic/image.png');expect(f.persist).toHaveBeenCalledTimes(1);
 expect(f.rpc).toHaveBeenCalledExactlyOnceWith('deduct_ai_video_credits',{p_user_id:'00000000-0000-4000-8000-000000000001',p_amount:0.08,p_generation_id:'persisted-id'});
 expect(f.rpc.mock.invocationCallOrder[0]).toBeGreaterThan(f.persist.mock.invocationCallOrder[0]);
});
it('reference edits and transparent outputs use the same Replicate route without gateway image uploads',async()=>{
 const f=fixture();const reference='https://api-prod.useadtool.ai/storage/v1/object/sign/media-assets/actor/ref.png?token=synthetic';
 expect((await f.handler(req({mode:'transform',referenceImageUrls:[reference],transparentBackground:true}))).status).toBe(200);
 expect(f.run.mock.calls[0][1].input).toMatchObject({input_images:[reference],background:'transparent',output_format:'png'});
 expect(f.fetch).toHaveBeenCalledTimes(1);expect(f.upload.mock.calls[0][2]).toMatchObject({contentType:'image/png'});
});
it('provider failure does not persist or deduct a successful image charge',async()=>{
 const f=fixture({providerFails:true});expect((await f.handler(req())).status).toBe(500);expect(f.run).toHaveBeenCalledTimes(1);expect(f.persist).not.toHaveBeenCalled();expect(f.rpc).not.toHaveBeenCalled();expect(f.upload).not.toHaveBeenCalled();
});

it('GPT Image keeps its existing free-tier entitlement while still requiring wallet credit',async()=>{const f=fixture({premium:false});expect((await f.handler(req())).status).toBe(200);expect(f.run).toHaveBeenCalledTimes(1);});

it('persists a private reference and returns a separate expiring preview',async()=>{
 const f=fixture();const response=await f.handler(req());const value=await response.json();expect(response.status).toBe(200);
 const row=f.persist.mock.calls[0][1];expect(row.image_url).toContain('/object/authenticated/background-projects/');expect(row.image_url).not.toContain('token=');expect(row.metadata_json.storageBucket).toBe('background-projects');
 expect(value.image.url).toContain('https://api-prod.useadtool.ai/storage/v1/object/sign/');expect(value.image.previewExpiresIn).toBe(900);expect(value.image.storageReference).toBe(row.image_url);
});
it('does not claim successful payment when the existing deduction RPC fails',async()=>{
 const f=fixture({deductFails:true});const response=await f.handler(req());const value=await response.json();expect(response.status).toBe(503);expect(value.code).toBe('ASSET_CHARGE_REVIEW_REQUIRED');expect(value.assetId).toBe('persisted-id');expect(value.success).toBeUndefined();expect(JSON.stringify(value)).not.toContain('private deduction');expect(f.run).toHaveBeenCalledTimes(1);
});
it('preview failure keeps the persisted asset and does not submit another prediction',async()=>{
 const f=fixture({signFails:true});const response=await f.handler(req());const value=await response.json();expect(response.status).toBe(503);expect(value.code).toBe('ASSET_PREVIEW_UNAVAILABLE');expect(value.assetId).toBe('persisted-id');expect(f.persist).toHaveBeenCalledTimes(1);expect(f.run).toHaveBeenCalledTimes(1);expect(f.rpc).toHaveBeenCalledTimes(1);
});

import {afterEach,expect,it,vi} from 'vitest';
import {countFacesInImage,countHumansInImage} from '../../../supabase/functions/_shared/face-count';
afterEach(()=>vi.unstubAllGlobals());
function fixture(overrides:Record<string,string|undefined>={}) {
 const values:Record<string,string|undefined>={QA_API_BASE_URL:'https://vision.example.invalid/v1',QA_API_KEY:'synthetic-owned-key',QA_MODEL:'owned-vision-model',...overrides};
 const env=vi.fn((key:string)=>values[key]);vi.stubGlobal('Deno',{env:{get:env}});
 const fetch=vi.fn().mockResolvedValue(new Response(JSON.stringify({choices:[{message:{content:'{"faces":2,"humans":3}'}}]})));vi.stubGlobal('fetch',fetch);return {env,fetch};
}
it.each([['faces',countFacesInImage,2],['humans',countHumansInImage,3]] as const)('counts %s through owned settings without forwarding the caller key',async(_field,call,expected)=>{
 const f=fixture();expect(await call('https://media.example.invalid/image.png','must-not-forward')).toBe(expected);
 const [url,options]=f.fetch.mock.calls[0] as any;expect(url).toBe('https://vision.example.invalid/v1/chat/completions');expect(options.redirect).toBe('error');expect(options.headers.Authorization).toBe('Bearer synthetic-owned-key');expect(JSON.parse(options.body).model).toBe('owned-vision-model');expect(JSON.stringify(f.fetch.mock.calls)).not.toContain('must-not-forward');expect(f.fetch).toHaveBeenCalledTimes(1);expect(f.env).not.toHaveBeenCalledWith('LOVABLE_API_KEY');
});
it.each(['QA_API_BASE_URL','QA_API_KEY','QA_MODEL'])('missing %s produces unknown and no provider call',async key=>{
 const f=fixture({[key]:undefined});expect(await countFacesInImage('image','legacy')).toBeNull();expect(await countHumansInImage('image','legacy')).toBeNull();expect(f.fetch).not.toHaveBeenCalled();
});
it.each(['https://ai.gateway.lovable.dev/v1','https://preview.lovable.app/v1','https://legacy.supabase.co/v1','http://vision.example.invalid/v1','https://key@vision.example.invalid/v1','https://vision.example.invalid/v1?key=secret'])('blocks unsafe provider configuration %s',async base=>{
 const f=fixture({QA_API_BASE_URL:base});expect(await countFacesInImage('image','legacy')).toBeNull();expect(f.fetch).not.toHaveBeenCalled();
});
it.each([null,'2',[],{},-1,1.5])('invalid numeric reply %# is unknown rather than coerced to a passing count',async value=>{
 const f=fixture();f.fetch.mockResolvedValue(new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({faces:value})}}]})));expect(await countFacesInImage('image','legacy')).toBeNull();
});
it('accepts a genuine numeric zero',async()=>{
 const f=fixture();f.fetch.mockResolvedValue(new Response(JSON.stringify({choices:[{message:{content:'{"faces":0}'}}]})));expect(await countFacesInImage('image','legacy')).toBe(0);
});
it('does not attempt a video as an image',async()=>{
 const f=fixture();expect(await countFacesInImage('video','legacy',{kind:'video'})).toBeNull();expect(f.fetch).not.toHaveBeenCalled();
});
it('does not retry provider errors or disclose their details',async()=>{
 const f=fixture();f.fetch.mockRejectedValue(Error('private provider detail'));expect(await countHumansInImage('image','legacy')).toBeNull();expect(f.fetch).toHaveBeenCalledTimes(1);
});
it('missing count fields are not zero',async()=>{
 const f=fixture();f.fetch.mockResolvedValue(new Response(JSON.stringify({choices:[{message:{content:'{}'}}]})));expect(await countFacesInImage('image','legacy')).toBeNull();
});

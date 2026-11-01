import {afterEach,expect,it,vi} from 'vitest';
import {runAmbientSpeechGate,ambientBedAllowed} from '../../../supabase/functions/_shared/ambient-audio';
afterEach(()=>vi.unstubAllGlobals());
function fixture(overrides: Record<string,string|undefined> = {}) {
 const values:Record<string,string|undefined>={AMBIENT_TRANSCRIPTION_BASE_URL:'https://speech.example.invalid/v1',AMBIENT_TRANSCRIPTION_API_KEY:'synthetic-owned-key',AMBIENT_TRANSCRIPTION_MODEL:'owned-speech-model',...overrides};
 const env=vi.fn((key:string)=>values[key]);vi.stubGlobal('Deno',{env:{get:env}});
 const fetch=vi.fn().mockResolvedValueOnce(new Response(new Uint8Array([1,2,3]))).mockResolvedValueOnce(new Response(JSON.stringify({text:''}),{headers:{'Content-Type':'application/json'}}));vi.stubGlobal('fetch',fetch);
 return {env,fetch};
}
it('uses an explicitly configured transcription provider and keeps the ambience volume gate',async()=>{
 const f=fixture();expect(await runAmbientSpeechGate('https://media.example.invalid/clip.mp4')).toMatchObject({allowed:true,reason:'no_speech'});
 expect(f.fetch).toHaveBeenCalledTimes(2);const [url,options]=f.fetch.mock.calls[1] as any;
 expect(url).toBe('https://speech.example.invalid/v1/audio/transcriptions');expect(options.redirect).toBe('error');expect(options.headers.Authorization).toBe('Bearer synthetic-owned-key');expect(options.body.get('model')).toBe('owned-speech-model');
 expect(f.env).not.toHaveBeenCalledWith('LOVABLE_API_KEY');expect(ambientBedAllowed({ambientGate:{status:'passed'}})).toBe(true);expect(ambientBedAllowed({})).toBe(false);
});
it.each(['AMBIENT_TRANSCRIPTION_BASE_URL','AMBIENT_TRANSCRIPTION_API_KEY','AMBIENT_TRANSCRIPTION_MODEL'])('missing %s leaves the clip muted without network',async key=>{
 const f=fixture({[key]:undefined});expect(await runAmbientSpeechGate('https://media.example.invalid/clip.mp4')).toEqual({allowed:false,reason:'not_configured'});expect(f.fetch).not.toHaveBeenCalled();
});
it.each(['https://ai.gateway.lovable.dev/v1','https://preview.lovable.app/v1','https://legacy.supabase.co/v1','http://speech.example.invalid/v1','https://key@speech.example.invalid/v1'])('blocks legacy or unsafe transcription endpoint %s',async base=>{
 const f=fixture({AMBIENT_TRANSCRIPTION_BASE_URL:base});expect((await runAmbientSpeechGate('https://media.example.invalid/clip.mp4')).allowed).toBe(false);expect(f.fetch).not.toHaveBeenCalled();
});
it.each([{},null,{text:42},{text:['hello']},'not json'])('missing or malformed transcription %# never proves silence',async value=>{
 const f=fixture();f.fetch.mockReset().mockResolvedValueOnce(new Response(new Uint8Array([1]))).mockResolvedValueOnce(new Response(typeof value==='string'?value:JSON.stringify(value)));
 expect(await runAmbientSpeechGate('https://media.example.invalid/clip.mp4')).toEqual({allowed:false,reason:'stt_failed'});
});
it('detected speech keeps ambience muted',async()=>{
 const f=fixture();f.fetch.mockReset().mockResolvedValueOnce(new Response(new Uint8Array([1]))).mockResolvedValueOnce(new Response(JSON.stringify({text:'Hello world'})));
 expect(await runAmbientSpeechGate('https://media.example.invalid/clip.mp4')).toMatchObject({allowed:false,reason:'speech_detected'});
});
it('a provider error keeps ambience muted without retry',async()=>{
 const f=fixture();f.fetch.mockReset().mockResolvedValueOnce(new Response(new Uint8Array([1]))).mockRejectedValueOnce(Error('private provider output'));
 expect(await runAmbientSpeechGate('https://media.example.invalid/clip.mp4')).toEqual({allowed:false,reason:'stt_failed'});expect(f.fetch).toHaveBeenCalledTimes(2);
});

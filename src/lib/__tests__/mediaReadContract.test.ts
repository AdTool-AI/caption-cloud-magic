import {expect,it,vi} from 'vitest';
import {isCanonicalMediaReadUri} from '../mediaReadContract';
import {createAwsValidationFetch} from '../awsValidationFetch';
const object='background-projects/10000000-0000-4000-8000-000000000001/generated/smoke.png';
const origin='https://api-prod.useadtool.ai';
it.each([['GET','/storage/v1/object/'+object],['GET','/storage/v1/object/authenticated/'+object],['POST','/storage/v1/object/sign/'+object],['GET','/storage/v1/object/sign/'+object+'?token=header.payload.signature']])('permits reviewed SDK media request %s %s',async(method,path)=>{
 expect(isCanonicalMediaReadUri(path,method)).toBe(true);const fetcher=vi.fn().mockResolvedValue(new Response('{}'));await createAwsValidationFetch(fetcher,origin)(origin+path,{method});expect(fetcher).toHaveBeenCalledOnce();
});
it.each([['POST','/storage/v1/object/'+object],['DELETE','/storage/v1/object/'+object],['POST','/storage/v1/object/list/background-projects'],['GET','/storage/v1/object/public/'+object],['POST','/functions/v1/generate-image-replicate'],['GET','/storage/v1/object/sign/'+object+'?token=x'],['GET','/storage/v1/object/sign/'+object+'?token=h.p.s&download=1'],['GET','/storage/v1/object/'+object+'?x=1'],['GET','/storage/v1/object/'+object.replace('background-projects','foreign-bucket')],['GET','/storage/v1/object/'+object.replace('generated/','%2f')]])('blocks unsupported media request %s %s',async(method,path)=>{
 expect(isCanonicalMediaReadUri(path,method)).toBe(false);const fetcher=vi.fn();await expect(createAwsValidationFetch(fetcher,origin)(origin+path,{method})).rejects.toThrow('scope');expect(fetcher).not.toHaveBeenCalled();
});

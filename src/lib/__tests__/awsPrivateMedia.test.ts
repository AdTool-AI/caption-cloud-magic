import {expect,it,vi} from 'vitest';
import {AWS_MEDIA_ORIGIN,MEDIA_PREVIEW_SECONDS,assertOwnedMediaPath,parsePrivateMediaReference,privateMediaReference,requireMediaOrigin,signOwnedMediaPreview} from '../../../supabase/functions/_shared/privateMedia';
import {readAwsMediaPreview} from '../awsMediaAccess';
const user='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002';
const path=user+'/picture-studio/image.png';const reference=AWS_MEDIA_ORIGIN+'/storage/v1/object/authenticated/background-projects/'+path;
function client(signedUrl='http://api-gw:8000/storage/v1/object/sign/background-projects/'+path+'?token=synthetic',error:unknown=null){
 const createSignedUrl=vi.fn().mockResolvedValue({data:signedUrl?{signedUrl}:null,error});const from=vi.fn(()=>({createSignedUrl}));return {storage:{from},createSignedUrl};
}
it('stores a stable private reference with no embedded preview token',()=>{
 expect(privateMediaReference(AWS_MEDIA_ORIGIN,'background-projects',path,user)).toBe(reference);expect(parsePrivateMediaReference(reference,user)).toEqual({bucket:'background-projects',path});expect(reference).not.toContain('token=');
});
it.each([undefined,'http://api-prod.useadtool.ai','http://api-gw:8000','https://legacy.supabase.co','https://api-prod.useadtool.ai/?token=x'])('rejects unreviewed media origin %s',origin=>{
 expect(()=>requireMediaOrigin(origin)).toThrow('MEDIA_PUBLIC_ORIGIN_REQUIRED');
});
it.each([other+'/image.png',user+'/../image.png',user+'//image.png',user+'/%2e%2e/image.png',user+'/image.png?token=x'])('rejects foreign/traversal/query paths %s',objectPath=>{
 expect(()=>assertOwnedMediaPath('background-projects',objectPath,user)).toThrow('MEDIA_REFERENCE_INVALID');
});
it('rejects unreviewed buckets, local IDs and public/external URL references before signing',async()=>{
 const f=client();
 for(const value of [reference.replace('authenticated','public'),reference.replace('api-prod.useadtool.ai','example.com'),reference+'?token=x',reference.replace(user,other)])await expect(readAwsMediaPreview(f,user,value)).rejects.toThrow('MEDIA_REFERENCE_INVALID');
 expect(()=>assertOwnedMediaPath('wallets',path,user)).toThrow();expect(()=>assertOwnedMediaPath('background-projects',path,'local')).toThrow();expect(f.createSignedUrl).not.toHaveBeenCalled();
});
it('rewrites internal SDK URLs to the public AWS origin with a bounded lifetime',async()=>{
 const f=client();expect(await signOwnedMediaPreview(f,AWS_MEDIA_ORIGIN,'background-projects',path,user)).toBe(AWS_MEDIA_ORIGIN+'/storage/v1/object/sign/background-projects/'+path+'?token=synthetic');
 expect(f.createSignedUrl).toHaveBeenCalledExactlyOnceWith(path,MEDIA_PREVIEW_SECONDS);expect(MEDIA_PREVIEW_SECONDS).toBe(900);
});
it.each(['http://api-gw:8000/storage/v1/object/sign/background-projects/other.png?token=x','https://example.com/wallets?token=x','http://api-gw:8000/storage/v1/object/sign/background-projects/'+path+'?token=x&token=y','http://api-gw:8000/storage/v1/object/sign/background-projects/'+path+'?token=x&redirect=evil'])('rejects substituted signed responses (%#)',async signed=>{
 await expect(signOwnedMediaPreview(client(signed),AWS_MEDIA_ORIGIN,'background-projects',path,user)).rejects.toThrow('MEDIA_PREVIEW_UNAVAILABLE');
});
it('fails closed on SDK denial and does not expose its error details',async()=>{
 await expect(signOwnedMediaPreview(client('',{message:'private database error'}),AWS_MEDIA_ORIGIN,'background-projects',path,user)).rejects.toThrow('MEDIA_PREVIEW_UNAVAILABLE');
});
it('renews a preview through the caller client on each request',async()=>{
 const f=client();await readAwsMediaPreview(f,user,reference);await readAwsMediaPreview(f,user,reference);expect(f.createSignedUrl).toHaveBeenCalledTimes(2);
});

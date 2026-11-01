/** Matches the accepted private Storage ingress (d1b2ba71); server JWT/RLS remains authoritative. */
const uuid='[a-fA-F0-9]{8}(?:-[a-fA-F0-9]{4}){3}-[a-fA-F0-9]{12}';
const segment='[A-Za-z0-9][A-Za-z0-9_.-]{0,127}';
const object='(?:media-assets|ai-videos|background-projects)/'+uuid+'/(?:'+segment+'/){0,3}'+segment;
const download=new RegExp('^/storage/v1/object/(?:authenticated/)?'+object+'$');
const sign=new RegExp('^/storage/v1/object/sign/'+object+'$');
const preview=new RegExp('^/storage/v1/object/sign/'+object+'\\?token=[A-Za-z0-9_-]{1,512}\\.[A-Za-z0-9_-]{1,1000}\\.[A-Za-z0-9_-]{1,256}$');
export function isCanonicalMediaReadUri(uri: string, method: string): boolean {
  return method==='GET' && (download.test(uri)||preview.test(uri)) || method==='POST' && sign.test(uri);
}

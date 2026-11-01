/** Stable private object references are persisted; expiring preview links are returned separately. */
export const AWS_MEDIA_ORIGIN = 'https://api-prod.useadtool.ai';
export const MEDIA_PREVIEW_SECONDS = 900;
export type PrivateMediaBucket = 'media-assets' | 'ai-videos' | 'background-projects';
const buckets = new Set<PrivateMediaBucket>(['media-assets','ai-videos','background-projects']);
export function requireMediaOrigin(value: string | undefined): string {
  let url: URL;
  try { url = new URL(value ?? ''); } catch { throw new Error('MEDIA_PUBLIC_ORIGIN_REQUIRED'); }
  if (url.origin !== AWS_MEDIA_ORIGIN || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('MEDIA_PUBLIC_ORIGIN_REQUIRED');
  return url.origin;
}
export function assertOwnedMediaPath(bucket: string, path: string, userId: string): asserts bucket is PrivateMediaBucket {
  if (!buckets.has(bucket as PrivateMediaBucket) || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(userId) || path.length > 1024) throw new Error('MEDIA_REFERENCE_INVALID');
  const segments = path.split('/');
  if (segments.length < 2 || segments[0] !== userId || segments.some(part => !/^[A-Za-z0-9._-]{1,255}$/.test(part) || part === '.' || part === '..')) throw new Error('MEDIA_REFERENCE_INVALID');
}
function objectPath(bucket: PrivateMediaBucket, path: string): string { return bucket+'/'+path.split('/').map(encodeURIComponent).join('/'); }
export function privateMediaReference(origin: string, bucket: string, path: string, userId: string): string {
  requireMediaOrigin(origin);assertOwnedMediaPath(bucket,path,userId);
  return origin+'/storage/v1/object/authenticated/'+objectPath(bucket,path);
}
export function parsePrivateMediaReference(reference: string, userId: string): {bucket: PrivateMediaBucket; path: string} {
  let url: URL;
  try { url = new URL(reference); } catch { throw new Error('MEDIA_REFERENCE_INVALID'); }
  const prefix='/storage/v1/object/authenticated/';
  if (url.origin !== AWS_MEDIA_ORIGIN || url.username || url.password || url.search || url.hash || !url.pathname.startsWith(prefix)) throw new Error('MEDIA_REFERENCE_INVALID');
  const parts=url.pathname.slice(prefix.length).split('/');const bucket=parts.shift()!;let path: string;
  try { path=parts.map(decodeURIComponent).join('/'); } catch { throw new Error('MEDIA_REFERENCE_INVALID'); }
  assertOwnedMediaPath(bucket,path,userId);
  if (privateMediaReference(AWS_MEDIA_ORIGIN,bucket,path,userId)!==reference) throw new Error('MEDIA_REFERENCE_INVALID');
  return {bucket,path};
}
export type MediaSigningClient = {storage: {from(bucket: string): {createSignedUrl(path: string, expiresIn: number): Promise<{data: {signedUrl: string} | null; error: unknown}>}}};
export async function signOwnedMediaPreview(client: MediaSigningClient, origin: string, bucket: string, path: string, userId: string): Promise<string> {
  requireMediaOrigin(origin);assertOwnedMediaPath(bucket,path,userId);
  const {data,error}=await client.storage.from(bucket).createSignedUrl(path,MEDIA_PREVIEW_SECONDS);
  if (error || !data?.signedUrl) throw new Error('MEDIA_PREVIEW_UNAVAILABLE');
  let url: URL;
  try { url=new URL(data.signedUrl,origin); } catch { throw new Error('MEDIA_PREVIEW_UNAVAILABLE'); }
  const expected='/storage/v1/object/sign/'+objectPath(bucket,path);
  if (!['http:','https:'].includes(url.protocol) || url.username || url.password || url.hash || url.pathname !== expected ||
      url.searchParams.getAll('token').length !== 1 || !url.searchParams.get('token') || [...url.searchParams.keys()].some(key=>key!=='token')) throw new Error('MEDIA_PREVIEW_UNAVAILABLE');
  // The Storage SDK may construct links from the internal SUPABASE_URL. Only the reviewed public origin is returned.
  return origin+expected+url.search;
}

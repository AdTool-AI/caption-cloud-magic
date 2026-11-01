import {AWS_MEDIA_ORIGIN,parsePrivateMediaReference,signOwnedMediaPreview,type MediaSigningClient} from '../../supabase/functions/_shared/privateMedia';
/** Use the signed-in caller's client; Storage RLS authorizes every signing request. No signed URL is persisted. */
export async function readAwsMediaPreview(client: MediaSigningClient, userId: string, reference: string): Promise<string> {
  const {bucket,path}=parsePrivateMediaReference(reference,userId);
  return signOwnedMediaPreview(client,AWS_MEDIA_ORIGIN,bucket,path,userId);
}

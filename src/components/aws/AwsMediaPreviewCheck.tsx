import {useEffect,useRef,useState} from 'react';
import {supabase} from '@/integrations/supabase/client';
import {readAwsMediaPreview} from '@/lib/awsMediaAccess';
import {parsePrivateMediaReference} from '../../../supabase/functions/_shared/privateMedia';
/** Connection check only: links remain in memory and are cleared on account change. */
export default function AwsMediaPreviewCheck({userId}:{userId:string}) {
  const [reference,setReference]=useState('');const [preview,setPreview]=useState('');
  const [message,setMessage]=useState('');const [busy,setBusy]=useState(false);const generation=useRef(0);
  useEffect(()=>{generation.current++;setReference('');setPreview('');setMessage('');setBusy(false);return ()=>{generation.current++;};},[userId]);
  async function load(event:React.FormEvent) {
    event.preventDefault();const request=++generation.current;setPreview('');setMessage('');setBusy(true);
    try {
      const value=reference.trim();const {bucket}=parsePrivateMediaReference(value,userId);
      if(bucket==='ai-videos')throw Error('IMAGE_REFERENCE_REQUIRED');
      const {data,error}=await supabase.auth.getUser();
      if(request!==generation.current)return;
      if(error||data.user?.id!==userId)throw Error('SESSION_CHANGED');
      const url=await readAwsMediaPreview(supabase,userId,value);
      if(request!==generation.current)return;
      setPreview(url);setMessage('Preview link ready. It expires in 15 minutes.');
    } catch {if(request===generation.current)setMessage('Image preview unavailable. Check the private image reference and the signed-in account.');}
    finally {if(request===generation.current)setBusy(false);}
  }
  return <section aria-label="Private image connection check" className="space-y-3 rounded border p-4">
    <h2 className="text-lg font-semibold">Private image preview</h2>
    <p>Open an image owned by your AWS account. This check does not upload files or generate content.</p>
    <form onSubmit={load} className="space-y-3">
      <label className="block">Private image reference<input type="url" maxLength={2048} required value={reference} disabled={busy} onChange={event=>{setReference(event.target.value);setPreview('');setMessage('');}} className="mt-1 block w-full rounded border bg-background p-2"/></label>
      <button disabled={busy||!reference.trim()} className="rounded border px-4 py-2">{busy?'Opening preview...':'Open private image'}</button>
    </form>
    {message&&<p role="status">{message}</p>}
    {preview&&<img src={preview} alt="Private AWS image preview" referrerPolicy="no-referrer" className="max-h-80 max-w-full rounded" onError={()=>{setPreview('');setMessage('Preview could not load. Renew the link and try again.');}}/>}
  </section>;
}

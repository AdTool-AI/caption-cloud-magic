import { useEffect, useRef, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { supabase, awsEmailCallback } from '@/integrations/supabase/client';
import { AWS_EMAIL_CALLBACK,validAwsRecoveryPassword } from '@/lib/awsEmailAuth';
import { updateAwsRecoveryPassword } from '@/lib/awsRecoveryPassword';
import { useAuth } from '@/hooks/useAuth';
import { tx } from '@/lib/i18nText';
import { Button } from '@/components/ui/button';
import { Card,CardContent,CardHeader,CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { BlackTieFooter } from '@/components/landing/BlackTieFooter';
function Frame({title,children}:{title:string;children:React.ReactNode}) {
 return <><main className="container mx-auto flex min-h-[65vh] max-w-lg items-center py-16"><Card className="w-full"><CardHeader><CardTitle>{title}</CardTitle></CardHeader><CardContent className="space-y-5">{children}</CardContent></Card></main><BlackTieFooter/></>;
}
export function AwsForgotPassword(){
 const [email,setEmail]=useState(''),[pending,setPending]=useState(false),[sent,setSent]=useState(false),[failed,setFailed]=useState(false);const lock=useRef(false);
 async function submit(event:React.FormEvent){
  event.preventDefault();if(lock.current)return;lock.current=true;setPending(true);setFailed(false);
  try {const {error}=await supabase.auth.resetPasswordForEmail(email.trim(),{redirectTo:AWS_EMAIL_CALLBACK});if(error)throw error;setSent(true);setEmail('');}
  catch {setFailed(true);} finally {setPending(false);lock.current=false;}
 }
 return <Frame title={tx({de:'Passwort zurücksetzen',en:'Reset your password',es:'Restablece tu contraseña'})}>
 {sent?<p role="status">{tx({de:'Falls ein Konto mit dieser Adresse existiert, erhältst du einen Link. Bitte prüfe auch deinen Spam-Ordner.',en:'If an account exists for that address, you will receive a recovery link. Check your spam folder too.',es:'Si existe una cuenta con esa dirección, recibirás un enlace. Revisa también el correo no deseado.'})}</p>:<form onSubmit={submit} className="space-y-4"><Label htmlFor="recovery-email">{tx({de:'E-Mail',en:'Email',es:'Correo electrónico'})}</Label><Input id="recovery-email" type="email" autoComplete="email" required maxLength={254} value={email} onChange={e=>setEmail(e.target.value)} disabled={pending}/><Button type="submit" disabled={pending}>{pending?tx({de:'Wird gesendet…',en:'Sending…',es:'Enviando…'}):tx({de:'Link senden',en:'Send recovery link',es:'Enviar enlace'})}</Button></form>}
 {failed&&<p role="alert">{tx({de:'Der Link konnte derzeit nicht gesendet werden. Bitte versuche es später erneut.',en:'The recovery request could not complete. Please try again later.',es:'No se pudo completar la solicitud. Inténtalo más tarde.'})}</p>}
 <Link to="/auth" className="block text-primary underline">{tx({de:'Zur Anmeldung',en:'Back to sign in',es:'Volver al inicio de sesión'})}</Link></Frame>;
}
export function AwsEmailCallbackPage(){
 const {user,session,loading,requiresMfa,signOut}=useAuth();
 const [verified,setVerified]=useState<{userId:string;accessToken:string}|null>(null),[checking,setChecking]=useState(true),[failed,setFailed]=useState(false),[password,setPassword]=useState(''),[confirm,setConfirm]=useState(''),[pending,setPending]=useState(false),[done,setDone]=useState(false),[ended,setEnded]=useState(false),[message,setMessage]=useState('');const lock=useRef(false);
 useEffect(()=>{
  let active=true;
  void(async()=>{
   try {
    if(!awsEmailCallback||!('accessToken' in awsEmailCallback))throw Error('Invalid link');
    const {data,error}=await supabase.auth.getSession();
    if(error||data.session?.access_token!==awsEmailCallback.accessToken)throw Error('Session differs');
    const authoritative=await supabase.auth.getUser(awsEmailCallback.accessToken);
    if(authoritative.error||!authoritative.data.user||authoritative.data.user.id!==data.session.user.id)throw Error('Identity differs');
    if(active)setVerified({userId:authoritative.data.user.id,accessToken:awsEmailCallback.accessToken});
   } catch {if(active)setFailed(true);}
   finally {
    // The SDK must consume a valid fragment before it is removed. Never retain
    // tokens or provider error text in the address bar or browser history.
    window.history.replaceState(window.history.state,'',window.location.pathname);
    if(active)setChecking(false);
   }
  })();
  return()=>{active=false;};
 },[]);
 async function submit(event:React.FormEvent){
  event.preventDefault();if(lock.current||!verified||requiresMfa||loading)return;
  if(password!==confirm||!validAwsRecoveryPassword(password)){setMessage(tx({de:'Nutze mindestens 12 Zeichen mit Buchstaben und einer Zahl oder einem Symbol. Beide Eingaben müssen übereinstimmen.',en:'Use at least 12 characters with letters and a number or symbol. Both passwords must match.',es:'Usa al menos 12 caracteres con letras y un número o símbolo. Las contraseñas deben coincidir.'}));return;}
  lock.current=true;setPending(true);setMessage('');
  try {
   const current=await supabase.auth.getSession();
   if(current.error||current.data.session?.access_token!==verified.accessToken||current.data.session.user.id!==verified.userId)throw Error('Session changed');
   const result=await updateAwsRecoveryPassword(verified.userId,verified.accessToken,password);
   let localEnded=true;
   try {
    const latest=await supabase.auth.getSession();
    if(latest.error)localEnded=false;
    else if(latest.data.session?.access_token===verified.accessToken){const cleared=await supabase.auth.signOut({scope:'local'});localEnded=!cleared.error;}
   } catch {localEnded=false;}
   setEnded(result.sessionsEnded&&localEnded);setDone(true);
  } catch {setMessage(tx({de:'Das Passwort konnte nicht bestätigt werden. Bitte melde dich ab und fordere einen neuen Link an.',en:'The password update could not be confirmed. Sign out and request a new link.',es:'No se pudo confirmar el cambio. Cierra sesión y solicita otro enlace.'}));}
  finally {setPassword('');setConfirm('');setPending(false);lock.current=false;}
 }
 const title=tx({de:'Konto bestätigen',en:'Verify your account',es:'Verifica tu cuenta'});
 if(done)return <Frame title={tx({de:'Passwort geändert',en:'Password updated',es:'Contraseña actualizada'})}><p role="status">{ended?tx({de:'Dein Passwort wurde geändert. Bitte melde dich erneut an.',en:'Your password was updated. Sign in again with your new password.',es:'Tu contraseña se ha actualizado. Inicia sesión de nuevo.'}):tx({de:'Dein Passwort wurde geändert. Bitte melde dich ab, um die Sitzung zu beenden.',en:'Your password was updated. Please sign out to finish ending your session.',es:'Tu contraseña se ha actualizado. Cierra sesión para finalizar.'})}</p><Button onClick={()=>void signOut()}>{tx({de:'Abmelden',en:'Sign out',es:'Cerrar sesión'})}</Button><Link to="/auth" className="block text-primary underline">{tx({de:'Anmelden',en:'Sign in',es:'Iniciar sesión'})}</Link></Frame>;
 if(checking||loading)return <Frame title={title}><p role="status">{tx({de:'Link wird geprüft…',en:'Checking your recovery link…',es:'Comprobando el enlace…'})}</p></Frame>;
 if(failed||!verified||session?.access_token!==verified.accessToken||user?.id!==verified.userId)return <Frame title={title}><p role="alert">{tx({de:'Dieser Link ist ungültig oder abgelaufen. Bitte fordere einen neuen an.',en:'This link is invalid or expired. Request a new recovery link.',es:'El enlace no es válido o ha caducado. Solicita uno nuevo.'})}</p><Link to="/forgot-password" className="text-primary underline">{tx({de:'Neuen Link anfordern',en:'Request a new link',es:'Solicitar otro enlace'})}</Link></Frame>;
 if(requiresMfa)return <Frame title={title}><p role="alert">{tx({de:'Dieses Konto benötigt zusätzliche Verifizierung. Die Wiederherstellung kann hier noch nicht abgeschlossen werden.',en:'This account requires additional verification. Recovery cannot be completed here yet.',es:'Esta cuenta requiere verificación adicional. La recuperación aún no se puede completar aquí.'})}</p><Button onClick={()=>void signOut()}>{tx({de:'Abmelden',en:'Sign out',es:'Cerrar sesión'})}</Button></Frame>;
 if(awsEmailCallback.kind==='signup')return <Navigate to="/home" replace/>;
 return <Frame title={tx({de:'Neues Passwort festlegen',en:'Choose a new password',es:'Elige una nueva contraseña'})}><form onSubmit={submit} className="space-y-4"><Label htmlFor="recovery-password">{tx({de:'Neues Passwort',en:'New password',es:'Nueva contraseña'})}</Label><Input id="recovery-password" type="password" autoComplete="new-password" required minLength={12} maxLength={256} value={password} onChange={e=>setPassword(e.target.value)} disabled={pending}/><p className="text-sm text-muted-foreground">{tx({de:'Mindestens 12 Zeichen mit Buchstaben und einer Zahl oder einem Symbol.',en:'At least 12 characters with letters and a number or symbol.',es:'Al menos 12 caracteres con letras y un número o símbolo.'})}</p><Label htmlFor="recovery-confirm">{tx({de:'Passwort bestätigen',en:'Confirm password',es:'Confirma la contraseña'})}</Label><Input id="recovery-confirm" type="password" autoComplete="new-password" required minLength={12} maxLength={256} value={confirm} onChange={e=>setConfirm(e.target.value)} disabled={pending}/><Button type="submit" disabled={pending}>{pending?tx({de:'Wird gespeichert…',en:'Saving…',es:'Guardando…'}):tx({de:'Passwort speichern',en:'Update password',es:'Actualizar contraseña'})}</Button>{message&&<p role="alert">{message}</p>}</form></Frame>;
}

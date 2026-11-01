import { createAwsValidationFetch } from './awsValidationFetch';
import { validAwsRecoveryPassword } from './awsEmailAuth';
export async function updateAwsRecoveryPassword(userId:string,accessToken:string,password:string,fetcher:typeof fetch=globalThis.fetch):Promise<{sessionsEnded:boolean}> {
 if(!userId||!accessToken||!validAwsRecoveryPassword(password))throw Error('A verified recovery session and a strong password are required.');
 const base=import.meta.env.VITE_SUPABASE_URL;
 const key=import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
 if(!key)throw Error('Account recovery is unavailable.');
 const request=createAwsValidationFetch(fetcher,base);
 const headers={'Content-Type':'application/json',apikey:key,Authorization:'Bearer '+accessToken};
 // Explicit bearer binding prevents a concurrently replaced SDK session from
 // changing the password of a different account.
 const response=await request(base+'/auth/v1/user',{method:'PUT',headers,body:JSON.stringify({password})});
 if(!response.ok)throw Error('The password could not be updated. Request a new recovery link.');
 const user=await response.json();
 if(user?.id!==userId)throw Error('The password update could not be verified. Sign out and request a new link.');
 // A failed logout must never be represented as a failed password change or
 // trigger an automatic repeat of the password update.
 try {
  const ended=await request(base+'/auth/v1/logout?scope=global',{method:'POST',headers,body:'{}'});
  return {sessionsEnded:ended.ok};
 } catch { return {sessionsEnded:false}; }
}

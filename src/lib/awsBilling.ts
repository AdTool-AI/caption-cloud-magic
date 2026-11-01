import { STRIPE_PRICE_MAP, type PaymentCurrency } from '@/config/stripe';
import type { AIVideoCreditPackId } from '@/config/aiVideoCredits';

export type BillingProfile={id:string;plan:'free'|'basic'|'pro'|'enterprise'};
export type BillingInvoke=(slug:string,options:{body:Record<string,unknown>;headers:Record<string,string>})=>Promise<{data:unknown;error:unknown}>;
export function billingProfile(rows:unknown,actor:string):BillingProfile{
 if(!Array.isArray(rows)||rows.length!==1||rows[0]?.id!==actor||!['free','basic','pro','enterprise'].includes(rows[0]?.plan))throw Error('The account plan could not be verified.');
 return {id:actor,plan:rows[0].plan};
}
export function stripeCheckoutUrl(value:unknown):string{
 if(typeof value!=='string'||value.length>4096)throw Error('Stripe checkout could not be verified.');
 const u=new URL(value);
 if(u.origin!=='https://checkout.stripe.com'||u.username||u.password||!u.pathname.startsWith('/c/pay/')||/[\u0000-\u0020\u007f]/.test(value))throw Error('Stripe checkout could not be verified.');
 return u.href;
}
export function creditReturn(search:string):string|null{
 const q=new URLSearchParams(search);
 if(q.getAll('payment').length!==1||q.get('payment')!=='success'||q.getAll('session_id').length!==1)return null;
 const id=q.get('session_id')!;
 return /^cs_live_[A-Za-z0-9]{16,240}$/.test(id)?id:null;
}
async function invoke(call:BillingInvoke,slug:string,body:Record<string,unknown>,token:string):Promise<unknown>{
 let r:Awaited<ReturnType<BillingInvoke>>;
 try{r=await call(slug,{body,headers:{Authorization:'Bearer '+token}});}catch{throw Error('The request could not be confirmed. Check Stripe before trying another checkout.');}
 if(r.error){
  const status=(r.error as {context?:Response}).context?.status;
  if(status===401)throw Error('Sign in again before continuing.');
  if(status===403)throw Error('This purchase is unavailable for the current account. An active Beta-Basic subscription is required for credit packs.');
  if(status===409)throw Error('Payment is pending or requires review. Do not make another purchase.');
  throw Error('The request could not be confirmed. Check Stripe before trying another checkout.');
 }
 return r.data;
}
export async function startBillingCheckout(call:BillingInvoke,profile:BillingProfile,token:string,currency:PaymentCurrency,pack:AIVideoCreditPackId|null):Promise<string>{
 if(!token||!['EUR','USD','GBP'].includes(currency))throw Error('Sign in and select a supported currency.');
 if(pack===null&&profile.plan!=='free')throw Error('This account already has a paid plan. Do not create another subscription.');
 if(pack!==null&&(profile.plan==='free'||!['starter','standard','pro','enterprise'].includes(pack)))throw Error('An active paid subscription is required for credit packs.');
 const data=await invoke(call,pack===null?'create-checkout':'ai-video-purchase-credits',pack===null?{priceId:STRIPE_PRICE_MAP.basic[currency],locale:'en'}:{packId:pack,currency,locale:'en'},token);
 return stripeCheckoutUrl((data as {url?:unknown})?.url);
}
export async function verifyBillingCredits(call:BillingInvoke,sessionId:string,token:string):Promise<number>{
 if(!token||!/^cs_live_[A-Za-z0-9]{16,240}$/.test(sessionId))throw Error('A valid live credit checkout return is required.');
 const result=await invoke(call,'ai-video-verify-purchase',{sessionId},token) as {success?:unknown;newBalance?:unknown};
 if(result?.success!==true||typeof result.newBalance!=='number'||!Number.isFinite(result.newBalance)||result.newBalance<0)throw Error('Credit fulfillment could not be confirmed.');
 return result.newBalance;
}

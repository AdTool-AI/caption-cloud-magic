import {STRIPE_SUBSCRIPTION_PRICES,FOUNDERS_CREDIT_DISCOUNT_PERCENT} from './stripe-config.ts';
export type BillingCheckoutKind='subscription'|'credits';
const headers={'Content-Type':'application/json','Access-Control-Allow-Origin':'https://prodtest.useadtool.ai'};
const denied=(status:number,error:string)=>new Response(JSON.stringify({error}),{status,headers});
/** Validate before any customer creation or checkout API operation. Auth getUser still runs in each handler. */
export async function validateBillingCheckout(req:Request,kind:BillingCheckoutKind,appUrl:string|undefined):Promise<Response|null>{
 if(req.method!=='POST')return denied(405,'METHOD_NOT_ALLOWED');
 if(['x-qa-mock','x-qa-real-spend','x-real-spend'].some(name=>req.headers.has(name)))return denied(403,'TEST_FLAGS_DENIED');
 if(!/^Bearer [A-Za-z0-9_.-]+$/.test(req.headers.get('Authorization')??''))return denied(401,'UNAUTHORIZED');
 let expected:URL;try{expected=new URL(appUrl??'');}catch{return denied(503,'BILLING_CONFIGURATION_UNAVAILABLE');}
 if(expected.protocol!=='https:'||expected.username||expected.password||expected.pathname!=='/'||expected.search||expected.hash)return denied(503,'BILLING_CONFIGURATION_UNAVAILABLE');
 if(req.headers.get('Origin')!==expected.origin)return denied(403,'BILLING_ORIGIN_DENIED');
 if(!/^application\/json(?:\s*;.*)?$/i.test(req.headers.get('Content-Type')??''))return denied(415,'JSON_REQUIRED');
 let body:any;
 try{
  const copy=req.clone();if(!copy.body)return denied(400,'INVALID_REQUEST');
  const reader=copy.body.getReader();let size=0;const chunks:Uint8Array[]=[];
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>16384){void reader.cancel();return denied(413,'REQUEST_TOO_LARGE');}chunks.push(value);}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  body=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
 }catch{return denied(400,'INVALID_REQUEST');}
 if(!body||typeof body!=='object'||Array.isArray(body))return denied(400,'INVALID_REQUEST');
 const allowed=kind==='subscription'?['priceId','promoCode','applyIntro','couponId','locale']:['packId','currency','locale'];
 if(Object.keys(body).some(key=>!allowed.includes(key)))return denied(400,'UNKNOWN_CHECKOUT_FIELD');
 if(body.locale!==undefined&&!['en','de','es'].includes(body.locale))return denied(400,'INVALID_LOCALE');
 if(kind==='subscription'){
  if(!Object.values(STRIPE_SUBSCRIPTION_PRICES).includes(body.priceId))return denied(400,'INVALID_SUBSCRIPTION_PRICE');
  if(body.applyIntro!==undefined&&typeof body.applyIntro!=='boolean')return denied(400,'INVALID_REQUEST');
  if(['promoCode','couponId'].some(key=>body[key]!==undefined&&(typeof body[key]!=='string'||!body[key].length||body[key].length>200||/[\x00-\x1f]/.test(body[key]))))return denied(400,'INVALID_PROMOTION');
 }else if(!['starter','standard','pro','enterprise'].includes(body.packId)||!['EUR','USD','GBP'].includes(body.currency))return denied(400,'INVALID_CREDIT_PACK');
 return null;
}
/** Eligibility duration remains owned by is_founder_active; never replace a promised discount with full price. */
export function founderCouponMatches(value:unknown):boolean{
 const coupon=value as {valid?:unknown;percent_off?:unknown;amount_off?:unknown;deleted?:unknown}|null;
 return !!coupon&&coupon.deleted!==true&&coupon.valid===true&&coupon.percent_off===FOUNDERS_CREDIT_DISCOUNT_PERCENT&&coupon.amount_off==null;
}

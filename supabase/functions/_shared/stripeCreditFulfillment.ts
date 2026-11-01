import {CREDIT_PACKS,STRIPE_PRICE_IDS,type PaymentCurrency,type PurchaseRequest} from './stripeCreditPacks.ts';
export class CreditPurchaseError extends Error {
  constructor(public readonly status:number,public readonly code:string){super(code);}
}
export type CreditSession={id:string;mode:string|null;status:string|null;payment_status:string;livemode:boolean;currency:string|null;metadata:Record<string,string>|null};
export type CreditLineItems={has_more:boolean;data:Array<{quantity:number|null;price:{id:string;currency:string}|null}>};
export type CreditGrant={p_user_id:string;p_currency:PaymentCurrency;p_base_amount:number;p_bonus_amount:number;p_pack_size:PurchaseRequest['packId'];p_bonus_percent:number;p_stripe_session_id:string};
const UUID=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
export const isCheckoutSessionId=(value:unknown):value is string=>typeof value==='string'&&/^cs_(test|live)_[A-Za-z0-9]{8,200}$/.test(value);
/** Provider objects must come from the authenticated Stripe API, never a browser request body. */
export function creditGrantForSession(session:CreditSession,items:CreditLineItems,expectedLiveMode:boolean,actor?:string):CreditGrant {
  if(!isCheckoutSessionId(session.id)||session.livemode!==expectedLiveMode)throw new CreditPurchaseError(409,'PAYMENT_MODE_MISMATCH');
  const metadata=session.metadata;
  if(session.mode!=='payment'||metadata?.type!=='ai_video_credits')throw new CreditPurchaseError(400,'CREDIT_CHECKOUT_REQUIRED');
  if(!UUID.test(metadata.user_id??'')||actor&&metadata.user_id!==actor)throw new CreditPurchaseError(404,'PURCHASE_NOT_ACCESSIBLE');
  if(session.status!=='complete'||session.payment_status!=='paid')throw new CreditPurchaseError(409,'PAYMENT_NOT_COMPLETED');
  const packId=metadata.pack_id as PurchaseRequest['packId'];const currency=session.currency?.toUpperCase() as PaymentCurrency;
  if(!Object.prototype.hasOwnProperty.call(CREDIT_PACKS,packId)||!['EUR','USD','GBP'].includes(currency)||metadata.currency!==currency)throw new CreditPurchaseError(400,'CREDIT_PACK_MISMATCH');
  if(items.has_more||items.data.length!==1||items.data[0].quantity!==1||items.data[0].price?.id!==STRIPE_PRICE_IDS[packId][currency]||items.data[0].price?.currency!==currency.toLowerCase())throw new CreditPurchaseError(400,'CHECKOUT_LINE_ITEMS_MISMATCH');
  const pack=CREDIT_PACKS[packId];
  // Grant the catalog pack, not browser fields or mutable amount strings in metadata.
  return {p_user_id:metadata.user_id,p_currency:currency,p_base_amount:pack.credits,p_bonus_amount:pack.bonus,p_pack_size:packId,p_bonus_percent:pack.bonusPercent,p_stripe_session_id:session.id};
}
export interface CreditFulfillmentPorts {
  loadSession(id:string):Promise<CreditSession>;
  loadLineItems(id:string):Promise<CreditLineItems>;
  grantOnce(grant:CreditGrant):Promise<number>;
  expectedLiveMode:boolean;
}
export async function fulfillCreditSession(ports:CreditFulfillmentPorts,id:string,actor?:string):Promise<number>{
  if(!isCheckoutSessionId(id))throw new CreditPurchaseError(400,'INVALID_CHECKOUT_SESSION');
  const session=await ports.loadSession(id);
  if(session.id!==id)throw new CreditPurchaseError(409,'CHECKOUT_SESSION_MISMATCH');
  // Refuse foreign, unpaid and wrong-mode sessions before any grant operation.
  if(actor&&session.metadata?.user_id!==actor)throw new CreditPurchaseError(404,'PURCHASE_NOT_ACCESSIBLE');
  if(session.livemode!==ports.expectedLiveMode)throw new CreditPurchaseError(409,'PAYMENT_MODE_MISMATCH');
  if(session.status!=='complete'||session.payment_status!=='paid')throw new CreditPurchaseError(409,'PAYMENT_NOT_COMPLETED');
  const items=await ports.loadLineItems(id);const grant=creditGrantForSession(session,items,ports.expectedLiveMode,actor);
  const balance=await ports.grantOnce(grant);
  if(!Number.isFinite(balance)||balance<0)throw new CreditPurchaseError(503,'CREDIT_GRANT_REVIEW_REQUIRED');
  return balance;
}
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info'};
const json=(status:number,value:unknown)=>new Response(JSON.stringify(value),{status,headers:{...cors,'Content-Type':'application/json'}});
export function createVerifyCreditPurchaseHandler(authenticate:(bearer:string)=>Promise<string|null>,ports:()=>CreditFulfillmentPorts,options?:{appUrl:string}){
 return async(req:Request):Promise<Response>=>{
  if(req.method==='OPTIONS')return new Response(null,{status:200,headers:cors});
  if(req.method!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});
  if(options){
   let expected:URL;try{expected=new URL(options.appUrl);}catch{return json(503,{error:'BILLING_CONFIGURATION_UNAVAILABLE'});}
   if(expected.protocol!=='https:'||expected.username||expected.password||expected.pathname!=='/'||expected.search||expected.hash)return json(503,{error:'BILLING_CONFIGURATION_UNAVAILABLE'});
   if(req.headers.get('Origin')!==expected.origin)return json(403,{error:'BILLING_ORIGIN_DENIED'});
  }
  if(['x-qa-mock','x-qa-real-spend','x-real-spend'].some(name=>req.headers.has(name)))return json(403,{error:'TEST_FLAGS_DENIED'});
  const bearer=req.headers.get('Authorization');if(!bearer||!/^Bearer [A-Za-z0-9_.-]+$/.test(bearer))return json(401,{error:'UNAUTHORIZED'});
  try {
   const actor=await authenticate(bearer);if(!actor||!UUID.test(actor))return json(401,{error:'UNAUTHORIZED'});
   if(!req.body)return json(400,{error:'INVALID_REQUEST'});
   const reader=req.body.getReader();let size=0;const chunks:Uint8Array[]=[];
   while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>4096){await reader.cancel();return json(413,{error:'REQUEST_TOO_LARGE'});}chunks.push(value);}
   const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
   let body:any;try{body=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{return json(400,{error:'INVALID_REQUEST'});}
   if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).length!==1||!isCheckoutSessionId(body.sessionId))return json(400,{error:'INVALID_CHECKOUT_SESSION'});
   const newBalance=await fulfillCreditSession(ports(),body.sessionId,actor);return json(200,{success:true,newBalance});
  } catch(error){return error instanceof CreditPurchaseError?json(error.status,{error:error.code}):json(503,{error:'PURCHASE_VERIFICATION_UNAVAILABLE'});}
 };
}

export function creditBalance(value:unknown):number {
 if(typeof value!=='number'&&!(typeof value==='string'&&/^\d+(?:\.\d{1,2})?$/.test(value)))throw new CreditPurchaseError(503,'CREDIT_GRANT_REVIEW_REQUIRED');
 const amount=Number(value);if(!Number.isFinite(amount)||amount<0)throw new CreditPurchaseError(503,'CREDIT_GRANT_REVIEW_REQUIRED');return amount;
}
/** Called only after Stripe's SDK verifies the original webhook bytes/signature. */
export async function fulfillCreditTopupEvent(event:{type:string;livemode:boolean;data:{object:CreditSession}},ports:CreditFulfillmentPorts):Promise<'pending'|'fulfilled'|'unrelated'> {
 if(!['checkout.session.completed','checkout.session.async_payment_succeeded'].includes(event.type))return 'unrelated';
 const session=event.data.object;
 if(session.mode!=='payment'||session.metadata?.type!=='ai_video_credits')return 'unrelated';
 if(event.livemode!==ports.expectedLiveMode||session.livemode!==ports.expectedLiveMode)throw new CreditPurchaseError(409,'PAYMENT_MODE_MISMATCH');
 if(session.payment_status!=='paid')return 'pending';
 await fulfillCreditSession(ports,session.id);return 'fulfilled';
}

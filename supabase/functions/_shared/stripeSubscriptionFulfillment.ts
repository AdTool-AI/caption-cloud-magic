import {STRIPE_SUBSCRIPTION_PRICES} from './stripe-config.ts';
export class SubscriptionFulfillmentError extends Error{constructor(code:string){super(code);}}
type RecordValue=Record<string,any>;
export type BasicSubscriptionSnapshot={user_id:string;customer_id:string;subscription_id:string;status:'active'|'canceled';price_id:string;period_start:number;period_end:number;paid_invoice_id:string|null;observed_at:number};
export interface SubscriptionPorts{
 expectedLiveMode:boolean;
 loadCheckout(id:string):Promise<RecordValue>;
 loadSubscription(id:string):Promise<RecordValue>;
 loadInvoice(id:string):Promise<RecordValue>;
 loadInvoiceLines(id:string):Promise<RecordValue>;
 findActor(customerId:string):Promise<string|null>;
 apply(args:{p_event_id:string;p_event_type:string;p_event_sha256:string;p_snapshot:BasicSubscriptionSnapshot}):Promise<unknown>;
 now?:()=>number;
}
const UUID=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const relevant=new Set(['checkout.session.completed','checkout.session.async_payment_succeeded','customer.subscription.created','customer.subscription.updated','customer.subscription.deleted','invoice.paid']);
const fail=(code:string):never=>{throw new SubscriptionFulfillmentError(code);};
function identity(value:any,prefix:string):string{
 const id=typeof value==='string'?value:value?.deleted!==true?value?.id:null;
 return typeof id==='string'&&(prefix==='cs'?/^cs_(test|live)_[A-Za-z0-9]{8,200}$/:new RegExp('^'+prefix+'_[A-Za-z0-9]{8,200}$')).test(id)?id:fail('INVALID_STRIPE_IDENTITY');
}
function invoiceSubscription(invoice:RecordValue):string|null{
 const parent=invoice.parent;
 if(parent?.type==='subscription_details')return identity(parent.subscription_details?.subscription,'sub');
 if(invoice.subscription)return identity(invoice.subscription,'sub');
 return null;
}
function sameMode(value:RecordValue,live:boolean){if(value.livemode!==live)fail('SUBSCRIPTION_MODE_MISMATCH');}
export async function eventBodyHash(raw:string):Promise<string>{
 const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(raw)));
 return [...bytes].map(v=>v.toString(16).padStart(2,'0')).join('');
}
/** Invoke only after Stripe SDK verifies the unchanged raw event bytes. Provider objects are retrieved again. */
export async function fulfillBasicSubscriptionEvent(event:RecordValue,raw:string,ports:SubscriptionPorts):Promise<'unrelated'|'pending'|'unmanaged'|'fulfilled'>{
 if(!relevant.has(event.type))return 'unrelated';
 const object=event.data?.object;if(!object||typeof object!=='object')fail('INVALID_SUBSCRIPTION_EVENT');
 if(event.type.startsWith('checkout.session.')&&object.mode!=='subscription')return 'unrelated';
 if(typeof event.id!=='string'||!/^evt_[A-Za-z0-9_]{8,200}$/.test(event.id))fail('INVALID_SUBSCRIPTION_EVENT');
 sameMode(event,ports.expectedLiveMode);
 let subId:string;let expectedCustomer:string;let checkoutActor:string|undefined;
 if(event.type.startsWith('checkout.session.')){
  const id=identity(object,'cs');const session=await ports.loadCheckout(id);
  if(session.id!==id||session.object!=='checkout.session'||session.mode!=='subscription')fail('CHECKOUT_SUBSCRIPTION_MISMATCH');
  sameMode(session,ports.expectedLiveMode);
  if(session.status!=='complete'||session.payment_status!=='paid')return 'pending';
  subId=identity(session.subscription,'sub');expectedCustomer=identity(session.customer,'cus');checkoutActor=session.metadata?.userId;
 }else if(event.type==='invoice.paid'){
  const id=identity(object,'in');const invoice=await ports.loadInvoice(id);
  if(invoice.id!==id||invoice.object!=='invoice')fail('INVOICE_IDENTITY_MISMATCH');sameMode(invoice,ports.expectedLiveMode);
  const linked=invoiceSubscription(invoice);if(!linked)return 'unrelated';
  subId=linked;expectedCustomer=identity(invoice.customer,'cus');
 }else{subId=identity(object,'sub');expectedCustomer=identity(object.customer,'cus');}
 // Observation starts before retrieval so a slow older read cannot overwrite a later snapshot.
 const observed=Math.floor((ports.now?.()??Date.now())/1000);
 const subscription=await ports.loadSubscription(subId);
 if(subscription.object!=='subscription'||subscription.id!==subId||identity(subscription.customer,'cus')!==expectedCustomer)fail('SUBSCRIPTION_CUSTOMER_MISMATCH');
 sameMode(subscription,ports.expectedLiveMode);
 const actor=await ports.findActor(expectedCustomer);if(actor===null)return 'unmanaged';
 if(!UUID.test(actor)||checkoutActor!==undefined&&checkoutActor!==actor||subscription.metadata?.userId!==undefined&&subscription.metadata.userId!==actor)fail('SUBSCRIPTION_ACTOR_MISMATCH');
 if(subscription.metadata?.workspace_id)fail('WORKSPACE_SUBSCRIPTION_REQUIRES_REVIEW');
 if(subscription.status!=='active'&&subscription.status!=='canceled')fail('SUBSCRIPTION_STATE_REQUIRES_REVIEW');
 const rows=subscription.items;
 if(!rows||rows.has_more!==false||!Array.isArray(rows.data)||rows.data.length!==1)fail('SUBSCRIPTION_ITEMS_REQUIRE_REVIEW');
 const item=rows.data[0],price=item.price;
 const currency=subscription.currency?.toUpperCase() as keyof typeof STRIPE_SUBSCRIPTION_PRICES;
 if(item.quantity!==1||!price||!Object.prototype.hasOwnProperty.call(STRIPE_SUBSCRIPTION_PRICES,currency)||price.id!==STRIPE_SUBSCRIPTION_PRICES[currency]||price.currency!==currency.toLowerCase()||price.unit_amount!==1495||price.billing_scheme!=='per_unit'||price.type!=='recurring'||price.recurring?.interval!=='month'||price.recurring?.interval_count!==1||price.transform_quantity!=null)fail('BASIC_SUBSCRIPTION_PRICE_MISMATCH');
 sameMode(price,ports.expectedLiveMode);
 const start=item.current_period_start,end=item.current_period_end;
 if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<=0||end<=start||end-start>62*86400)fail('SUBSCRIPTION_PERIOD_MISMATCH');
 let invoiceId:string|null=null;
 if(subscription.status==='active'){
  invoiceId=identity(subscription.latest_invoice,'in');const invoice=await ports.loadInvoice(invoiceId);
  if(invoice.id!==invoiceId||invoice.object!=='invoice'||identity(invoice.customer,'cus')!==expectedCustomer||invoiceSubscription(invoice)!==subId)fail('PAID_INVOICE_BINDING_MISMATCH');
  sameMode(invoice,ports.expectedLiveMode);
  if(invoice.status!=='paid'||invoice.amount_remaining!==0||invoice.currency!==currency.toLowerCase())fail('SUBSCRIPTION_INVOICE_NOT_PAID');
  const lines=await ports.loadInvoiceLines(invoiceId);
  if(lines.has_more!==false||!Array.isArray(lines.data)||lines.data.length!==1)fail('SUBSCRIPTION_INVOICE_LINES_REQUIRE_REVIEW');
  const line=lines.data[0],parent=line.parent?.subscription_item_details;
  if(line.quantity!==1||line.currency!==currency.toLowerCase()||line.period?.start!==start||line.period?.end!==end||line.pricing?.type!=='price_details'||line.pricing.price_details?.price!==price.id||line.parent?.type!=='subscription_item_details'||parent?.proration!==false||identity(parent?.subscription,'sub')!==subId)fail('SUBSCRIPTION_INVOICE_LINE_MISMATCH');
 }
 const result=await ports.apply({p_event_id:event.id,p_event_type:event.type,p_event_sha256:await eventBodyHash(raw),p_snapshot:{user_id:actor,customer_id:expectedCustomer,subscription_id:subId,status:subscription.status,price_id:price.id,period_start:start,period_end:end,paid_invoice_id:invoiceId,observed_at:observed}}) as RecordValue|null;
 if(!result||!['applied','unchanged','stale','canceled_subscription'].includes(result.result)||typeof result.duplicate!=='boolean')fail('SUBSCRIPTION_RECEIPT_REQUIRES_REVIEW');
 return 'fulfilled';
}

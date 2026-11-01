import {CreditPurchaseError,type CreditSession} from './stripeCreditFulfillment.ts';

export const AWS_CREDIT_PURCHASE_CONTRACT='aws_credit_v1';

export class UnmanagedCreditWebhook extends Error {
 constructor(){super('UNMANAGED_CREDIT_WEBHOOK');}
}
type ActorLookup={user:{id:string;role?:string;is_anonymous?:boolean}|null;error:{status?:number;code?:string}|null};
/** An authoritative Stripe marker distinguishes AWS checkouts from legacy payments. */
export function requireAwsCreditSession(session:CreditSession,id:string,live:boolean,surface:'browser'|'webhook'):CreditSession {
 if(session.id!==id)throw new CreditPurchaseError(409,'CHECKOUT_SESSION_MISMATCH');
 if(session.livemode!==live)throw new CreditPurchaseError(409,'PAYMENT_MODE_MISMATCH');
 if(session.mode!=='payment'||session.metadata?.type!=='ai_video_credits')throw new CreditPurchaseError(400,'CREDIT_CHECKOUT_REQUIRED');
 const contract=session.metadata.aws_billing_contract;
 if(surface==='webhook'&&contract===undefined)throw new UnmanagedCreditWebhook();
 if(contract!==AWS_CREDIT_PURCHASE_CONTRACT)throw new CreditPurchaseError(surface==='browser'?404:503,surface==='browser'?'PURCHASE_NOT_ACCESSIBLE':'CREDIT_CONTRACT_REVIEW_REQUIRED');
 return session;
}
/** Missing or unavailable Auth for an AWS-marked purchase must remain retryable. */
export async function requireManagedCreditWebhookSession(session:CreditSession,id:string,live:boolean,lookup:(id:string)=>Promise<ActorLookup>):Promise<CreditSession>{
 requireAwsCreditSession(session,id,live,'webhook');
 const actor=session.metadata!.user_id;
 if(!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(actor??''))throw new CreditPurchaseError(503,'CREDIT_ACTOR_REVIEW_REQUIRED');
 const result=await lookup(actor);
 if(result.error||!result.user||result.user.id!==actor||result.user.role!=='authenticated'||result.user.is_anonymous===true)throw new CreditPurchaseError(503,'CREDIT_ACTOR_LOOKUP_UNAVAILABLE');
 return session;
}

import { beforeEach,expect,it,vi } from 'vitest';
import { billingProfile,stripeCheckoutUrl,creditReturn,startBillingCheckout,verifyBillingCredits } from '../awsBilling';
import { STRIPE_PRICE_MAP } from '@/config/stripe';
const invoke=vi.fn();const actor='actor';const id='cs_live_'+'a'.repeat(40);const url='https://checkout.stripe.com/c/pay/'+id+'#safe';
beforeEach(()=>{invoke.mockReset().mockResolvedValue({data:{url},error:null});});
it('requires exactly the signed-in account profile and a supported plan',()=>{
 expect(billingProfile([{id:actor,plan:'free'}],actor)).toEqual({id:actor,plan:'free'});
 for(const rows of [[],[{id:'foreign',plan:'basic'}],[{id:actor,plan:'admin'}],[{id:actor,plan:'free'},{id:'foreign',plan:'free'}]])expect(()=>billingProfile(rows,actor)).toThrow();
});
it.each(['http://checkout.stripe.com/c/pay/x','https://checkout.stripe.com.evil.example/c/pay/x','https://evil.example/c/pay/x','javascript:alert(1)','https://user:pass@checkout.stripe.com/c/pay/x','https://checkout.stripe.com/other/x'])('rejects unsafe checkout URL %s',bad=>expect(()=>stripeCheckoutUrl(bad)).toThrow());
it('allows the exact hosted Stripe checkout path',()=>expect(stripeCheckoutUrl(url)).toBe(url));
it.each(['EUR','USD','GBP'] as const)('uses the existing Basic catalog for %s',async currency=>{
 expect(await startBillingCheckout(invoke,{id:actor,plan:'free'},'jwt',currency,null)).toBe(url);
 expect(invoke).toHaveBeenCalledWith('create-checkout',{body:{priceId:STRIPE_PRICE_MAP.basic[currency],locale:'en'},headers:{Authorization:'Bearer jwt'}});
});
it('blocks duplicate subscription entry and free-account credit entry before network',async()=>{
 await expect(startBillingCheckout(invoke,{id:actor,plan:'basic'},'jwt','EUR',null)).rejects.toThrow('another subscription');
 await expect(startBillingCheckout(invoke,{id:actor,plan:'free'},'jwt','EUR','starter')).rejects.toThrow('subscription');expect(invoke).not.toHaveBeenCalled();
});
it('sends pack choice without browser-supplied credit grants or discounts',async()=>{
 await startBillingCheckout(invoke,{id:actor,plan:'basic'},'jwt','EUR','starter');
 expect(invoke).toHaveBeenCalledWith('ai-video-purchase-credits',{body:{packId:'starter',currency:'EUR',locale:'en'},headers:{Authorization:'Bearer jwt'}});
});
it('does not treat an arbitrary success flag or ambiguous session as payment proof',()=>{
 expect(creditReturn('?payment=success&session_id='+id)).toBe(id);
 for(const q of ['?payment=success','?payment=success&session_id=cs_test_'+'a'.repeat(40),'?payment=success&payment=success&session_id='+id,'?payment=success&session_id='+id+'&session_id='+id])expect(creditReturn(q)).toBeNull();
});
it('requires canonical server fulfillment before displaying balance',async()=>{
 invoke.mockResolvedValue({data:{success:true,newBalance:9},error:null});
 expect(await verifyBillingCredits(invoke,id,'jwt')).toBe(9);
 expect(invoke).toHaveBeenCalledWith('ai-video-verify-purchase',{body:{sessionId:id},headers:{Authorization:'Bearer jwt'}});
 for(const value of [{success:true,newBalance:-1},{success:false,newBalance:9},{success:true,newBalance:'9'},null]){invoke.mockResolvedValue({data:value,error:null});await expect(verifyBillingCredits(invoke,id,'jwt')).rejects.toThrow('confirmed');}
});
it('keeps unknown outcomes as review and never retries checkout automatically',async()=>{
 invoke.mockImplementation(async()=>{throw Error('private upstream detail');});
 let message='';try{await startBillingCheckout(invoke,{id:actor,plan:'free'},'jwt','EUR',null);}catch(error){message=(error as Error).message;}
 expect(message).toContain('Check Stripe');expect(invoke.mock.calls.length).toBe(1);
});
it('does not retry a pending payment or expose backend error contents',async()=>{
 invoke.mockResolvedValue({data:{error:'private detail'},error:{context:new Response('{}',{status:409})}});
 await expect(verifyBillingCredits(invoke,id,'jwt')).rejects.toThrow('Do not make another purchase');expect(invoke).toHaveBeenCalledOnce();
});

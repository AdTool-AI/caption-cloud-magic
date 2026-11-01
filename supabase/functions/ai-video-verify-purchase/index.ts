import {requireAwsCreditSession} from '../_shared/stripeCreditWebhookOwnership.ts';
import {serve} from 'https://deno.land/std@0.224.0/http/server.ts';
import Stripe from 'npm:stripe@18.5.0';
import {createClient} from 'npm:@supabase/supabase-js@2';
import {createVerifyCreditPurchaseHandler,CreditPurchaseError,creditBalance} from '../_shared/stripeCreditFulfillment.ts';
import {STRIPE_API_VERSION} from '../_shared/stripe-config.ts';
serve(createVerifyCreditPurchaseHandler(async bearer=>{
 const auth=createClient(Deno.env.get('SUPABASE_URL')??'',Deno.env.get('SUPABASE_ANON_KEY')??'',{auth:{persistSession:false,autoRefreshToken:false}});
 const {data,error}=await auth.auth.getUser(bearer.slice(7));
 return !error&&data.user?.role==='authenticated'&&!data.user.is_anonymous?data.user.id:null;
},()=>{
 const key=Deno.env.get('STRIPE_SECRET_KEY')??'';
 if(!/^(sk|rk)_(live|test)_/.test(key))throw new CreditPurchaseError(503,'PAYMENT_CONFIGURATION_UNAVAILABLE');
 const stripe=new Stripe(key,{apiVersion:STRIPE_API_VERSION});
 const admin=createClient(Deno.env.get('SUPABASE_URL')??'',Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')??'',{auth:{persistSession:false,autoRefreshToken:false}});
 return {expectedLiveMode:/^(sk|rk)_live_/.test(key),loadSession:async id=>{const session=await stripe.checkout.sessions.retrieve(id);return Deno.env.get('AWS_BASIC_SUBSCRIPTION_CONTRACT')==='true'?requireAwsCreditSession(session,id,/^(sk|rk)_live_/.test(key),'browser'):session;},loadLineItems:async id=>await stripe.checkout.sessions.listLineItems(id,{limit:2}),grantOnce:async grant=>{
  const {data,error}=await admin.rpc('grant_verified_ai_credit_purchase',grant);
  if(error)throw new CreditPurchaseError(503,'CREDIT_GRANT_REVIEW_REQUIRED');return creditBalance(data);
 }};
},{appUrl:Deno.env.get('APP_URL')??''}));

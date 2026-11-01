import {fulfillBasicSubscriptionEvent} from '../_shared/stripeSubscriptionFulfillment.ts';
import {fulfillCreditTopupEvent,creditBalance,CreditPurchaseError} from '../_shared/stripeCreditFulfillment.ts';
import {requireManagedCreditWebhookSession,UnmanagedCreditWebhook} from '../_shared/stripeCreditWebhookOwnership.ts';
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import Stripe from "npm:stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { withTelemetry, trackBusinessEvent } from "../_shared/telemetry.ts";
import { sendEmail } from "../_shared/email-send.ts";
import { isQaMockRequest, qaMockResponse, qaMockJson } from "../_shared/qaMock.ts";
import { isDuplicateStripeEvent } from "../_shared/stripeIdempotency.ts";
import { notifyRevenueEvent } from "../_shared/launch-radar-stripe.ts";

import {
  renderPurchaseWelcomeEmail,
  renderPaymentFailedEmail,
  normalizeLifecycleLang,
} from "../_shared/lifecycle-emails.ts";

const APP_URL = Deno.env.get("APP_URL") || "https://useadtool.ai";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE, PATCH',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-qa-mock',
};

const getPlanFromProductId = (productId: string): string => {
  // Product IDs from pricing config (AdTool AI)
  if (productId === 'prod_TIRSoTyzmRpbpT') return 'basic';
  if (productId === 'prod_TIRWOmhxlzFCwW') return 'pro';
  if (productId === 'prod_TIRYBu4fdR2BEw') return 'enterprise';
  // Enterprise Seat Add-on (internal use only)
  if (productId === 'prod_TIRbm7xCLAPWx3') return 'enterprise';
  return 'free';
};

const getCreditsForPlan = (plan: string): number => {
  switch (plan) {
    case 'basic': return 800;  // Updated for Pricing v2.1
    case 'pro': return 2500;   // Updated for Pricing v2.1
    case 'enterprise': return 999999999; // Unlimited represented as very large number
    default: return 100;
  }
};

serve(withTelemetry('stripe-webhook', async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  if(req.method!=='POST')return new Response(JSON.stringify({error:'METHOD_NOT_ALLOWED'}),{status:405,headers:{...corsHeaders,'Content-Type':'application/json'}});
  if([...req.headers.keys()].some(name=>name.startsWith('x-qa-')||name==='x-real-spend'))return new Response(JSON.stringify({error:'TEST_FLAGS_DENIED'}),{status:403,headers:{...corsHeaders,'Content-Type':'application/json'}});


  try {
    const signature = req.headers.get('stripe-signature');
    if (!signature) {
      return new Response(JSON.stringify({ error: 'No signature' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
    const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
    
    if (!stripeKey || !webhookSecret) {
      console.error('Missing Stripe configuration');
      return new Response(JSON.stringify({ error: 'Configuration error' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const stripe = new Stripe(stripeKey, { apiVersion: '2025-08-27.basil' });
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const body = await req.text();
    // Ungültige Signatur ist ein Client-Fehler (400), kein Serverfehler (500).
    // Stripe wiederholt 500er endlos und markiert den Endpunkt als defekt.
    let event: Stripe.Event;
    try {
      event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);
    } catch (sigError) {
      const message = sigError instanceof Error ? sigError.message : String(sigError);
      console.warn('[STRIPE-WEBHOOK] Signature verification failed:', message);
      return new Response(JSON.stringify({ error: 'Invalid signature' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('[STRIPE-WEBHOOK] Event type:', event.type);

    // Credit fulfillment is session-atomic. A failed grant must not be hidden by
    // the legacy event marker: Stripe must be able to deliver this session again.
    if (['checkout.session.completed','checkout.session.async_payment_succeeded'].includes(event.type) &&
        (event.data.object as Stripe.Checkout.Session).mode==='payment' &&
        (event.data.object as Stripe.Checkout.Session).metadata?.type==='ai_video_credits') {
      try {
        if (!/^(sk|rk)_(live|test)_/.test(stripeKey)) throw new CreditPurchaseError(503,'PAYMENT_CONFIGURATION_UNAVAILABLE');
        const creditState=await fulfillCreditTopupEvent(event as any,{
          expectedLiveMode:/^(sk|rk)_live_/.test(stripeKey),
          loadSession:async id=>{
            const session=await stripe.checkout.sessions.retrieve(id);
            if(Deno.env.get('AWS_BASIC_SUBSCRIPTION_CONTRACT')==='true'){
              await requireManagedCreditWebhookSession(session,id,/^(sk|rk)_live_/.test(stripeKey),async actor=>{
                const {data,error}=await supabaseAdmin.auth.admin.getUserById(actor);
                return {user:data.user,error};
              });
            }
            return session;
          },
          loadLineItems:async id=>await stripe.checkout.sessions.listLineItems(id,{limit:2}),
          grantOnce:async grant=>{
            const {data,error}=await supabaseAdmin.rpc('grant_verified_ai_credit_purchase',grant);
            if(error)throw new CreditPurchaseError(503,'CREDIT_GRANT_REVIEW_REQUIRED');return creditBalance(data);
          },
        });
        return new Response(JSON.stringify({received:true,creditState}),{status:200,headers:{...corsHeaders,'Content-Type':'application/json'}});
      } catch (error) {
        if(error instanceof UnmanagedCreditWebhook)return new Response(JSON.stringify({received:true,creditState:'unmanaged'}),{status:200,headers:{...corsHeaders,'Content-Type':'application/json'}});
        return new Response(JSON.stringify({error:'CREDIT_FULFILLMENT_RETRY_REQUIRED'}),{status:503,headers:{...corsHeaders,'Content-Type':'application/json'}});
      }
    }

    // AWS path remains disabled until its SQL/HTTP acceptance and installation complete.
    if(Deno.env.get('AWS_BASIC_SUBSCRIPTION_CONTRACT')==='true'){
      try{
        if(!/^(sk|rk)_(live|test)_/.test(stripeKey))throw new Error('SUBSCRIPTION_CONFIGURATION_UNAVAILABLE');
        const subscriptionState=await fulfillBasicSubscriptionEvent(event as any,body,{
          expectedLiveMode:/^(sk|rk)_live_/.test(stripeKey),
          loadCheckout:async id=>await stripe.checkout.sessions.retrieve(id),
          loadSubscription:async id=>await stripe.subscriptions.retrieve(id),
          loadInvoice:async id=>await stripe.invoices.retrieve(id),
          loadInvoiceLines:async id=>await stripe.invoices.listLineItems(id,{limit:2}),
          findActor:async customer=>{
            const {data,error}=await supabaseAdmin.from('profiles').select('id').eq('stripe_customer_id',customer).limit(2);
            if(error||!Array.isArray(data)||data.length>1)throw new Error('SUBSCRIPTION_ACTOR_LOOKUP_UNAVAILABLE');
            return data.length===1?data[0].id:null;
          },
          apply:async args=>{const {data,error}=await supabaseAdmin.rpc('apply_verified_basic_subscription_event',args);if(error)throw new Error('SUBSCRIPTION_APPLY_RETRY_REQUIRED');return data;},
        });
        // AWS mode owns only the reviewed credit/Basic paths; never enter legacy side effects.
        return new Response(JSON.stringify({received:true,subscriptionState}),{status:200,headers:{...corsHeaders,'Content-Type':'application/json'}});
      }catch{return new Response(JSON.stringify({error:'SUBSCRIPTION_FULFILLMENT_RETRY_REQUIRED'}),{status:503,headers:{...corsHeaders,'Content-Type':'application/json'}});}
    }

    // Idempotency guard — Stripe retries deliver the same event.id.
    if (await isDuplicateStripeEvent(event.id, event.type, { livemode: event.livemode })) {
      return new Response(JSON.stringify({ received: true, duplicate: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // === Launch Radar: Umsatz-Signal an die Plattform-Adresse ===
    // Rein beobachtend, wirft nie und verändert keine Geschäftslogik.
    await notifyRevenueEvent(event, stripe, getPlanFromProductId);



    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      const customerId = session.customer as string;
      
      console.log('[STRIPE-WEBHOOK] Processing checkout session:', { customerId, sessionId: session.id });

      // Get subscription from the session
      if (session.subscription) {
        const subscription = await stripe.subscriptions.retrieve(session.subscription as string);
        const productId = subscription.items.data[0]?.price.product as string;
        const plan = getPlanFromProductId(productId);
        const credits = getCreditsForPlan(plan);

        console.log('[STRIPE-WEBHOOK] Subscription found:', { productId, plan, credits });

        // Find user by customer email
        const customer = await stripe.customers.retrieve(customerId) as Stripe.Customer;
        const email = customer.email;

        if (!email) {
          console.error('[STRIPE-WEBHOOK] No email found for customer');
          return new Response(JSON.stringify({ error: 'No email' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // Get user by email
        const { data: { users }, error: usersError } = await supabaseAdmin.auth.admin.listUsers();
        const user = users?.find(u => u.email === email);

        if (!user) {
          console.error('[STRIPE-WEBHOOK] User not found for email:', email);
          return new Response(JSON.stringify({ error: 'User not found' }), {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        console.log('[STRIPE-WEBHOOK] Updating user from checkout:', user.id);

        // Update profiles.plan
        const { error: profileError } = await supabaseAdmin
          .from('profiles')
          .update({ plan })
          .eq('id', user.id);

        if (profileError) {
          console.error('[STRIPE-WEBHOOK] Profile update error:', profileError);
        }

        // Update wallets
        const { error: walletError } = await supabaseAdmin
          .from('wallets')
          .update({ 
            plan_code: plan,
            monthly_credits: credits,
            balance: credits,
            updated_at: new Date().toISOString()
          })
          .eq('user_id', user.id);

        if (walletError) {
          console.error('[STRIPE-WEBHOOK] Wallet update error:', walletError);
          return new Response(JSON.stringify({ error: 'Failed to update wallet' }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        console.log('[STRIPE-WEBHOOK] Successfully updated plan from checkout to:', plan, 'with', credits, 'credits');

        // === v411: Gutschein-Einlösung als angewendet markieren ===
        try {
          const redemptionId = session.metadata?.promo_redemption_id;
          if (redemptionId) {
            const { data: applied } = await supabaseAdmin
              .from('promo_redemptions')
              .update({ status: 'applied', stripe_session_id: session.id, applied_at: new Date().toISOString() })
              .eq('id', redemptionId)
              .eq('status', 'reserved')
              .select('promo_code_id')
              .maybeSingle();
            if (applied?.promo_code_id) {
              const { data: pc } = await supabaseAdmin
                .from('promo_codes')
                .select('redemptions_count')
                .eq('id', applied.promo_code_id)
                .maybeSingle();
              await supabaseAdmin
                .from('promo_codes')
                .update({ redemptions_count: (pc?.redemptions_count ?? 0) + 1 })
                .eq('id', applied.promo_code_id);
            }
          }
        } catch (e) {
          console.error('[STRIPE-WEBHOOK] promo redemption update failed:', e);
        }

        
        // Track payment completion in PostHog
        await trackBusinessEvent('payment_completed', user.id, {
          amount: (session.amount_total || 0) / 100,
          currency: session.currency,
          plan: plan,
          stripe_customer_id: customerId,
          stripe_subscription_id: session.subscription,
        });

        // === v403: Kauf-Willkommensmail (idempotent über session.id) ===
        try {
          const { data: prof } = await supabaseAdmin
            .from('profiles')
            .select('language')
            .eq('id', user.id)
            .maybeSingle();

          const { subject, html } = renderPurchaseWelcomeEmail({
            lang: normalizeLifecycleLang(prof?.language as string | null),
            appUrl: APP_URL,
            userEmail: email,
          });

          const welcomeResult = await sendEmail({
            to: email,
            subject,
            html,
            template: `purchase_welcome:${session.id}`,
            category: 'transactional',
            replyTo: 'info@useadtool.ai',
          });
          if (!welcomeResult.ok && !welcomeResult.skipped) {
            console.error('[STRIPE-WEBHOOK] Welcome email failed:', welcomeResult.error);
          }
        } catch (welcomeError) {
          console.error('[STRIPE-WEBHOOK] Welcome email error:', welcomeError);
        }


        
        // Track referral if promo code was used
        if (session.promotion_code) {
          try {
            const promoCodeId = typeof session.promotion_code === 'string' 
              ? session.promotion_code 
              : session.promotion_code.id;
            
            const promoCode = await stripe.promotionCodes.retrieve(promoCodeId);
            
            // Check if this is an affiliate promo code
            const { data: promoCodeData } = await supabaseAdmin
              .from('promo_codes')
              .select('id, affiliate_id, code, redemptions_count')
              .eq('stripe_promo_id', promoCode.id)
              .single();
            
            if (promoCodeData?.affiliate_id) {
              console.log(`[STRIPE-WEBHOOK] Creating referral for affiliate ${promoCodeData.affiliate_id}`);
              
              // Create referral record
              await supabaseAdmin.from('referrals').insert({
                affiliate_id: promoCodeData.affiliate_id,
                customer_id: customerId,
                subscription_id: session.subscription,
                promo_code_id: promoCodeData.id,
                status: 'active'
              });
              
              // Increment redemption count
              await supabaseAdmin
                .from('promo_codes')
                .update({ redemptions_count: (promoCodeData.redemptions_count || 0) + 1 })
                .eq('id', promoCodeData.id);
              
              console.log(`[STRIPE-WEBHOOK] Referral created successfully`);
            }
          } catch (referralError) {
            console.error('[STRIPE-WEBHOOK] Error creating referral:', referralError);
            // Don't fail the webhook if referral tracking fails
          }
        }
      }


    }


    if (event.type === 'customer.subscription.created' || event.type === 'customer.subscription.updated') {
      const subscription = event.data.object as Stripe.Subscription;
      const customerId = subscription.customer as string;
      const productId = subscription.items.data[0]?.price.product as string;
      const plan = getPlanFromProductId(productId);
      const credits = getCreditsForPlan(plan);

      console.log('[STRIPE-WEBHOOK] Processing subscription:', { customerId, productId, plan, credits, eventType: event.type });

      // Handle workspace-level Enterprise subscriptions
      if (subscription.metadata?.workspace_id) {
        const workspaceId = subscription.metadata.workspace_id;
        const currency = subscription.metadata?.currency || "EUR";
        const quantity = subscription.items.data[0]?.quantity || 1;
        
        console.log('[STRIPE-WEBHOOK] Enterprise workspace subscription:', { workspaceId, quantity, currency });
        
        // Update workspace
        await supabaseAdmin
          .from("workspaces")
          .update({
            is_enterprise: true,
            stripe_customer_id: customerId,
            stripe_subscription_id: subscription.id,
            member_currency: currency,
            max_members: quantity,
          })
          .eq("id", workspaceId);

        // Create or update workspace subscription record
        await supabaseAdmin
          .from("workspace_subscriptions")
          .upsert({
            workspace_id: workspaceId,
            stripe_subscription_id: subscription.id,
            stripe_customer_id: customerId,
            status: subscription.status,
            plan_type: "enterprise",
            base_seats: 1,
            additional_seats: Math.max(quantity - 1, 0),
            total_amount: subscription.items.data[0]?.price?.unit_amount ? 
              (subscription.items.data[0].price.unit_amount / 100) * quantity : 49.99,
            currency: currency,
            current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
            current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
          });

        console.log('[STRIPE-WEBHOOK] Enterprise subscription updated for workspace:', workspaceId);
        return new Response(JSON.stringify({ received: true }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Find user by customer email
      const customer = await stripe.customers.retrieve(customerId) as Stripe.Customer;
      const email = customer.email;

      if (!email) {
        console.error('[STRIPE-WEBHOOK] No email found for customer');
        return new Response(JSON.stringify({ error: 'No email' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Get user by email
      const { data: { users }, error: usersError } = await supabaseAdmin.auth.admin.listUsers();
      const user = users?.find(u => u.email === email);

      if (!user) {
        console.error('[STRIPE-WEBHOOK] User not found for email:', email);
        return new Response(JSON.stringify({ error: 'User not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      console.log('[STRIPE-WEBHOOK] Updating user:', user.id);

      // Update profiles.plan
      const { error: profileError } = await supabaseAdmin
        .from('profiles')
        .update({ plan })
        .eq('id', user.id);

      if (profileError) {
        console.error('[STRIPE-WEBHOOK] Profile update error:', profileError);
      }

      // Update wallets: plan_code, monthly_credits, and immediately grant new balance
      // Note: We don't update last_reset_at here to allow users full credit period until next monthly reset
      const { error: walletError } = await supabaseAdmin
        .from('wallets')
        .update({ 
          plan_code: plan,
          monthly_credits: credits,
          balance: credits, // Immediately grant full credits on plan change/creation
          updated_at: new Date().toISOString()
        })
        .eq('user_id', user.id);

      if (walletError) {
        console.error('[STRIPE-WEBHOOK] Wallet update error:', walletError);
        return new Response(JSON.stringify({ error: 'Failed to update wallet' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      console.log('[STRIPE-WEBHOOK] Successfully updated plan to:', plan, 'with', credits, 'credits');
    }

    if (event.type === 'customer.subscription.deleted') {
      const subscription = event.data.object as Stripe.Subscription;
      const customerId = subscription.customer as string;

      console.log('[STRIPE-WEBHOOK] Processing subscription deletion:', { customerId });

      // Handle workspace-level subscription cancellation
      if (subscription.metadata?.workspace_id) {
        const workspaceId = subscription.metadata.workspace_id;
        
        console.log('[STRIPE-WEBHOOK] Cancelling enterprise workspace subscription:', workspaceId);
        
        // Downgrade workspace
        await supabaseAdmin
          .from("workspaces")
          .update({
            is_enterprise: false,
            stripe_subscription_id: null,
            max_members: 1,
          })
          .eq("id", workspaceId);

        // Update workspace subscription record
        await supabaseAdmin
          .from("workspace_subscriptions")
          .update({ status: "cancelled" })
          .eq("workspace_id", workspaceId);

        console.log('[STRIPE-WEBHOOK] Enterprise subscription cancelled for workspace:', workspaceId);
        return new Response(JSON.stringify({ received: true }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const customer = await stripe.customers.retrieve(customerId) as Stripe.Customer;
      const email = customer.email;

      if (email) {
        const { data: { users } } = await supabaseAdmin.auth.admin.listUsers();
        const user = users?.find(u => u.email === email);

        if (user) {
          // Revoke founders status when the paid subscription ends
          try {
            await supabaseAdmin.rpc('revoke_founder_status', {
              _user_id: user.id,
              _reason: 'subscription_cancelled',
            });
            console.log('[STRIPE-WEBHOOK] Revoked founders status:', user.id);
          } catch (e) {
            console.error('[STRIPE-WEBHOOK] Failed to revoke founders status:', e);
          }

          // Downgrade to free plan
          await supabaseAdmin.from('profiles').update({ plan: 'free' }).eq('id', user.id);
          await supabaseAdmin
            .from('wallets')
            .update({ 
              plan_code: 'free',
              monthly_credits: 100,
              balance: 100,
              updated_at: new Date().toISOString()
            })
            .eq('user_id', user.id);

          console.log('[STRIPE-WEBHOOK] Downgraded to free plan:', user.id);
          
          // Mark referral as cancelled if exists
          try {
            await supabaseAdmin
              .from('referrals')
              .update({ status: 'cancelled', ended_at: new Date().toISOString() })
              .eq('subscription_id', subscription.id)
              .eq('status', 'active');
          } catch (error) {
            console.error('[STRIPE-WEBHOOK] Error updating referral status:', error);
          }
        }
      }
    }
    
    // Handle invoice.paid for affiliate commissions
    if (event.type === 'invoice.paid') {
      const invoice = event.data.object as Stripe.Invoice;
      console.log('[STRIPE-WEBHOOK] Processing invoice.paid:', invoice.id);
      
      // Check if this invoice has an active referral for commission
      try {
        const { data: referral } = await supabaseAdmin
          .from('referrals')
          .select('id, affiliate_id, started_at')
          .eq('subscription_id', invoice.subscription)
          .eq('status', 'active')
          .single();
        
        if (referral) {
          // Check if referral is still within commission period (12 months)
          const startedAt = new Date(referral.started_at);
          const now = new Date();
          const monthsElapsed = (now.getTime() - startedAt.getTime()) / (1000 * 60 * 60 * 24 * 30);
          
          if (monthsElapsed < 12) {
            // Calculate commission (20% of paid amount)
            const commissionCents = Math.round(invoice.amount_paid * 0.20);
            
            console.log(`[STRIPE-WEBHOOK] Creating payout for affiliate ${referral.affiliate_id}: ${commissionCents} cents`);
            
            // Create payout record
            await supabaseAdmin.from('payouts').insert({
              affiliate_id: referral.affiliate_id,
              referral_id: referral.id,
              amount_cents: commissionCents,
              currency: invoice.currency.toUpperCase(),
              invoice_id: invoice.id,
              period_start: new Date(invoice.period_start * 1000).toISOString().split('T')[0],
              period_end: new Date(invoice.period_end * 1000).toISOString().split('T')[0],
              status: 'accrued'
            });
            
            console.log(`[STRIPE-WEBHOOK] Payout created successfully`);
          } else {
            console.log(`[STRIPE-WEBHOOK] Referral expired (${monthsElapsed.toFixed(1)} months elapsed)`);
          }
        }
      } catch (commissionError) {
        console.error('[STRIPE-WEBHOOK] Error processing commission:', commissionError);
        // Don't fail the webhook if commission fails
      }

      // === Send branded receipt email to customer ===
      // Idempotent via deterministic template tag using invoice.id; Resend log dedupes by template.
      try {
        const customerEmail = invoice.customer_email
          || (invoice.customer_address?.email)
          || null;

        if (customerEmail) {
          const customerName = invoice.customer_name || customerEmail.split('@')[0];
          const amount = ((invoice.amount_paid || 0) / 100).toFixed(2);
          const currency = (invoice.currency || 'eur').toUpperCase();
          const invoiceNumber = invoice.number || invoice.id;
          const periodStart = invoice.period_start
            ? new Date(invoice.period_start * 1000).toLocaleDateString()
            : '';
          const periodEnd = invoice.period_end
            ? new Date(invoice.period_end * 1000).toLocaleDateString()
            : '';
          const hostedUrl = invoice.hosted_invoice_url || '';
          const pdfUrl = invoice.invoice_pdf || '';

          const receiptHtml = `<!DOCTYPE html>
<html><head><meta charset="utf-8" /><style>
  body { font-family: -apple-system, "Segoe UI", Arial, sans-serif; line-height: 1.6; color: #111; background:#f9fafb; margin:0; padding:0; }
  .container { max-width: 600px; margin: 0 auto; padding: 24px; }
  .header { background: linear-gradient(135deg, #050816, #1a1a2e); color: #F5C76A; padding: 32px; border-radius: 10px 10px 0 0; text-align: center; }
  .content { background: #ffffff; padding: 32px; border: 1px solid #e5e7eb; }
  .footer { background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; border-top: 0; border-radius: 0 0 10px 10px; text-align: center; color: #6b7280; font-size: 12px; }
  .amount { font-size: 36px; font-weight: 700; color:#F5C76A; margin: 8px 0; }
  .meta { background:#f9fafb; padding:18px; border-radius:8px; margin:20px 0; border-left:4px solid #F5C76A; font-size:14px; }
  .meta strong { color:#050816; }
  .btn { display:inline-block; background:linear-gradient(135deg, #F5C76A, #d4a84a); color:#050816 !important; padding:14px 28px; border-radius:8px; text-decoration:none; font-weight:700; margin:8px 4px; font-size:14px; }
  .btn-secondary { display:inline-block; background:#fff; color:#050816 !important; padding:14px 28px; border-radius:8px; text-decoration:none; font-weight:600; margin:8px 4px; border:1px solid #e5e7eb; font-size:14px; }
</style></head><body>
  <div class="container">
    <div class="header">
      <h1 style="margin:0; font-family: Georgia, serif;">Payment received</h1>
      <div class="amount">${amount} ${currency}</div>
      <p style="margin:0; opacity:0.85; color:#fff;">Thank you for your payment</p>
    </div>
    <div class="content">
      <p>Hi ${customerName},</p>
      <p>We've received your payment. Your invoice is attached as a PDF and also available below.</p>
      <div class="meta">
        <strong>Invoice:</strong> ${invoiceNumber}<br/>
        <strong>Amount paid:</strong> ${amount} ${currency}<br/>
        ${periodStart && periodEnd ? `<strong>Period:</strong> ${periodStart} – ${periodEnd}<br/>` : ''}
        <strong>Date:</strong> ${new Date().toLocaleDateString()}
      </div>
      <div style="text-align:center; margin:28px 0;">
        ${pdfUrl ? `<a href="${pdfUrl}" class="btn">Download invoice (PDF)</a>` : ''}
        ${hostedUrl ? `<a href="${hostedUrl}" class="btn-secondary">View online</a>` : ''}
      </div>
      <p style="color:#6b7280; font-size:13px; margin-top:24px;">
        If you have any questions about this payment, just reply to this email or contact us at
        <a href="mailto:info@useadtool.ai" style="color:#050816;">info@useadtool.ai</a>.
      </p>
      <p>Best regards,<br/><strong>The AdTool AI Team</strong></p>
    </div>
    <div class="footer">
      <p>This receipt was issued for invoice ${invoiceNumber}.</p>
      <p>© ${new Date().getFullYear()} AdTool AI. All rights reserved.</p>
    </div>
  </div>
</body></html>`;

          const result = await sendEmail({
            to: customerEmail,
            subject: `Receipt for ${amount} ${currency} — Invoice ${invoiceNumber}`,
            html: receiptHtml,
            template: `payment_receipt:${invoice.id}`,
            category: "transactional",
            replyTo: "info@useadtool.ai",
          });

          if (!result.ok && !result.skipped) {
            console.error('[STRIPE-WEBHOOK] Receipt email failed:', result.error);
          } else {
            console.log('[STRIPE-WEBHOOK] Receipt email sent to', customerEmail);
          }
        } else {
          console.warn('[STRIPE-WEBHOOK] No customer_email on invoice', invoice.id, '— receipt skipped');
        }
      } catch (receiptError) {
        console.error('[STRIPE-WEBHOOK] Receipt email error:', receiptError);
        // Never fail the webhook because of a receipt email
      }
    }

    // === v403 Dunning: fehlgeschlagene Zahlung ===
    if (event.type === 'invoice.payment_failed') {
      const invoice = event.data.object as Stripe.Invoice;
      console.log('[STRIPE-WEBHOOK] Processing invoice.payment_failed:', invoice.id);
      try {
        const customerEmail = invoice.customer_email
          || (invoice.customer_address?.email)
          || null;

        if (customerEmail) {
          const { data: prof } = await supabaseAdmin
            .from('profiles')
            .select('language')
            .eq('email', customerEmail)
            .maybeSingle();

          const attempt = invoice.attempt_count || 1;
          const { subject, html } = renderPaymentFailedEmail({
            lang: normalizeLifecycleLang(prof?.language as string | null),
            appUrl: APP_URL,
            userEmail: customerEmail,
            hostedInvoiceUrl: invoice.hosted_invoice_url,
          });

          // Idempotent pro Rechnung UND Versuch: Stripe wiederholt automatisch,
          // jeder neue Versuch erzeugt genau eine weitere Erinnerung.
          const result = await sendEmail({
            to: customerEmail,
            subject,
            html,
            template: `payment_failed:${invoice.id}:${attempt}`,
            category: 'transactional',
            replyTo: 'info@useadtool.ai',
          });
          if (!result.ok && !result.skipped) {
            console.error('[STRIPE-WEBHOOK] Dunning email failed:', result.error);
          } else {
            console.log('[STRIPE-WEBHOOK] Dunning email sent to', customerEmail, 'attempt', attempt);
          }
        } else {
          console.warn('[STRIPE-WEBHOOK] No customer_email on failed invoice', invoice.id);
        }
      } catch (dunningError) {
        console.error('[STRIPE-WEBHOOK] Dunning email error:', dunningError);
      }
    }

    // === Stripe-Erstattung: gekauftes AI-Guthaben anteilig zurückbuchen ===
    if (event.type === 'charge.refunded' || event.type === 'charge.refund.updated') {
      try {
        let charge: Stripe.Charge | null = null;
        let refundId: string | null = null;
        let refundedMinor = 0;

        if (event.type === 'charge.refunded') {
          charge = event.data.object as Stripe.Charge;
          const latest = charge.refunds?.data?.[0];
          refundId = latest?.id ?? `charge:${charge.id}`;
          refundedMinor = charge.amount_refunded ?? 0;
        } else {
          const refund = event.data.object as Stripe.Refund;
          if (refund.status !== 'succeeded') {
            console.log('[STRIPE-WEBHOOK] Refund not succeeded, skipping:', refund.id, refund.status);
            return new Response(JSON.stringify({ received: true }), {
              status: 200,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }
          refundId = refund.id;
          const chargeId = typeof refund.charge === 'string' ? refund.charge : refund.charge?.id;
          if (chargeId) charge = await stripe.charges.retrieve(chargeId);
          // Immer der KUMULATIVE Erstattungsbetrag der Zahlung, nie der Einzelbetrag:
          // die RPC verrechnet gegen bereits zurückgebuchte Beträge.
          refundedMinor = charge?.amount_refunded ?? refund.amount ?? 0;
        }

        const paymentIntentId = typeof charge?.payment_intent === 'string'
          ? charge.payment_intent
          : charge?.payment_intent?.id;

        if (!paymentIntentId) {
          console.warn('[STRIPE-WEBHOOK] Refund without payment_intent, nothing to reverse:', refundId);
        } else {
          const sessions = await stripe.checkout.sessions.list({ payment_intent: paymentIntentId, limit: 1 });
          const session = sessions.data[0];

          if (!session) {
            console.warn('[STRIPE-WEBHOOK] No checkout session for refunded payment intent:', paymentIntentId);
          } else if (session.mode === 'subscription') {
            // Abo-Erstattungen berühren die Credit-Wallet nicht; Stripe/Portal steuert das Abo.
            console.log('[STRIPE-WEBHOOK] Subscription refund — no wallet reversal:', session.id);
          } else {
            const { data: reversal, error: reversalError } = await supabaseAdmin.rpc(
              'stripe_revoke_ai_video_credits_for_refund',
              {
                p_stripe_session_id: session.id,
                p_refund_id: refundId,
                p_refund_amount_minor: refundedMinor,
                p_charge_amount_minor: charge?.amount ?? 0,
              },
            );

            if (reversalError) {
              console.error('[STRIPE-WEBHOOK] Credit reversal failed:', reversalError);
              // Idempotenz-Marker lösen, damit Stripes Wiederholung erneut greift.
              await supabaseAdmin.from('stripe_webhook_events').delete().eq('event_id', event.id);
              return new Response(JSON.stringify({ error: 'Credit reversal failed' }), {
                status: 500,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              });
            }

            console.log('[STRIPE-WEBHOOK] Credit reversal result:', reversal);
          }
        }
      } catch (refundError) {
        console.error('[STRIPE-WEBHOOK] Refund handling error:', refundError);
        await supabaseAdmin.from('stripe_webhook_events').delete().eq('event_id', event.id);
        return new Response(JSON.stringify({ error: 'Refund handling error' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }



    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[STRIPE-WEBHOOK] Error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}));

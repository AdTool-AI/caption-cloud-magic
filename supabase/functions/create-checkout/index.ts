import {validateBillingCheckout,founderCouponMatches} from '../_shared/billingCheckoutGuard.ts';
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import Stripe from "npm:stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.0";
import { trackBusinessEvent } from "../_shared/telemetry.ts";
import { isQaMockRequest, qaMockResponse, qaMockJson } from "../_shared/qaMock.ts";
import { tl } from "../_shared/i18n.ts";
import {
  FOUNDERS_CREDIT_COUPON,
  FOUNDERS_SLOT_MARKER,
  LAUNCH_SLOT_MARKER,
  FOUNDERS_MAX_SLOTS,
  PRO_PRICE_IDS,
  STRIPE_API_VERSION,
} from "../_shared/stripe-config.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS, PUT, DELETE, PATCH",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-qa-mock",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  const checkoutDenied=await validateBillingCheckout(req,'subscription',Deno.env.get('APP_URL'));
  if(checkoutDenied)return checkoutDenied;


  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");

    const { priceId, promoCode, applyIntro, couponId, locale } = await req.json();
    // Stripe Checkout must speak the UI language, not the browser locale.
    const checkoutLocale: "en" | "de" | "es" =
      locale === "de" ? "de" : locale === "es" ? "es" : "en";
    if (!priceId) throw new Error("Price ID is required");

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } },
    );
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user || user.role!=="authenticated" || user.is_anonymous) return new Response(JSON.stringify({error:"UNAUTHORIZED"}),{status:401,headers:{...corsHeaders,"Content-Type":"application/json"}});

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: STRIPE_API_VERSION,
    });

    console.log(`Checkout: user=${user.id} price=${priceId} promo=${promoCode || "none"} coupon=${couponId || "auto"}`);

    // Find or create Stripe customer
    const { data: profile } = await supabaseClient
      .from("profiles")
      .select("stripe_customer_id")
      .eq("id", user.id)
      .single();

    let customerId = profile?.stripe_customer_id;
    if (customerId) {
      try {
        await stripe.customers.retrieve(customerId);
      } catch {
        customerId = null;
      }
    }
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { userId: user.id },
      });
      customerId = customer.id;
      const {error:customerLinkError}=await supabaseAdmin
        .from("profiles")
        .update({ stripe_customer_id: customerId })
        .eq("id", user.id);
      if(customerLinkError)throw new Error("Customer profile link unavailable");
    }

    // === Founders-Slot ===
    // Es gibt genau EIN Abomodell (Beta-Basic 14,99 €) — auf das Abo wird NIE
    // automatisch ein Rabatt angewendet. Der Slot-Claim markiert lediglich den
    // Founder-Status; der Vorteil (20 % auf jeden Credit-Kauf, 24 Monate) wird
    // in `ai-video-purchase-credits` über FOUNDERS_CREDIT_COUPON angewendet.
    // `couponId`/`promoCode` bleiben für manuelle Support-Fälle möglich.
    // v411: Gutschein-Einlösung des Nutzers (reserviert) laden.
    // Gutschein-Checkouts beanspruchen KEINEN Founders-Slot.
    const { data: reservation } = await supabaseAdmin
      .from("promo_redemptions")
      .select("id, code, promo_code_id, status")
      .eq("user_id", user.id)
      .eq("status", "reserved")
      .maybeSingle();

    let reservedPromotionCode: string | null = null;
    if (reservation) {
      const { data: promoRow } = await supabaseAdmin
        .from("promo_codes")
        .select("stripe_promo_id, active, valid_until")
        .eq("id", reservation.promo_code_id)
        .maybeSingle();
      const valid = promoRow && promoRow.active !== false &&
        (!promoRow.valid_until || new Date(promoRow.valid_until).getTime() > Date.now());
      if (valid) reservedPromotionCode = promoRow!.stripe_promo_id as string;
    }

    let foundersSlotReserved = false;
    let foundersSlotNumber: number | null = null;

    if (PRO_PRICE_IDS.has(priceId) && !reservedPromotionCode) {
      // Atomic slot claim via SQL function (advisory lock prevents races)
      const { data: claim, error: claimErr } = await supabaseAdmin.rpc("claim_founders_slot", {
        _user_id: user.id,
        _stripe_customer_id: customerId,
        _founders_coupon: FOUNDERS_SLOT_MARKER,
        _launch_coupon: LAUNCH_SLOT_MARKER,
        _max_slots: FOUNDERS_MAX_SLOTS,
      });

      if (claimErr) {
        console.error("claim_founders_slot failed:", claimErr.message);
        // Fail open: checkout proceeds regardless
      } else {
        const row = Array.isArray(claim) ? claim[0] : claim;
        foundersSlotReserved = !!row?.is_founder;
        foundersSlotNumber = row?.slot_number ?? null;
        console.log(
          `Slot claimed: founder=${foundersSlotReserved} slot=${foundersSlotNumber}`,
        );
        if (foundersSlotReserved && foundersSlotNumber) {
          await trackBusinessEvent("founders_slot_claimed", user.id, {
            slot_number: foundersSlotNumber,
            max_slots: FOUNDERS_MAX_SLOTS,
            credit_coupon: FOUNDERS_CREDIT_COUPON,
          });
        }
      }
    }

    const sessionOptions: Stripe.Checkout.SessionCreateParams = {
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      mode: "subscription",
      locale: checkoutLocale,
      // Aktive Methoden im Stripe-Dashboard: Card, PayPal, Link, SEPA, Klarna, iDEAL, etc.
      // Apple Pay & Google Pay laufen automatisch über 'card' (Domain verifiziert).
      // Zahlungsarten kommen aus den Stripe-Dashboard-Einstellungen (automatic payment methods).
      // Hartes Setzen von "paypal" ließ den Checkout mit 500 fehlschlagen, wenn die Methode
      // für Währung/Land nicht aktiviert ist.
      // Sammle Rechnungsadresse + Name, damit Stripe-Rechnungen korrekt ausgestellt werden
      // und SEPA-/PayPal-Mandate für wiederkehrende Zahlungen sauber angelegt werden.
      // Stripe sendet die finalisierte Rechnung danach automatisch per E-Mail an den Kunden
      // (zusätzlich verschicken wir aus dem Webhook eine gebrandete Quittung).
      billing_address_collection: "required",
      customer_update: { address: "auto", name: "auto" },
      subscription_data: {
        description: "AdTool AI Beta-Basic Subscription",
        metadata: {
          userId: user.id,
          ...(couponId ? { applied_coupon: couponId } : {}),
          ...(foundersSlotReserved ? { founders_slot: "true" } : {}),
          ...(reservedPromotionCode && reservation ? { promo_redemption_id: reservation.id } : {}),
        },
      },
      success_url: `${req.headers.get("origin") || Deno.env.get("SITE_URL")}/welcome?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${req.headers.get("origin") || Deno.env.get("SITE_URL")}/pricing?canceled=true`,
      metadata: {
        userId: user.id,
        ...(couponId ? { applied_coupon: couponId } : {}),
        ...(foundersSlotReserved ? { founders_slot: "true" } : {}),
        ...(reservedPromotionCode && reservation ? { promo_redemption_id: reservation.id } : {}),
      },
    };

    // Stripe erwartet unter `promotion_code` die ID (promo_…), NICHT den
    // sichtbaren Code. Codes aus der URL (?coupon=XYZ) müssen deshalb zuerst
    // aufgelöst werden — sonst bricht der Checkout mit einem 500er ab.
    let resolvedPromotionCode: string | null = reservedPromotionCode;
    if (!resolvedPromotionCode && promoCode) {
      const raw = String(promoCode).trim();
      if (raw.startsWith("promo_")) {
        resolvedPromotionCode = raw;
      } else {
        try {
          const found = await stripe.promotionCodes.list({
            code: raw.toUpperCase(),
            active: true,
            limit: 1,
          });
          resolvedPromotionCode = found.data[0]?.id ?? null;
          if (!resolvedPromotionCode) {
            console.warn(`Unknown promotion code, continuing without discount: ${raw}`);
          }
        } catch (lookupError) {
          console.error("Promotion code lookup failed:", lookupError);
        }
      }
    }

    if (resolvedPromotionCode) {
      sessionOptions.discounts = [{ promotion_code: resolvedPromotionCode }];
    } else if (couponId) {
      sessionOptions.discounts = [{ coupon: couponId }];
    }


    const session = await stripe.checkout.sessions.create(sessionOptions);

    await trackBusinessEvent("checkout_session_created", user.id, {
      price_id: priceId,
      coupon: couponId ?? null,
      promo_code: promoCode || null,
      founders_slot_reserved: foundersSlotReserved,
      session_id: session.id,
    });

    return new Response(
      JSON.stringify({
        url: session.url,
        applied_coupon: couponId ?? (resolvedPromotionCode ? (promoCode || reservation?.code || null) : null),
      }),

      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
    );
  } catch (error) {
    console.error("Checkout error:", error);
    const isStripeMethodError = error instanceof Error &&
      /payment_method|payment method|not available|not supported|currency/i.test(error.message);
    const status = isStripeMethodError ? 400 : 500;
    const message = isStripeMethodError
      ? tl({
          de: "Die gewählte Zahlungsart ist für diese Währung oder Region nicht verfügbar. Bitte versuche es mit einer anderen Methode.",
          en: "The selected payment method is not available for this currency or region. Please try another method.",
          es: "El método de pago seleccionado no está disponible para esta moneda o región. Por favor, prueba con otro método.",
        })
      : (error instanceof Error ? error.message : "Failed to create checkout session");
    return new Response(
      JSON.stringify({ error: message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status },
    );
  }
});

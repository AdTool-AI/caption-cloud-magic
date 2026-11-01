export type PaymentCurrency = 'EUR' | 'USD' | 'GBP';

export interface PurchaseRequest {
  packId: 'starter' | 'standard' | 'pro' | 'enterprise';
  currency: PaymentCurrency;
}

// Credit packs — die Gutschrift hängt AUSSCHLIESSLICH am Paket, nie an der
// Zahlungswährung oder am gezahlten Betrag. Ein Kauf in EUR, USD oder GBP
// schreibt exakt dieselbe Credit-Menge gut.
// (Mirror von src/config/aiVideoCredits.ts.)
export const CREDIT_PACKS = {
  starter: { price: 10.00, credits: 9.00, bonus: 0, bonusPercent: 0 },
  standard: { price: 50.00, credits: 50.00, bonus: 1.00, bonusPercent: 2 },
  pro: { price: 100.00, credits: 100.00, bonus: 6.00, bonusPercent: 6 },
  enterprise: { price: 250.00, credits: 250.00, bonus: 37.50, bonusPercent: 15 },
} as const;

// Stripe Price IDs — Konto „AdTool AI" (acct_1SLqO0DRu4kfSFxj)
export const STRIPE_PRICE_IDS: Record<PurchaseRequest['packId'], Record<PaymentCurrency, string>> = {
  starter: {
    EUR: 'price_1SWOEBDRu4kfSFxjUBaTMzcY', // 10,00 €
    USD: 'price_1UDAYsDRu4kfSFxjEnz03Hef', // $10.00
    GBP: 'price_1UDAYsDRu4kfSFxjkUZmMpGc', // £10.00
  },
  standard: {
    EUR: 'price_1SWOFXDRu4kfSFxjX6amIvWL', // 50,00 €
    USD: 'price_1UDAciDRu4kfSFxjZzvztB3n', // $50.00
    GBP: 'price_1UDAciDRu4kfSFxjBlIx9eMA', // £50.00
  },
  pro: {
    EUR: 'price_1SWOHkDRu4kfSFxjxURoJ2JP', // 100,00 €
    USD: 'price_1UDAfdDRu4kfSFxjlkHaKdkI', // $100.00
    GBP: 'price_1UDAfdDRu4kfSFxjw46PwUY4', // £100.00
  },
  enterprise: {
    EUR: 'price_1SWOJGDRu4kfSFxj03qDB5Fj', // 250,00 €
    USD: 'price_1UDAi8DRu4kfSFxj8rhhmDUK', // $250.00
    GBP: 'price_1UDAi8DRu4kfSFxjULeSYc7c', // £250.00
  },
};


import { isAwsTestBackend } from '@/lib/backendTarget';
import { tx } from '@/lib/i18nText';
import { motion } from "framer-motion";
import { Check, Crown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { useTranslation } from "@/hooks/useTranslation";
import { getCurrencyForLanguage } from "@/lib/currency";
import { CompetitorComparisonCard } from "./CompetitorComparisonCard";
import { AIVideoTopupHintCard } from "./AIVideoTopupHintCard";
import { FoundersSlotBadge } from "@/components/pricing/FoundersSlotBadge";

export const PricingSection = () => {
  const { t, language } = useTranslation();
  const currencySymbol = getCurrencyForLanguage(language) === 'USD' ? '$' : '€';

  const features = [
    t("landing.pricing.proFeatures.f1"),
    t("landing.pricing.proFeatures.f2"),
    t("landing.pricing.proFeatures.f3"),
    t("landing.pricing.proFeatures.f4"),
    t("landing.pricing.proFeatures.f5"),
    t("landing.pricing.proFeatures.f6"),
    t("landing.pricing.proFeatures.f7"),
  ];

  return (
    <section id="pricing" className="py-24 px-4 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-background via-card/30 to-background" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-primary/5 rounded-full blur-3xl" />

      <div className="container relative z-10 max-w-6xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-16"
        >
          <h2 className="font-display text-3xl md:text-4xl lg:text-5xl font-bold mb-4">
            <span className="text-foreground">{t("landing.pricing.title1")}</span>
            <span className="bg-gradient-to-r from-primary to-gold-dark bg-clip-text text-transparent">
              {t("landing.pricing.title2")}
            </span>
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto text-lg">
            {isAwsTestBackend ? tx({de:"Monatliches Abonnement. Die verfügbaren AWS-Funktionen werden schrittweise erweitert.",en:"Monthly subscription. Available AWS features are being expanded in stages.",es:"Suscripción mensual. Las funciones disponibles en AWS se amplían por etapas."}) : t("landing.pricing.subtitle")}
          </p>
        </motion.div>

        {/* Asymmetric grid: Pro card 2/3, sidebar 1/3 */}
        <div className="grid md:grid-cols-3 gap-6 md:gap-8">
          {/* Main Pro Card */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="md:col-span-2 relative group"
          >
            <div className="absolute -top-4 left-8 z-10">
              <div className="bg-gradient-to-r from-primary to-gold-dark text-primary-foreground text-xs font-bold px-4 py-1.5 rounded-full shadow-lg">
                {t("landing.pricing.badge")}
              </div>
            </div>

            <div className="relative h-full bg-card/60 backdrop-blur-xl border border-primary/50 rounded-2xl p-8 md:p-10 shadow-[var(--shadow-glow-gold)] transition-all duration-500 hover:-translate-y-1">
              <div className="grid sm:grid-cols-[auto,1fr] gap-6 sm:gap-8 items-start mb-8">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/30 to-gold-dark/20 flex items-center justify-center flex-shrink-0">
                  <Crown className="h-8 w-8 text-primary" />
                </div>
                <div>
                  <h3 className="text-2xl font-semibold text-foreground mb-1">
                    {isAwsTestBackend ? "Beta-Basic" : t("landing.pricing.singlePlanTitle")}
                  </h3>
                  <p className="text-sm text-muted-foreground mb-3 max-w-md">
                    {isAwsTestBackend ? tx({de:"Kalenderentwürfe und Planung sind verfügbar. Generierung und Veröffentlichung sind noch nicht aktiviert.",en:"Calendar drafts and planning are available. Generation and publishing are not enabled yet.",es:"Los borradores del calendario y la planificación están disponibles. La generación y publicación aún no están habilitadas."}) : t("landing.pricing.singlePlanDescription")}
                  </p>
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="text-lg text-muted-foreground/60 line-through tabular-nums">
                      {currencySymbol}29.99
                    </span>
                    <span className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-primary to-gold-dark bg-clip-text text-transparent tabular-nums">
                      {currencySymbol}14.95
                    </span>
                    <span className="text-muted-foreground">
                      {t("landing.pricing.perMonth")}
                    </span>
                  </div>
                  <div className="mt-3">
                    <FoundersSlotBadge />
                  </div>
                </div>
              </div>

              <ul className="grid sm:grid-cols-2 gap-x-6 gap-y-3 mb-8">
                {features.map((feature) => (
                  <li key={feature} className="flex items-start gap-3">
                    <Check className="h-5 w-5 mt-0.5 flex-shrink-0 text-primary" />
                    <span className="text-sm text-muted-foreground">{feature}</span>
                  </li>
                ))}
              </ul>

              <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
                <Button
                  asChild
                  size="lg"
                  className="bg-gradient-to-r from-primary to-gold-dark text-primary-foreground font-semibold shadow-[var(--shadow-glow-gold)] hover:shadow-[0_0_50px_hsla(43,90%,68%,0.5)] transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] border-0 h-12 px-8"
                >
                  <Link to={isAwsTestBackend ? "/billing" : "/pricing"}>{isAwsTestBackend ? tx({de:"Zur Abrechnung anmelden",en:"Sign in for billing",es:"Inicia sesión para facturación"}) : t("landing.pricing.start")}</Link>
                </Button>
                <p className="text-xs text-muted-foreground sm:text-right max-w-xs">
                  {isAwsTestBackend ? tx({de:"Monatliches Abonnement. Prüfe den Gesamtbetrag bei Stripe vor der Zahlung.",en:"Monthly subscription. Review the total on Stripe before paying.",es:"Suscripción mensual. Revisa el total en Stripe antes de pagar."}) : t("landing.pricing.trialNote")}
                </p>
              </div>
            </div>
          </motion.div>

          {/* Sidebar: stacked mini cards */}
          <div className="md:col-span-1 flex flex-col gap-6">
            <CompetitorComparisonCard />
            <AIVideoTopupHintCard />
          </div>
        </div>
      </div>
    </section>
  );
};

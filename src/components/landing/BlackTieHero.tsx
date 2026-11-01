import { isAwsTestBackend } from '@/lib/backendTarget';
import { tx } from '@/lib/i18nText';
import { Link } from "react-router-dom";
import { useState } from "react";
import { motion } from "framer-motion";
import { Sparkles, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/hooks/useTranslation";
import { SithCommandDeck } from "./SithCommandDeck";
import { FoundersBenefitsDialog } from "./FoundersBenefitsDialog";
import { DemoVideoDialog } from "./DemoVideoDialog";

export const BlackTieHero = () => {
  const { t } = useTranslation();
  const [foundersOpen, setFoundersOpen] = useState(false);
  const [demoOpen, setDemoOpen] = useState(false);


  return (
    <section className="relative flex items-center overflow-hidden pt-2 pb-8 md:pt-4 md:pb-12 px-4">
      {/* Background Effects */}
      <div className="absolute inset-0 bg-[var(--gradient-hero)]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,hsl(var(--background))_70%)]" />
      
      {/* Subtle Grid Pattern */}
      <div className="absolute inset-0 opacity-[0.02]" style={{
        backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px),
                          linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
        backgroundSize: '60px 60px'
      }} />

      <div className="container relative z-10 max-w-7xl mx-auto origin-top scale-[0.85] md:scale-[0.85]">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          {/* Left Column - Content */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className="text-center lg:text-left"
          >
            {/* Badge */}
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.2, duration: 0.4 }}
              className="inline-flex items-center gap-2 bg-card/50 backdrop-blur-md border border-border/50 text-primary px-4 py-2 rounded-full text-sm font-medium mb-6"
            >
              <Sparkles className="h-4 w-4" />
              <span>{t('landing.hero.badge')}</span>
            </motion.div>

            {/* Headline - Elegant Serif with Gold Gradient */}
            <h1 className="font-display text-4xl md:text-5xl lg:text-6xl xl:text-7xl font-bold mb-6 leading-[1.1]">
              <span className="bg-gradient-to-r from-primary via-gold to-gold-dark bg-clip-text text-transparent">
                {t('landing.hero.headline1')}
              </span>
              <br />
              <span className="text-foreground">
                {t('landing.hero.headline2')}
              </span>
            </h1>

            {/* Subline */}
            <p className="text-lg md:text-xl text-muted-foreground mb-4 max-w-xl mx-auto lg:mx-0 leading-relaxed">
              {t('landing.hero.subline')}
            </p>

            {/* Subtle pricing hint - service info, not a banner */}
            <Link
              to="/pricing"
              className="inline-block text-sm text-muted-foreground/70 hover:text-primary transition-colors duration-300 mb-8"
            >
              {isAwsTestBackend ? tx({de:'Beta-Basic: monatliches Abonnement. Funktionen werden schrittweise verbunden.',en:'Beta-Basic: monthly subscription. Features are being connected in stages.',es:'Beta-Basic: suscripción mensual. Las funciones se conectan por etapas.'}) : t('landing.hero.pricingHint')}
            </Link>

            {/* CTA Group */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
              <Button 
                asChild 
                size="lg" 
                className="bg-gradient-to-r from-primary to-gold-dark text-primary-foreground font-semibold shadow-[var(--shadow-glow-gold)] hover:shadow-[0_0_50px_hsla(43,90%,68%,0.5)] transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] border-0 h-12 px-8"
              >
                <Link to={isAwsTestBackend ? "/auth" : "/ai-text-studio"}>
                  {isAwsTestBackend ? t('auth.login') : t('landing.hero.ctaPrimary')}
                </Link>
              </Button>
              <Button 
                variant="outline" 
                size="lg"
                onClick={() => setDemoOpen(true)}
                className="border-primary/50 text-primary hover:bg-primary/10 hover:border-primary transition-all duration-300 h-12 px-8 backdrop-blur-sm flex items-center gap-2"
              >
                <Play className="h-4 w-4" />
                {t('landing.hero.ctaSecondary')}
              </Button>
            </div>
            <DemoVideoDialog open={demoOpen} onOpenChange={setDemoOpen} />


            {/* Stats Row — honest Beta framing, klickbar für Founders-Vorteile */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6, duration: 0.5 }}
              className="mt-12 flex flex-col items-center lg:items-start gap-2"
            >
              <button
                type="button"
                onClick={() => setFoundersOpen(true)}
                aria-label={tx({ de: 'Founders-Vorteile ansehen', en: 'View founder benefits', es: 'Ver ventajas de fundador' })}
                className="group flex items-center gap-8 rounded-2xl border border-transparent hover:border-primary/40 hover:bg-primary/5 px-6 py-3 transition-all duration-300 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
              >
                <div className="text-center">
                  <div className="text-2xl md:text-3xl font-bold text-accent tracking-widest group-hover:scale-105 transition-transform">BETA</div>
                  <div className="text-sm text-muted-foreground">{t('landing.hero.stats.creators')}</div>
                </div>
                <div className="w-px h-10 bg-border" />
                <div className="text-center">
                  <div className="text-2xl md:text-3xl font-bold text-foreground group-hover:scale-105 transition-transform">3</div>
                  <div className="text-sm text-muted-foreground">{t('landing.hero.stats.posts')}</div>
                </div>
                <div className="w-px h-10 bg-border" />
                <div className="text-center">
                  <div className="text-2xl md:text-3xl font-bold text-accent group-hover:scale-105 transition-transform">1000</div>
                  <div className="text-sm text-muted-foreground">{t('landing.hero.stats.engagement')}</div>
                </div>
              </button>
              <button
                type="button"
                onClick={() => setFoundersOpen(true)}
                className="text-xs text-primary/70 hover:text-primary transition-colors underline underline-offset-4"
              >
                {tx({ de: "→ Klicken für Founders-Vorteile", en: "→ Click for Founder benefits", es: "→ Clic para beneficios de Fundador" })}
              </button>
            </motion.div>
          </motion.div>

          <FoundersBenefitsDialog open={foundersOpen} onOpenChange={setFoundersOpen} />

          {/* Right Column - Sith Command Deck (3D Laptop) */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, delay: 0.3, ease: "easeOut" }}
            className="relative hidden lg:flex items-center justify-center"
          >
            <SithCommandDeck />
          </motion.div>
        </div>
      </div>
    </section>
  );
};

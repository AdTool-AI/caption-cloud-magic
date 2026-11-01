import { isAwsTestBackend } from '@/lib/backendTarget';
import { tx } from "@/lib/i18nText";
import { useState } from "react";
import { SEO } from "@/components/SEO";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { FeatureGuideDialog } from "@/components/onboarding/FeatureGuideDialog";
import { useTranslation } from "@/hooks/useTranslation";
import { useAuth } from "@/hooks/useAuth";

// James Bond 2028 Landing Components
import { BlackTieHero } from "@/components/landing/BlackTieHero";
import { SocialProofStrip } from "@/components/landing/SocialProofStrip";
import { MissionFeatures } from "@/components/landing/MissionFeatures";

import { AIArsenalShowcase } from "@/components/landing/AIArsenalShowcase";
import { LiveDemoShowcase } from "@/components/landing/LiveDemoShowcase";
import { UDCShowcase } from "@/components/landing/UDCShowcase";
import { InstantAvatarDemo } from "@/components/landing/InstantAvatarDemo";
// TestimonialSpotlight hidden during Beta — real testimonials pending

import { TrialPromiseStrip } from "@/components/landing/TrialPromiseStrip";
import { ProofMoment } from "@/components/landing/ProofMoment";
import { PricingSection } from "@/components/landing/PricingSection";
import { BlackTieFooter } from "@/components/landing/BlackTieFooter";
import { FAQ } from "@/components/FAQ";

const Index = () => {
  const { t, language } = useTranslation();
  const { user } = useAuth();
  const [selectedFeature, setSelectedFeature] = useState<string | null>(null);

  const faqItems = [
    { question: t('faq.questions.q1.question'), answer: t('faq.questions.q1.answer') },
    { question: t('faq.questions.q2.question'), answer: t('faq.questions.q2.answer') },
    { question: t('faq.questions.q3.question'), answer: t('faq.questions.q3.answer') },
    { question: t('faq.questions.q4.question'), answer: t('faq.questions.q4.answer') },
  ];

  // JSON-LD Strukturierte Daten für SoftwareApplication + FAQPage
  const structuredData = [
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      "name": "AdTool AI",
      "applicationCategory": "BusinessApplication",
      "offers": {
        "@type": "Offer",
        "price": "0",
        "priceCurrency": "EUR"
      },
      // aggregateRating intentionally omitted until real ratings are collected
      // (Google Search Console flags invented ratings as spammy structured data).
      "operatingSystem": "Web Browser",
      "description": tx({ de: "KI-gestützte Social Media Marketing Platform für Content-Erstellung, Planung und Analytics.", en: "AI-powered Social Media Marketing Platform for content creation, scheduling, and analytics.", es: "Plataforma de marketing en redes sociales impulsada por IA para creación de contenido, programación y análisis." }),
      "creator": {
        "@type": "Organization",
        "name": "AdTool AI"
      },
      "featureList": [
        tx({ de: "KI-gestützte Content-Generierung", en: "AI-powered Content Generation", es: "Generación de contenido con IA" }),
        "Plattform-optimierte Inhalte",
        tx({ de: "Hashtag-Vorschläge", en: "Hashtag Suggestions", es: "Sugerencias de hashtags" }),
        "Multi-Sprach-Support",
        "Brand Voice Anpassung"
      ]
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      "mainEntity": faqItems.map(item => ({
        "@type": "Question",
        "name": item.question,
        "acceptedAnswer": {
          "@type": "Answer",
          "text": item.answer
        }
      }))
    }
  ];

  return (
    <PageWrapper>
      <div className="min-h-screen flex flex-col bg-background">
        <SEO
          title={tx({ de: "Ein Creator. Ein ganzes Studio. — KI-Videoproduktion", en: "One Creator. One Whole Studio. — AI Video Production", es: "Un Creador. Todo un Estudio. — Producción de Video con IA" })}
          description={tx({ de: "Alle führenden KI-Modelle, Stimmen und präziser Lip-Sync in einem durchgängigen Workflow. Von der Idee zum fertigen Video — ohne Filmteam.", en: "All leading AI models, voices, and precise lip-sync in a continuous workflow. From idea to finished video — without a film crew.", es: "Todos los modelos de IA líderes, voces y sincronización labial precisa en un flujo de trabajo continuo. De la idea al video terminado — sin equipo de filmación." })}
          canonical="https://useadtool.ai/"
          lang={language}
          structuredData={structuredData}
          ogImage="/og-home.jpg"
        />
      
        <main className="flex-1" id="main-content">
          {isAwsTestBackend && <p className="container max-w-7xl px-4 pt-4 text-sm text-muted-foreground">{tx({de:"Produktvorschau während der AWS-Migration. Kalenderentwürfe und Planung sind verfügbar. Registrierung, Generierung und Veröffentlichung werden noch verbunden.",en:"Product preview during the AWS migration. Calendar drafts and planning are available. Registration, generation and publishing are still being connected.",es:"Vista previa durante la migración a AWS. Los borradores del calendario y la planificación están disponibles. El registro, la generación y la publicación aún se están conectando."})}</p>}
          {/* Trial Promise Strip — top of page, above hero */}
          <section className="px-4 pt-4 pb-0">
            <div className="container max-w-7xl mx-auto [&>div]:mb-0">
              <TrialPromiseStrip />
            </div>
          </section>

          {/* Hero Section - Black Tie */}
          <BlackTieHero />

          {/* Proof Moment — nur DE: Clip hat 4 deutsche Sprecher */}
          {language === 'de' && <ProofMoment />}

          {/* AI Arsenal - all integrated AI modules */}
          <AIArsenalShowcase />

          {/* Social Proof Strip */}
          <SocialProofStrip />

          {/* Mission Features - Why This Tool Wins */}
          <div id="features"><MissionFeatures /></div>

          {/* Live Demo Showcase - Before/After */}
          <LiveDemoShowcase />

          {/* Instant Avatar Try-On — interactive eyecatcher */}
          {!isAwsTestBackend && <InstantAvatarDemo />}

          {/* UDC — Consistency-First moat */}
          <UDCShowcase />


          {/* Pricing — was 14,95 € konkret enthält */}
          <PricingSection />

          {/* Testimonial Spotlight hidden during Beta — will return with real user quotes */}


          {/* FAQ Section */}
          <section id="faq" className="py-24 px-4 bg-card/30">
            <FAQ title={t('faq.title')} items={faqItems} />
          </section>
        </main>

        {/* Footer - Black Tie */}
        <BlackTieFooter />

        {/* Feature Guide Dialog */}
        <FeatureGuideDialog 
          featureId={selectedFeature}
          open={selectedFeature !== null}
          onClose={() => setSelectedFeature(null)}
        />
      </div>
    </PageWrapper>
  );
};

export default Index;

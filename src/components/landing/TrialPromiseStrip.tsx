import { isAwsTestBackend } from '@/lib/backendTarget';
import { tx } from '@/lib/i18nText';
import { motion } from "framer-motion";
import { CalendarCheck, Gift, ShieldCheck, Clock } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";

export const TrialPromiseStrip = () => {
  const { t } = useTranslation();

  const items = isAwsTestBackend ? [
    {icon:CalendarCheck,title:tx({de:"Kalender",en:"Calendar",es:"Calendario"}),desc:tx({de:"Textentwürfe erstellen und bearbeiten.",en:"Create and edit text drafts.",es:"Crea y edita borradores de texto."})},
    {icon:Gift,title:tx({de:"Planung",en:"Planning",es:"Planificación"}),desc:tx({de:"Wochenpläne und Textblöcke.",en:"Weekplans and text blocks.",es:"Planes semanales y bloques de texto."})},
    {icon:ShieldCheck,title:tx({de:"Private Medien",en:"Private media",es:"Medios privados"}),desc:tx({de:"Geschützter Zugriff auf eigene Dateien.",en:"Protected access to your files.",es:"Acceso protegido a tus archivos."})},
    {icon:Clock,title:tx({de:"Weitere Funktionen folgen",en:"More features being connected",es:"Más funciones en preparación"}),desc:tx({de:"Generierung und Veröffentlichung stehen noch aus.",en:"Generation and publishing remain pending.",es:"La generación y publicación siguen pendientes."})},
  ] : [
    {
      icon: CalendarCheck,
      title: t("landing.pricing.trialPromise.p1Title"),
      desc: t("landing.pricing.trialPromise.p1Desc"),
    },
    {
      icon: Gift,
      title: t("landing.pricing.trialPromise.p2Title"),
      desc: t("landing.pricing.trialPromise.p2Desc"),
    },
    {
      icon: ShieldCheck,
      title: t("landing.pricing.trialPromise.p3Title"),
      desc: t("landing.pricing.trialPromise.p3Desc"),
    },
    {
      icon: Clock,
      title: t("landing.pricing.trialPromise.p4Title"),
      desc: t("landing.pricing.trialPromise.p4Desc"),
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.4 }}
      className="mb-4"
    >
      <div className="relative rounded-xl border border-primary/20 bg-card/40 backdrop-blur-xl px-4 py-2.5 md:px-5 md:py-3 shadow-[0_4px_20px_-8px_hsla(43,90%,68%,0.15)]">
        <div className="absolute inset-x-0 -top-px h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />

        <div className="flex flex-col lg:flex-row lg:items-center gap-2 lg:gap-4">
          {/* Compact label */}
          <div className="flex items-center gap-1.5 lg:border-r lg:border-primary/15 lg:pr-4 flex-shrink-0">
            <span className="w-1 h-1 rounded-full bg-primary animate-pulse" />
            <h3 className="text-[10px] uppercase tracking-[0.18em] text-primary/80 font-semibold whitespace-nowrap">
              {isAwsTestBackend ? tx({de:"AWS-Vorschau",en:"AWS preview",es:"Vista previa de AWS"}) : t("landing.pricing.trialPromise.title")}
            </h3>
          </div>

          {/* Items: tighter, single row on lg+ */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-4 gap-y-2 lg:gap-x-5 flex-1">
            {items.map((item, idx) => {
              const Icon = item.icon;
              return (
                <motion.div
                  key={item.title}
                  initial={{ opacity: 0, y: 6 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.3, delay: idx * 0.05 }}
                  className="flex items-center gap-2 min-w-0"
                >
                  <div className="flex-shrink-0 w-7 h-7 rounded-lg bg-gradient-to-br from-primary/25 to-gold-dark/15 border border-primary/20 flex items-center justify-center">
                    <Icon className="h-3.5 w-3.5 text-primary" />
                  </div>
                  <div className="min-w-0 leading-tight">
                    <span className="text-xs font-semibold text-foreground">
                      {item.title}
                    </span>
                    <span className="text-[11px] text-muted-foreground ml-1.5">
                      {item.desc}
                    </span>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>
    </motion.div>
  );
};

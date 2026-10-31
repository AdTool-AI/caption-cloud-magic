import { tx } from "@/lib/i18nText";
import { useParams, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Lock, ArrowRight } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { useAuth } from "@/hooks/useAuth";
import { hubDefinitions, type HubSubItem } from "@/config/hubConfig";
import { hubCovers } from "@/config/hubCovers";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { isAwsTestBackend } from '@/lib/backendTarget';

/* ── Floating particle positions ── */
const particles = [
  { x: "10%", y: "20%", size: 4, delay: 0, dur: 6 },
  { x: "85%", y: "15%", size: 3, delay: 1.2, dur: 7 },
  { x: "70%", y: "75%", size: 5, delay: 0.5, dur: 8 },
  { x: "25%", y: "80%", size: 3, delay: 2, dur: 6.5 },
  { x: "50%", y: "10%", size: 4, delay: 0.8, dur: 7.5 },
  { x: "90%", y: "50%", size: 3, delay: 1.5, dur: 6 },
  { x: "5%", y: "55%", size: 4, delay: 0.3, dur: 8 },
];

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.09, delayChildren: 0.3 },
  },
};

const cardVariant = {
  hidden: { opacity: 0, y: 30, scale: 0.85, filter: "blur(8px)" },
  show: {
    opacity: 1,
    y: 0,
    scale: 1,
    filter: "blur(0px)",
    transition: { type: "spring" as const, stiffness: 200, damping: 20 },
  },
};

export default function HubPage() {
  const { hubKey } = useParams<{ hubKey: string }>();
  const { t } = useTranslation();
  const { user } = useAuth();
  const [userPlan, setUserPlan] = useState("free");

  useEffect(() => {
    if (user && !isAwsTestBackend) {
      supabase
        .from("profiles")
        .select("plan, test_mode_plan")
        .eq("id", user.id)
        .single()
        .then(({ data }) => {
          if (data) setUserPlan(data.test_mode_plan || data.plan);
        });
    }
  }, [user]);

  const hub = hubDefinitions.find((h) => h.key === hubKey);

  if (!hub) {
    return (
      <PageWrapper className="p-8">
        <p className="text-muted-foreground">Hub not found.</p>
      </PageWrapper>
    );
  }

  const isLocked = (item: HubSubItem) => {
    if (!item.plan) return false;
    const hierarchy: Record<string, number> = { free: 0, basic: 1, pro: 2, enterprise: 3 };
    return (hierarchy[userPlan] ?? 0) < (hierarchy[item.plan] ?? 0);
  };

  const HubIcon = hub.icon;
  const isComingSoon = !!hub.comingSoon;

  return (
    <PageWrapper className="relative p-6 md:p-10 max-w-6xl mx-auto">
      {/* ── Shimmer keyframes ── */}
      <style>{`
        @keyframes shimmer-border {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        @keyframes pulse-bg {
          0%, 100% { opacity: 0.4; transform: scale(1); }
          50% { opacity: 0.7; transform: scale(1.05); }
        }
        @keyframes glow-ring {
          0%, 100% { box-shadow: 0 0 20px hsla(43,90%,68%,0.3), 0 0 40px hsla(187,84%,55%,0.15); }
          50% { box-shadow: 0 0 30px hsla(43,90%,68%,0.5), 0 0 60px hsla(187,84%,55%,0.25); }
        }
        @keyframes draw-line {
          from { transform: scaleX(0); }
          to { transform: scaleX(1); }
        }
        .hub-card-shimmer {
          position: relative;
        }
        .hub-card-shimmer::before {
          content: '';
          position: absolute;
          inset: 0;
          border-radius: 1rem;
          padding: 1px;
          background: linear-gradient(90deg, transparent 0%, hsla(43,90%,68%,0.4) 25%, hsla(187,84%,55%,0.4) 50%, hsla(43,90%,68%,0.4) 75%, transparent 100%);
          background-size: 200% 100%;
          animation: shimmer-border 3s linear infinite;
          -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
          -webkit-mask-composite: xor;
          mask-composite: exclude;
          pointer-events: none;
          opacity: 0.5;
          transition: opacity 0.3s;
        }
        .hub-card-shimmer:hover::before {
          opacity: 1;
        }
      `}</style>

      {/* ── Animated gradient background ── */}
      <div className="absolute inset-0 pointer-events-none -z-10">
        <div
          className="absolute inset-0"
          style={{
            background: "radial-gradient(ellipse at 30% 20%, hsla(43,90%,68%,0.06) 0%, transparent 50%), radial-gradient(ellipse at 70% 80%, hsla(187,84%,55%,0.05) 0%, transparent 50%)",
            animation: "pulse-bg 6s ease-in-out infinite",
          }}
        />
      </div>

      {/* ── Floating particles ── */}
      {particles.map((p, i) => (
        <motion.div
          key={i}
          className="absolute rounded-full pointer-events-none -z-10"
          style={{
            left: p.x,
            top: p.y,
            width: p.size,
            height: p.size,
            background: i % 2 === 0
              ? "hsla(43,90%,68%,0.5)"
              : "hsla(187,84%,55%,0.5)",
          }}
          animate={{
            y: [0, -20, 0, 15, 0],
            x: [0, 10, -10, 5, 0],
            opacity: [0.3, 0.7, 0.4, 0.8, 0.3],
          }}
          transition={{
            duration: p.dur,
            delay: p.delay,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      ))}

      {/* ── Hero Header ── */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="mb-10"
      >
        <div className="flex items-center gap-5 mb-4">
          {/* Glow-ring icon */}
          <div
            className="p-4 rounded-2xl bg-card border border-border"
            style={{ animation: "glow-ring 3s ease-in-out infinite" }}
          >
            <HubIcon className="h-8 w-8 text-primary" />
          </div>
          <div>
            {/* Gradient text title */}
            <h1
              className="text-3xl md:text-4xl font-bold font-heading tracking-tight"
              style={{
                background: "linear-gradient(135deg, hsl(43 90% 68%), hsl(187 84% 55%))",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              {t(hub.titleKey)}
            </h1>
            <p className="text-muted-foreground mt-1 text-sm md:text-base">{t(hub.descKey)}</p>
          </div>
        </div>

        {/* Animated divider line */}
        <div className="h-px w-full overflow-hidden">
          <motion.div
            className="h-full"
            style={{
              background: "linear-gradient(90deg, hsla(43,90%,68%,0.6), hsla(187,84%,55%,0.6), transparent)",
              transformOrigin: "left",
            }}
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: 0.8, delay: 0.4, ease: "easeOut" }}
          />
        </div>
      </motion.div>

      {/* ── Coming Soon Banner ── */}
      {isComingSoon && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
          className="mb-6 rounded-2xl border border-amber-400/30 bg-amber-400/5 backdrop-blur-md p-5 flex items-start gap-4"
        >
          <div className="h-10 w-10 rounded-xl bg-amber-400/15 border border-amber-400/30 flex items-center justify-center text-amber-400 shrink-0">
            <Lock className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <h2 className="font-serif text-lg leading-tight">{t(hub.titleKey)} — Coming Soon</h2>
              <span className="text-[10px] uppercase tracking-widest text-amber-400 border border-amber-400/30 rounded-full px-2 py-0.5">In Vorbereitung</span>
            </div>
            <p className="text-sm text-muted-foreground">
              {tx({ de: "Dieser Bereich ist noch nicht für alle Kunden freigeschaltet. Wir polieren die letzten Integrationen und melden uns beim Launch.", en: "This area is not yet enabled for all customers. We are polishing the final integrations and will notify you at launch.", es: "Esta área aún no está habilitada para todos los clientes. Estamos puliendo las integraciones finales y te avisaremos en el lanzamiento." })}
            </p>
          </div>
        </motion.div>
      )}

      {/* ── Bento Grid ── */}
      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className={cn(
          "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 auto-rows-fr",
          isComingSoon && "opacity-60 pointer-events-none",
        )}
      >
        {hub.items.map((item) => {
          const ItemIcon = item.icon;
          const locked = isLocked(item);
          const cover = item.cover ?? hubCovers[hub.key] ?? hubCovers.erstellen;

          if (item.wide) {
            return (
              <motion.div
                key={item.route}
                variants={cardVariant}
                className="h-full sm:col-span-2 lg:col-span-3"
              >
                <div className="relative overflow-hidden rounded-2xl border border-primary/20 bg-card/60 backdrop-blur-md">
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/12 via-transparent to-accent/10" />
                  <div className="relative grid gap-6 p-6 md:grid-cols-[1.1fr_1fr] md:items-center">
                    <div className="min-w-0">
                      <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[11px] uppercase tracking-widest text-primary">
                        <ItemIcon className="h-3.5 w-3.5" />
                        Command Center
                      </div>
                      <h2 className="font-heading text-2xl md:text-3xl font-bold leading-tight">
                        {t(item.titleKey)}
                      </h2>
                      <p className="mt-2 text-sm md:text-base text-muted-foreground">{t(item.descKey)}</p>
                      <p className="mt-3 text-xs text-muted-foreground/80">{t("cc.tagline")}</p>
                      <Link
                        to={locked ? "#" : item.route}
                        onClick={(e) => locked && e.preventDefault()}
                        className={cn(
                          "mt-5 inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-all",
                          locked ? "opacity-50 cursor-not-allowed" : "hover:shadow-glow-gold",
                        )}
                      >
                        {t("cc.cta")}
                        <ArrowRight className="h-4 w-4" />
                      </Link>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      {(item.previews ?? []).map((preview) => (
                        <Link
                          key={preview.route}
                          to={locked ? "#" : preview.route}
                          onClick={(e) => locked && e.preventDefault()}
                          className="group relative aspect-video overflow-hidden rounded-xl border border-border/60"
                        >
                          <img
                            src={preview.cover}
                            alt=""
                            loading="lazy"
                            className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-background/95 via-background/40 to-transparent" />
                          <span className="absolute bottom-2 left-3 text-xs font-medium text-foreground">
                            {t(preview.labelKey)}
                          </span>
                        </Link>
                      ))}
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          }

          return (
            <motion.div key={item.route} variants={cardVariant} className="h-full">
              <Link
                to={locked ? "#" : item.route}
                className={`hub-card-shimmer group relative flex h-full flex-col overflow-hidden rounded-2xl transition-all duration-300
                  ${locked
                    ? "opacity-50 cursor-not-allowed bg-card/40 backdrop-blur-sm"
                    : "bg-card/60 backdrop-blur-md hover:-translate-y-2 hover:shadow-[0_0_40px_hsla(43,90%,68%,0.2),0_0_80px_hsla(187,84%,55%,0.1)]"
                  }`}
                onClick={(e) => {
                  if (locked) {
                    e.preventDefault();
                    return;
                  }
                  if (hub.key === "erstellen" && item.route === "/video-composer") {
                    try {
                      window.sessionStorage.setItem("motion-studio:intro-trigger", "1");
                    } catch {
                      /* ignore */
                    }
                  }
                }}
              >
                {/* ── Cinematic cover ── */}
                <div className="relative aspect-video w-full overflow-hidden bg-black">
                  <img
                    src={cover}
                    alt=""
                    loading="lazy"
                    width={1280}
                    height={720}
                    className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                  {/* Depth + legibility overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-card via-card/40 to-transparent" />
                  <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-accent/10 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

                  {/* Icon chip */}
                  <div className="absolute left-3 top-3 p-2 rounded-xl bg-black/50 backdrop-blur-md border border-white/10 group-hover:border-primary/40 transition-colors duration-300">
                    <ItemIcon className="h-4 w-4 text-primary group-hover:drop-shadow-[0_0_8px_hsla(43,90%,68%,0.7)] transition-all duration-300" />
                  </div>

                  {/* Lock / arrow indicator */}
                  <div className="absolute right-3 top-3">
                    {locked ? (
                      <span className="flex items-center justify-center h-7 w-7 rounded-full bg-black/60 backdrop-blur-md border border-white/10">
                        <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                      </span>
                    ) : (
                      <span className="flex items-center justify-center h-7 w-7 rounded-full bg-black/60 backdrop-blur-md border border-white/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                        <ArrowRight className="h-3.5 w-3.5 text-primary" />
                      </span>
                    )}
                  </div>
                </div>

                {/* ── Text block ── */}
                <div className="relative z-10 flex flex-1 flex-col p-5">
                  <h3 className="font-semibold text-base leading-snug mb-1.5 line-clamp-1 group-hover:text-primary transition-colors duration-200">
                    {t(item.titleKey)}
                  </h3>
                  <p className="text-[13px] text-muted-foreground leading-snug line-clamp-2">
                    {t(item.descKey)}
                  </p>

                  {locked && (
                    <span
                      className="inline-block self-start mt-3 text-[11px] font-medium text-primary bg-primary/10 px-2.5 py-1 rounded-full"
                      style={{ animation: "pulse-bg 2s ease-in-out infinite" }}
                    >
                      {item.plan === "enterprise" ? "Enterprise" : "Pro"}
                    </span>
                  )}
                </div>
              </Link>
            </motion.div>
          );
        })}
      </motion.div>

    </PageWrapper>
  );
}

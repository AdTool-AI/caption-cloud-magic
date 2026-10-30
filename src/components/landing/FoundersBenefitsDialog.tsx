import { tx } from "@/lib/i18nText";
import { Link } from "react-router-dom";
import { Crown, ShieldCheck, Percent, Clock, AlertTriangle, Sparkles, Brain, Wrench } from "lucide-react";
import { subscriptionPricePerMonth } from "@/lib/pricingDisplay";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FoundersSlotBadge } from "@/components/pricing/FoundersSlotBadge";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const buildBenefits = () => [
  {
    icon: ShieldCheck,
    title: tx({
      de: `Ein Abo. Dein komplettes KI-Studio. ${subscriptionPricePerMonth()}.`,
      en: `One subscription. Your entire AI studio. ${subscriptionPricePerMonth()}.`,
      es: `Una suscripción. Todo tu estudio de IA. ${subscriptionPricePerMonth()}.`,
    }),
    text: tx({
      de: "Texte, Bilder, Videos und Musik erstellen, Inhalte veredeln, komplette Produktionen schneiden und direkt auf deinen Social-Kanälen veröffentlichen — alles in AdTool AI.",
      en: "Create text, images, videos and music, enhance your content, edit complete productions and publish across your social channels — all inside AdTool AI.",
      es: "Crea textos, imágenes, vídeos y música, mejora tu contenido, edita producciones completas y publica en tus canales sociales: todo dentro de AdTool AI.",
    }),
  },
  {
    icon: Brain,
    title: tx({ de: "Führende KI-Modelle enthalten", en: "Leading AI models included", es: "Modelos de IA líderes incluidos" }),
    text: "ChatGPT Astra · Claude 4.1 Opus · Gemini · GPT Image · Gemini Image",
  },
  {
    icon: Sparkles,
    title: tx({ de: "Monatliche KI-Generierung enthalten", en: "Monthly AI generation included", es: "Generación mensual de IA incluida" }),
    text: tx({
      de: "10 Fast AI Videos jeden Monat · KI-Musik mit MiniMax Music 1.5 enthalten — vollständige Songs mit Gesang und Instrumentierung, im monatlichen Fair-Use-Kontingent ohne Credit-Abzug.",
      en: "10 Fast AI Videos every month · AI Music with MiniMax Music 1.5 included — create full-length songs with vocals and instrumentation, within the monthly fair-use allowance and without credit deduction.",
      es: "10 Fast AI Videos cada mes · Música con IA con MiniMax Music 1.5 incluida: canciones completas con voces e instrumentación, dentro del uso justo mensual y sin consumir créditos.",
    }),
  },
  {
    icon: Wrench,
    title: tx({ de: "Profi-Werkzeuge enthalten", en: "Professional tools included", es: "Herramientas profesionales incluidas" }),
    text: tx({
      de: "Motion Studio · Picture Studio · Spezialmodelle · Topaz Enhance & Upscale · Content Command Center · Social Connections · Render-Queue · Planung und Veröffentlichung.",
      en: "Motion Studio · Picture Studio · Specialist Models · Topaz Enhance & Upscale · Content Command Center · Social Connections · Render Queue · scheduling and publishing tools.",
      es: "Motion Studio · Picture Studio · Modelos especializados · Topaz Enhance & Upscale · Content Command Center · Social Connections · cola de renderizado · programación y publicación.",
    }),
  },
  {
    icon: Percent,
    title: tx({ de: "10 % auf bezahlte KI-Nutzung — 24 Monate", en: "10% off all paid AI model usage — 24 months", es: "10 % en todo el uso de IA de pago: 24 meses" }),
    text: tx({
      de: "Founders erhalten 24 Monate lang 10 % Rabatt auf zusätzlich bezahlte KI-Nutzung — zusätzlich zu den Werkzeugen und den monatlich enthaltenen Generierungen des Abos. Der Rabatt wird an der Kasse automatisch abgezogen.",
      en: "Founders receive 10% off additional paid AI model usage for 24 months — on top of the tools and monthly generations already included with the subscription. Applied automatically at checkout.",
      es: "Los Founders reciben un 10 % de descuento durante 24 meses en el uso de IA de pago adicional, además de las herramientas y las generaciones mensuales ya incluidas. Se aplica automáticamente al pagar.",
    }),
  },
  {
    icon: Crown,
    title: tx({ de: "Direkter Draht zum Team", en: "Direct line to the team", es: "Línea directa al equipo" }),
    text: tx({ de: "Priorisiertes Feedback, Early-Access zu neuen Features und persönlicher Support.", en: "Prioritized feedback, early access to new features, and personal support.", es: "Comentarios priorizados, acceso anticipado a nuevas funciones y soporte personal." }),
  },
];


export const FoundersBenefitsDialog = ({ open, onOpenChange }: Props) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl bg-background/95 backdrop-blur-xl border-primary/30">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-full bg-primary/10 border border-primary/30">
              <Crown className="h-6 w-6 text-primary" />
            </div>
            <DialogTitle className="text-2xl font-bold tracking-tight">
              {tx({ de: "Founders-Programm — Deine Vorteile", en: "Founders Program — Your Benefits", es: "Programa Founders — Tus ventajas" })}
            </DialogTitle>
          </div>
          <DialogDescription className="text-base leading-relaxed">
            {tx({ de: 'Ein Creator. Ein ganzes Studio. Wir starten am', en: 'One creator. An entire studio. We launch on', es: 'Un creador. Un estudio completo. Lanzamos el' })}{" "}
            <strong className="text-foreground">26.07.2026</strong> {tx({ de: 'in eine öffentliche', en: 'into a public', es: 'en una beta pública de' })}{" "}
            <strong className="text-foreground">{tx({ de: '3-Monats-Beta', en: '3-month beta', es: '3 meses' })}</strong>. {tx({ de: 'Als einer der ersten', en: 'As one of the first', es: 'Como uno de los primeros' })}{" "}
            <strong className="text-foreground">1.000 Founders</strong> {tx({ de: 'sicherst du dir dauerhaften Zugang zum kompletten Produktionsworkflow — und hilfst uns, ihn gemeinsam großartig zu machen.', en: 'you secure permanent access to the complete production workflow — and help us make it great together.', es: 'aseguras acceso permanente al flujo de trabajo de producción completo — y nos ayudas a hacerlo genial juntos.' })}
          </DialogDescription>
        </DialogHeader>

        <div className="my-2 flex justify-center">
          <FoundersSlotBadge />
        </div>

        <div className="grid gap-3 mt-2">
          {buildBenefits().map(({ icon: Icon, title, text }) => (
            <div
              key={title}
              className="flex gap-3 p-3 rounded-lg border border-border/50 bg-card/50"
            >
              <div className="shrink-0 p-2 rounded-md bg-primary/10 h-fit">
                <Icon className="h-4 w-4 text-primary" />
              </div>
              <div className="space-y-0.5">
                <div className="font-semibold text-sm text-foreground">{title}</div>
                <div className="text-xs text-muted-foreground leading-relaxed">{text}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-3 p-3 rounded-lg border border-amber-500/30 bg-amber-500/5 flex gap-3">
          <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
          <div className="text-xs text-muted-foreground leading-relaxed">
            <strong className="text-foreground">{tx({ de: "Wichtig:", en: "Important:", es: "Importante:" })}</strong> {tx({ de: "Der Founder-Status ist an ein aktives Abo gebunden. Bei", en: "The founder status is tied to an active subscription. In case of", es: "El estatus de fundador está ligado a una suscripción activa. En caso de" })} <strong className="text-foreground">{tx({ de: "Kündigung, Pausierung oder Kontolöschung", en: "Termination, pause or account deletion", es: "Terminación, pausa o eliminación de cuenta" })}</strong>{" "}
            {tx({ de: "geht dein Founder-Status", en: "your founder status is", es: "tu estatus de fundador se" })} <strong className="text-foreground">{tx({ de: "dauerhaft verloren", en: "permanently lost", es: "pierde permanentemente" })}</strong> {tx({ de: "und der Slot wird für neue Nutzer freigegeben. Details in unseren", en: "and the slot is released for new users. Details in our", es: "y el cupo se libera para nuevos usuarios. Detalles en nuestros" })}{" "}
            <Link to="/legal/terms#section-8" className="text-primary hover:underline">{tx({ de: "AGB §8", en: "Terms §8", es: "Términos §8" })}</Link>.
          </div>
        </div>

        <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
          <Clock className="h-3.5 w-3.5" />
          <span>{tx({ de: "Beta-Phase: 26.07.2026 – 26.10.2026 · Founders-Rabatt auf bezahlte KI-Nutzung: 24 Monate ab Signup", en: "Beta phase: July 26, 2026 - October 26, 2026 · Founders discount on paid AI model usage: 24 months from signup", es: "Fase Beta: 26 de julio de 2026 - 26 de octubre de 2026 · Descuento Founders en el uso de IA de pago: 24 meses desde el registro" })}</span>
        </div>

        <DialogFooter className="mt-4 gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {tx({ de: "Später", en: "Later", es: "Más tarde" })}
          </Button>
          <Button asChild className="bg-primary hover:bg-primary/90">
            <Link to="/pricing" onClick={() => onOpenChange(false)}>
              <Crown className="h-4 w-4 mr-2" />
              {tx({ de: "Jetzt Founder werden", en: "Become a Founder now", es: "Hazte Founder ahora" })}
            </Link>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

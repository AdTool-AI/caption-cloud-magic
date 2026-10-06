import { useEffect, useMemo, useState } from "react";
import { Target, ExternalLink, AlertTriangle, Layers, ChevronDown, Play, ArrowRight } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { deriveCampaignActivity, deriveShotStatus, formatMoney, isApprovalActionable, type CampaignActivityKey, type ShotStatusKey } from "@/lib/agentStatus";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { supabase } from "@/integrations/supabase/client";
import { tx } from "@/lib/i18nText";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;

interface Snapshot {
  campaign: Row;
  sources: Row[];
  facts: Row[];
  assets: Row[];
  pillars: Row[];
  areas: Row[];
  videos: Row[];
  shots: Row[];
  social: Row[];
  generations: Row[];
  attempts: Row[];
  budgetApproval: Row | null;
  approvals: Row[];
}

const db = supabase as any;

async function loadCampaign(conversationId: string): Promise<Snapshot | null> {
  const { data: campaign } = await db
    .from("agent_campaigns")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!campaign) return null;
  const id = campaign.id;
  const [sources, facts, assets, pillars, areas, videos, shots, social, budgetApprovals, attemptsRes] = await Promise.all([
    db.from("campaign_sources").select("url, title, via").eq("campaign_id", id),
    db.from("campaign_facts").select("category, fact, source_url, is_hypothesis").eq("campaign_id", id),
    db.from("campaign_assets").select("id, url, kind, reuse_status, source_url").eq("campaign_id", id),
    db.from("campaign_pillars").select("name, rank, relevance").eq("campaign_id", id).order("rank"),
    db.from("campaign_business_areas").select("area, relevance").eq("campaign_id", id).order("relevance", { ascending: false }),
    db.from("campaign_videos").select("*").eq("campaign_id", id).order("video_index"),
    db.from("campaign_shots").select("*").eq("campaign_id", id).order("shot_index"),
    db.from("campaign_social_profiles").select("*").eq("campaign_id", id),
    db.from("campaign_budget_approvals").select("*").eq("campaign_id", id).order("created_at", { ascending: false }),
    db.from("campaign_shot_attempts").select("id, shot_id, attempt_no, generation_id, model, cost_charged, qa_verdict, qa_scores, client_ready, qa_superseded, created_at").eq("campaign_id", id).order("attempt_no"),
  ]);
  const attemptRows: Row[] = attemptsRes.data ?? [];
  const generationIds = Array.from(new Set([
    ...(shots.data ?? []).map((shot: Row) => shot.current_generation_id),
    ...attemptRows.map((a) => a.generation_id),
  ].filter(Boolean)));
  const generations = generationIds.length
    ? await db.from("ai_video_generations").select("id, status, video_url, thumbnail_url, created_at").in("id", generationIds)
    : { data: [] };
  return {
    campaign,
    sources: sources.data ?? [],
    facts: facts.data ?? [],
    assets: assets.data ?? [],
    pillars: pillars.data ?? [],
    areas: areas.data ?? [],
    videos: videos.data ?? [],
    shots: shots.data ?? [],
    social: social.data ?? [],
    generations: generations.data ?? [],
    attempts: attemptRows,
    budgetApproval: (budgetApprovals.data ?? [])[0] ?? null,
    approvals: budgetApprovals.data ?? [],
  };
}

const STAGE_LABEL: Record<string, { de: string; en: string; es: string }> = {
  research: { de: "Recherche", en: "Research", es: "Investigación" },
  strategy: { de: "Strategie", en: "Strategy", es: "Estrategia" },
  asset_collection: { de: "Material", en: "Assets", es: "Recursos" },
  script: { de: "Skript", en: "Script", es: "Guion" },
  shot_planning: { de: "Shot-Plan", en: "Shot plan", es: "Plan de tomas" },
  plan_ready: { de: "Plan fertig", en: "Plan ready", es: "Plan listo" },
};

const AREA_LABEL: Record<string, { de: string; en: string; es: string }> = {
  products_menu: { de: "Produkte/Karte", en: "Products/menu", es: "Productos/carta" },
  drinks: { de: "Getränke", en: "Drinks", es: "Bebidas" },
  atmosphere: { de: "Atmosphäre", en: "Atmosphere", es: "Ambiente" },
  people_team: { de: "Menschen/Team", en: "People/team", es: "Personas/equipo" },
  location: { de: "Lage", en: "Location", es: "Ubicación" },
  service: { de: "Service", en: "Service", es: "Servicio" },
  reviews_social_proof: { de: "Bewertungen", en: "Reviews", es: "Reseñas" },
  offers_seasonal: { de: "Angebote/Saison", en: "Offers/seasonal", es: "Ofertas/temporada" },
  conversion_reservations: { de: "Reservierung", en: "Reservations", es: "Reservas" },
};

const SOCIAL_STATUS: Record<string, { de: string; en: string; es: string }> = {
  analyzed: { de: "analysiert", en: "analyzed", es: "analizado" },
  found_not_analyzed: { de: "gefunden, noch nicht analysiert", en: "found, not yet analyzed", es: "encontrado, sin analizar" },
  not_found: { de: "nicht gefunden", en: "not found", es: "no encontrado" },
  not_accessible: { de: "nicht öffentlich zugänglich", en: "not publicly accessible", es: "no accesible públicamente" },
  pending: { de: "nicht geprüft", en: "not checked", es: "sin comprobar" },
};
const PLATFORM_NAME: Record<string, string> = { instagram: "Instagram", tiktok: "TikTok", facebook: "Facebook", youtube: "YouTube" };

const lbl = (m: Record<string, { de: string; en: string; es: string }>, k: string) => (m[k] ? tx(m[k]) : k);

const STATUS_LABEL: Record<ShotStatusKey, { de: string; en: string; es: string }> = {
  planned: { de: "Geplant", en: "Planned", es: "Planificado" },
  awaiting_approval: { de: "Wartet auf Freigabe", en: "Waiting for approval", es: "Esperando aprobación" },
  queued: { de: "In Warteschlange", en: "Queued", es: "En cola" },
  generating: { de: "Wird erstellt", en: "Generating", es: "Generando" },
  checking: { de: "Wird geprüft", en: "Checking", es: "Revisando" },
  qa_unavailable: { de: "Video fertig · QA nicht verfügbar", en: "Video done · QA unavailable", es: "Vídeo listo · QA no disponible" },
  visual_ready: { de: "Visuell fertig", en: "Visual ready", es: "Visual listo" },
  needs_changes: { de: "Braucht Änderungen", en: "Needs changes", es: "Necesita cambios" },
  interrupted: { de: "Unterbrochen", en: "Interrupted", es: "Interrumpido" },
  failed: { de: "Fehlgeschlagen", en: "Failed", es: "Fallido" },
  unknown: { de: "Status unklar", en: "Status unresolved", es: "Estado sin resolver" },
};

const ACTIVITY_LABEL: Record<CampaignActivityKey, { title: { de: string; en: string; es: string }; next: { de: string; en: string; es: string } }> = {
  planning: {
    title: { de: "Nur Planung", en: "Planning only", es: "Solo planificación" },
    next: { de: "Bitte den Agenten um eine Kostenschätzung.", en: "Ask the agent for a cost estimate.", es: "Pide al agente una estimación de coste." },
  },
  awaiting_approval: {
    title: { de: "Wartet auf deine Freigabe", en: "Waiting for your approval", es: "Esperando tu aprobación" },
    next: { de: "Prüfe die offene Freigabe unten und bestätige oder lehne ab.", en: "Review the open approval below and confirm or decline.", es: "Revisa la aprobación abierta abajo y confirma o rechaza." },
  },
  running: {
    title: { de: "Produktion läuft", en: "Production running", es: "Producción en curso" },
    next: { de: "Nichts zu tun — du kannst die Seite verlassen.", en: "Nothing to do — you can leave this page.", es: "Nada que hacer: puedes salir de esta página." },
  },
  checking: {
    title: { de: "Clips werden geprüft", en: "Checking clips", es: "Revisando clips" },
    next: { de: "Die visuelle Prüfung läuft automatisch.", en: "Visual QA runs automatically.", es: "La revisión visual se ejecuta automáticamente." },
  },
  needs_changes: {
    title: { de: "Shots brauchen Änderungen", en: "Shots need changes", es: "Las tomas necesitan cambios" },
    next: { de: "Wähle Shots für einen Retry und bitte den Agenten um eine neue Freigabe.", en: "Pick shots to retry and ask the agent for a new approval.", es: "Elige tomas para reintentar y pide al agente una nueva aprobación." },
  },
  visuals_ready: {
    title: { de: "Visuell fertig — Anzeige noch nicht final", en: "Visuals ready — ad not final yet", es: "Visuales listos: anuncio aún no final" },
    next: { de: "Nächster Schritt: Voiceover, Musik und Texte.", en: "Next: voiceover, music and text overlays.", es: "Siguiente: voz en off, música y textos." },
  },
  attention: {
    title: { de: "Braucht Aufmerksamkeit", en: "Needs attention", es: "Requiere atención" },
    next: { de: "Einige Shots sind unterbrochen, fehlgeschlagen oder ungeprüft — frag den Agenten nach dem Status.", en: "Some shots are interrupted, failed or unchecked — ask the agent for their status.", es: "Algunas tomas están interrumpidas, fallidas o sin revisar: pregunta al agente." },
  },
};

export function CampaignPanel({
  conversationId,
  refreshKey,
  currency,
  focusGenerationId,
}: {
  conversationId: string | null;
  refreshKey: number;
  /** Currency of the wallet that funds the campaign; campaign amounts are stored in it. */
  currency?: string | null;
  focusGenerationId?: { id: string; nonce: number } | null;
}) {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [openVideo, setOpenVideo] = useState<number | null>(null);
  const [planningOpen, setPlanningOpen] = useState(false);
  const [showAllRouted, setShowAllRouted] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [player, setPlayer] = useState<{ url: string; title: string } | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    if (!conversationId) {
      setSnap(null);
      return;
    }
    void loadCampaign(conversationId).then((s) => alive && setSnap(s));
    return () => {
      alive = false;
    };
  }, [conversationId, refreshKey]);

  const derived = useMemo(() => {
    if (!snap) return null;
    const now = Date.now();
    const generationById = new Map(snap.generations.map((g) => [g.id, g]));
    const actionable = snap.approvals.filter((a) => isApprovalActionable(String(a.status), a.start_expires_at, now));
    const pendingScope = new Set<string>(actionable.flatMap((a) => (a.scope ?? []).map((i: Row) => i.shot_id)));
    const latestScope = new Set<string>((snap.budgetApproval?.scope ?? []).map((i: Row) => i.shot_id));
    const statusOf = new Map<string, ShotStatusKey>(
      snap.shots.map((shot) => [shot.id, deriveShotStatus(shot as { id: string }, generationById.get(shot.current_generation_id) as { id: string } | undefined, pendingScope.has(shot.id), now)]),
    );
    const routed = snap.shots.filter((shot) => shot.selected_model);
    const scoped = latestScope.size > 0 ? routed.filter((shot) => latestScope.has(shot.id) || pendingScope.has(shot.id)) : routed;
    const activity = deriveCampaignActivity(scoped.map((s) => statusOf.get(s.id)!), actionable.length > 0);
    const attemptsByShot = new Map<string, Row[]>();
    for (const a of snap.attempts) attemptsByShot.set(a.shot_id, [...(attemptsByShot.get(a.shot_id) ?? []), a]);
    const shotByGeneration = new Map<string, string>();
    for (const shot of snap.shots) if (shot.current_generation_id) shotByGeneration.set(shot.current_generation_id, shot.id);
    for (const a of snap.attempts) if (a.generation_id) shotByGeneration.set(a.generation_id, a.shot_id);
    return { generationById, actionable, statusOf, routed, scoped, activity, attemptsByShot, shotByGeneration };
  }, [snap]);

  // "View clip" from the chat: reveal and highlight the matching shot.
  useEffect(() => {
    if (!focusGenerationId || !derived) return;
    const shotId = derived.shotByGeneration.get(focusGenerationId.id);
    if (!shotId) return;
    if (!derived.scoped.some((s) => s.id === shotId)) setShowAllRouted(true);
    setHighlight(shotId);
    window.setTimeout(() => document.getElementById(`shot-${shotId}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
    const g = derived.generationById.get(focusGenerationId.id);
    if (g?.video_url) setPlayer({ url: g.video_url, title: "" });
  }, [focusGenerationId, derived]);

  if (!snap || !derived) return null;
  const { campaign: c } = snap;
  const citedFacts = snap.facts.filter((f) => !f.is_hypothesis).length;
  const videoIndex = new Map(snap.videos.map((video) => [video.id, video.video_index]));
  const shotLabel = (shot: Row | undefined) => (shot ? `V${videoIndex.get(shot.video_id) ?? "?"}·S${Number(shot.shot_index ?? 0)}` : "?");
  const shotById = new Map(snap.shots.map((s) => [s.id, s]));
  const visibleProductionShots = showAllRouted ? derived.routed : derived.scoped;
  const money = (n: unknown) => formatMoney(Number(n ?? 0), currency);
  const historicalApprovals = snap.approvals.filter((a) => !derived.actionable.includes(a));
  const activity = ACTIVITY_LABEL[derived.activity];
  return (
    <Card className="mt-4 border-border/60 bg-card/70 p-4 backdrop-blur">
      <div className="flex flex-wrap items-center gap-2">
        <Target className="h-4 w-4 text-primary" />
        <h2 className="font-serif text-lg text-foreground">{c.company_name}</h2>
        <Badge variant="outline">{lbl(STAGE_LABEL, c.stage)}</Badge>
        <Badge variant="secondary">
          {c.requested_video_count} × {c.video_duration_s}s · {String(c.language).toUpperCase()}
        </Badge>
        {c.coverage_score != null && (
          <Badge className="bg-primary/15 text-primary hover:bg-primary/15">
            {tx({ de: "Planungsabdeckung", en: "Planning coverage", es: "Cobertura de planificación" })} {Math.round(Number(c.coverage_score))}/100
          </Badge>
        )}
        <span className="ml-auto text-xs text-muted-foreground">
          {tx(activity.title)}
        </span>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{c.goal}</p>

      <div className="mt-3 rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
        <p className="flex items-center gap-2 font-medium text-foreground">
          <ArrowRight className="h-4 w-4 text-primary" /> {tx(activity.title)}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">{tx(activity.next)}</p>
        {derived.actionable.map((a) => {
          const scope: Row[] = a.scope ?? [];
          return (
            <div key={a.id} className="mt-2 rounded border border-border/60 bg-background/40 p-2 text-xs">
              <p className="text-foreground">
                {tx({ de: "Offene Freigabe", en: "Open approval", es: "Aprobación abierta" })}: {scope.length === 1
                  ? `${shotLabel(shotById.get(scope[0].shot_id))} · ${tx({ de: "Versuch", en: "attempt", es: "intento" })} ${(derived.attemptsByShot.get(scope[0].shot_id)?.length ?? 0) + 1}`
                  : `${scope.length} ${tx({ de: "Shots", en: "shots", es: "tomas" })}: ${scope.map((i) => shotLabel(shotById.get(i.shot_id))).join(", ")}`}
              </p>
              <p className="text-muted-foreground">
                {tx({ de: "Geschätzt", en: "Estimated", es: "Estimado" })} {money(a.estimated_total)} · {tx({ de: "maximal", en: "max authorized", es: "máximo autorizado" })} {money(a.max_total)}
              </p>
            </div>
          );
        })}
      </div>

      {c.needs_user_review && (
        <div className="mt-3 flex gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs text-foreground">
          <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
          <span>
            {tx({
              de: "Einige Videos sind sich nach 3 Überarbeitungen noch zu ähnlich — bitte prüfen:",
              en: "Some videos are still too similar after 3 revisions — please review:",
              es: "Algunos vídeos siguen siendo demasiado parecidos tras 3 revisiones; revísalos:",
            })}{" "}
            {c.review_reason}
          </span>
        </div>
      )}

      <Collapsible open={planningOpen} onOpenChange={setPlanningOpen} className="mt-4">
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm" className="w-full justify-between px-2">
            {tx({ de: "Planung & Recherche", en: "Planning & research", es: "Planificación e investigación" })}
            <ChevronDown className={`h-4 w-4 transition-transform ${planningOpen ? "rotate-180" : ""}`} />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
      <div className="mt-3 grid gap-4 lg:grid-cols-3">
        <div className="space-y-2 text-sm">
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {tx({ de: "Strategie", en: "Strategy", es: "Estrategia" })}
          </h3>
          {c.audience && (
            <p>
              <span className="text-muted-foreground">{tx({ de: "Zielgruppe", en: "Audience", es: "Público" })}: </span>
              {c.audience}
            </p>
          )}
          {c.commercial_angle && (
            <p>
              <span className="text-muted-foreground">{tx({ de: "Stärkster Winkel", en: "Strongest angle", es: "Mejor ángulo" })}: </span>
              {c.commercial_angle}
            </p>
          )}
          {c.angle_rationale && <p className="text-xs text-muted-foreground">{c.angle_rationale}</p>}
          {snap.pillars.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-1">
              {snap.pillars.map((p) => (
                <Badge key={p.rank} variant="outline" className="text-xs">
                  {p.rank}. {p.name}
                </Badge>
              ))}
            </div>
          )}
          {snap.areas.filter((a) => Number(a.relevance) >= 0.5).length > 0 && (
            <div className="flex flex-wrap gap-1">
              {snap.areas
                .filter((a) => Number(a.relevance) >= 0.5)
                .map((a) => (
                  <Badge key={a.area} variant="secondary" className="text-xs">
                    {lbl(AREA_LABEL, a.area)} {Math.round(Number(a.relevance) * 100)}%
                  </Badge>
                ))}
            </div>
          )}
        </div>

        <div className="space-y-2 text-sm">
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {tx({ de: "Quellen", en: "Sources", es: "Fuentes" })} ({snap.sources.length}) ·{" "}
            {tx({ de: "belegte Fakten", en: "cited facts", es: "hechos citados" })} {citedFacts}/{snap.facts.length}
          </h3>
          <ul className="max-h-40 space-y-1 overflow-auto pr-1 text-xs">
            {snap.sources.map((s) => (
              <li key={s.url} className="flex items-center gap-1">
                <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" />
                <a href={s.url} target="_blank" rel="noreferrer" className="truncate text-primary hover:underline">
                  {s.title || s.url}
                </a>
              </li>
            ))}
          </ul>
        </div>

        <div className="space-y-2 text-sm">
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {tx({ de: "Material", en: "Assets", es: "Recursos" })} ({snap.assets.length})
          </h3>
          <p className="text-xs text-muted-foreground">
            {snap.assets.filter((a) => a.reuse_status === "reuse_ok").length}{" "}
            {tx({ de: "eigene, nutzbar", en: "own, usable", es: "propios, utilizables" })} ·{" "}
            {snap.assets.filter((a) => a.reuse_status === "reference_only").length}{" "}
            {tx({ de: "nur als Referenz (Web)", en: "reference only (web)", es: "solo referencia (web)" })}
          </p>
          <div className="grid max-h-40 grid-cols-4 gap-1 overflow-auto">
            {snap.assets
              .filter((a) => /\.(jpe?g|png|webp|gif|avif)(\?|$)/i.test(a.url) || a.kind === "website_image")
              .slice(0, 16)
              .map((a) => (
                <a key={a.id} href={a.source_url || a.url} target="_blank" rel="noreferrer" title={a.reuse_status}>
                  <img src={a.url} alt="" loading="lazy" className="aspect-square w-full rounded object-cover opacity-90" />
                </a>
              ))}
          </div>
        </div>
      </div>

      {snap.social.length > 0 && (
        <div className="mt-4">
          <h3 className="mb-2 flex flex-wrap items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {tx({ de: "Social-Profile", en: "Social profiles", es: "Perfiles sociales" })}
            <Badge variant={c.social_research_complete ? "secondary" : "outline"} className="normal-case">
              {c.social_research_complete
                ? tx({ de: "Social-Recherche vollständig", en: "Social research complete", es: "Investigación social completa" })
                : tx({ de: "Social-Recherche unvollständig", en: "Social research incomplete", es: "Investigación social incompleta" })}
            </Badge>
          </h3>
          <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-4">
            {["instagram", "tiktok", "facebook", "youtube"].map((pl) => {
              const r = snap.social.find((x) => x.platform === pl);
              return (
                <div key={pl} className="rounded-md border border-border/60 bg-background/40 p-2 text-xs">
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-medium text-foreground">{PLATFORM_NAME[pl]}</span>
                    <Badge variant="outline" className="text-[10px]">{lbl(SOCIAL_STATUS, r?.status ?? "pending")}</Badge>
                  </div>
                  {r?.profile_url && (
                    <a href={r.profile_url} target="_blank" rel="noreferrer" className="mt-1 block truncate text-primary hover:underline">
                      {r.profile_url}
                    </a>
                  )}
                  {r?.discovery_via && (
                    <p className="text-muted-foreground">
                      {tx({ de: "Gefunden über", en: "Found via", es: "Encontrado vía" })}: {r.discovery_via}
                    </p>
                  )}
                  {r?.content_themes?.length > 0 && <p className="mt-1">{r.content_themes.join(" · ")}</p>}
                  {r?.visual_style && <p className="text-muted-foreground">{r.visual_style}</p>}
                  {r?.strongest_formats && (
                    <p>
                      <span className="text-muted-foreground">{tx({ de: "Stärkste Formate", en: "Strongest formats", es: "Mejores formatos" })}: </span>
                      {r.strongest_formats}
                    </p>
                  )}
                  {r?.content_gaps?.length > 0 && (
                    <p>
                      <span className="text-muted-foreground">{tx({ de: "Lücken", en: "Gaps", es: "Carencias" })}: </span>
                      {r.content_gaps.join(" · ")}
                    </p>
                  )}
                  {r?.recent_posts?.length > 0 && (
                    <p className="text-muted-foreground">
                      {r.recent_posts.length} {tx({ de: "öffentliche Beispiele", en: "public examples", es: "ejemplos públicos" })}
                    </p>
                  )}
                  {r?.status === "not_accessible" && r.access_note && <p className="mt-1 text-muted-foreground">{r.access_note}</p>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {snap.videos.length > 0 && (
        <div className="mt-4">
          <h3 className="mb-2 flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <Layers className="h-3.5 w-3.5" /> {tx({ de: "Content-Matrix", en: "Content matrix", es: "Matriz de contenido" })}
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-xs">
              <thead className="text-muted-foreground">
                <tr className="border-b border-border/60">
                  <th className="p-2">#</th>
                  <th className="p-2">{tx({ de: "Video", en: "Video", es: "Vídeo" })}</th>
                  <th className="p-2">{tx({ de: "Säule", en: "Pillar", es: "Pilar" })}</th>
                  <th className="p-2">{tx({ de: "Bereich", en: "Area", es: "Área" })}</th>
                  <th className="p-2">Funnel</th>
                  <th className="p-2">{tx({ de: "Emotion", en: "Emotion", es: "Emoción" })}</th>
                  <th className="p-2">{tx({ de: "Ziel", en: "Objective", es: "Objetivo" })}</th>
                  <th className="p-2">Hook</th>
                  <th className="p-2">CTA</th>
                  <th className="p-2">{tx({ de: "Hauptmotiv", en: "Hero subject", es: "Protagonista" })}</th>
                </tr>
              </thead>
              <tbody>
                {snap.videos.map((v) => {
                  const shots = snap.shots.filter((s) => s.video_id === v.id);
                  const open = openVideo === v.video_index;
                  return [
                    <tr
                      key={v.id}
                      className="cursor-pointer border-b border-border/40 align-top hover:bg-muted/30"
                      onClick={() => setOpenVideo(open ? null : v.video_index)}
                    >
                      <td className="p-2">{v.video_index}</td>
                      <td className="p-2 font-medium text-foreground">{v.title}</td>
                      <td className="p-2">{v.pillar}</td>
                      <td className="p-2">{lbl(AREA_LABEL, v.business_area)}</td>
                      <td className="p-2">{v.funnel_stage}</td>
                      <td className="p-2">{v.emotional_angle}</td>
                      <td className="p-2">{v.commercial_objective}</td>
                      <td className="p-2">
                        <span className="text-muted-foreground">{v.hook_type}:</span> {v.hook_text}
                      </td>
                      <td className="p-2">{v.cta}</td>
                      <td className="p-2">{v.hero_subject}</td>
                    </tr>,
                    open && (
                      <tr key={`${v.id}-d`} className="border-b border-border/40 bg-background/40">
                        <td colSpan={10} className="space-y-2 p-3">
                          <p>
                            <span className="text-muted-foreground">
                              {tx({ de: "Warum dieses Video", en: "Why this video exists", es: "Por qué existe este vídeo" })}:{" "}
                            </span>
                            {v.rationale}
                          </p>
                          {v.script && (
                            <div className="rounded-md border border-border/60 p-2">
                              <p className="text-muted-foreground">Voiceover</p>
                              <p className="whitespace-pre-wrap text-foreground">{v.script.voiceover}</p>
                              <p className="mt-1 text-muted-foreground">
                                {tx({ de: "Musik", en: "Music", es: "Música" })}: {v.script.music_direction} ·{" "}
                                {tx({ de: "Sound", en: "Sound", es: "Sonido" })}: {v.script.sound_direction}
                              </p>
                            </div>
                          )}
                          {shots.length > 0 && (
                            <ol className="space-y-1">
                              {shots.map((s) => (
                                <li key={s.id} className="grid grid-cols-[70px_1fr] gap-2">
                                  <span className="text-muted-foreground">
                                    {Number(s.start_s)}–{Number(s.end_s)}s
                                  </span>
                                  <span>
                                    <span className="font-medium text-foreground">{s.purpose}</span> · {s.shot_type} — {s.description}
                                    {s.on_screen_text && <span className="text-primary"> [{s.on_screen_text}]</span>}
                                  </span>
                                </li>
                              ))}
                            </ol>
                          )}
                        </td>
                      </tr>
                    ),
                  ];
                })}
              </tbody>
            </table>
          </div>
          {c.coverage_explanation && (
            <p className="mt-3 whitespace-pre-wrap text-xs text-muted-foreground">{c.coverage_explanation}</p>
          )}
        </div>
      )}
        </CollapsibleContent>
      </Collapsible>

      {derived.routed.length > 0 && (
        <div className="mt-4 rounded-md border border-border/60 bg-background/40 p-3">
          <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
            <h3 className="font-medium uppercase tracking-wide text-muted-foreground">{tx({ de: "Produktion", en: "Production", es: "Producción" })}</h3>
            {snap.budgetApproval && (
              <>
                <Badge variant="outline">
                  {tx({ de: "Budget", en: "Budget", es: "Presupuesto" })}: {money(snap.budgetApproval.estimated_total)} / {tx({ de: "max", en: "max", es: "máx" })} {money(snap.budgetApproval.max_total)}
                </Badge>
                <Badge variant="secondary">{tx({ de: "Ausgegeben", en: "Spent", es: "Gastado" })}: {money(snap.budgetApproval.spent_total)}</Badge>
              </>
            )}
            <span className="ml-auto text-muted-foreground">
              {visibleProductionShots.length} {tx({ de: "Shots", en: "shots", es: "tomas" })}
            </span>
            {derived.routed.length > derived.scoped.length && (
              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setShowAllRouted((v) => !v)}>
                {showAllRouted
                  ? tx({ de: "Nur aktueller Umfang", en: "Current scope only", es: "Solo alcance actual" })
                  : tx({ de: `Alle ${derived.routed.length} zeigen`, en: `Show all ${derived.routed.length}`, es: `Mostrar las ${derived.routed.length}` })}
              </Button>
            )}
          </div>
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {visibleProductionShots.map((shot) => {
              const status = derived.statusOf.get(shot.id)!;
              const attempts = derived.attemptsByShot.get(shot.id) ?? [];
              const current = derived.generationById.get(shot.current_generation_id);
              const currentAttempt = attempts.find((a) => a.generation_id === shot.current_generation_id) ?? attempts[attempts.length - 1];
              const title = `${shotLabel(shot)} · ${shot.purpose ?? ""}`;
              return (
                <div
                  key={shot.id}
                  id={`shot-${shot.id}`}
                  className={`rounded-md border bg-card/40 p-2 text-xs transition-colors ${highlight === shot.id ? "border-primary" : "border-border/60"}`}
                >
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={!current?.video_url}
                      onClick={() => current?.video_url && setPlayer({ url: current.video_url, title })}
                      className="relative flex h-14 w-20 shrink-0 items-center justify-center overflow-hidden rounded bg-muted disabled:cursor-default"
                      aria-label={tx({ de: "Clip ansehen", en: "View clip", es: "Ver clip" })}
                    >
                      {current?.thumbnail_url && <img src={current.thumbnail_url} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />}
                      {current?.video_url && <Play className="relative h-4 w-4 text-foreground" />}
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-foreground">{shotLabel(shot)}</span>
                        <Badge variant={status === "failed" || status === "interrupted" ? "destructive" : "outline"} className="text-[10px]">
                          {tx(STATUS_LABEL[status])}
                        </Badge>
                      </div>
                      <p className="mt-0.5 truncate text-muted-foreground">
                        {tx({ de: "Versuch", en: "Attempt", es: "Intento" })} {currentAttempt?.attempt_no ?? 0} · {currentAttempt?.model ?? shot.selected_model} ·{" "}
                        {currentAttempt ? money(currentAttempt.cost_charged) : `${tx({ de: "geschätzt", en: "est.", es: "est." })} ${money(shot.estimated_cost)}`}
                      </p>
                      <p className="truncate">
                        {tx({ de: "Visuelle QA", en: "Visual QA", es: "QA visual" })}:{" "}
                        {status === "qa_unavailable"
                          ? tx({ de: "nicht verfügbar", en: "unavailable", es: "no disponible" })
                          : shot.qa_summary?.overall != null
                            ? `${shot.qa_summary.overall}/10`
                            : "—"}
                      </p>
                    </div>
                  </div>
                  {shot.retry_plan?.proposed && status !== "visual_ready" && (
                    <p className="mt-1 truncate text-muted-foreground" title={shot.retry_plan.revised_prompt}>
                      {tx({ de: "Nächste Aktion", en: "Next action", es: "Siguiente acción" })}: {tx({ de: "Retry mit", en: "retry with", es: "reintento con" })} {shot.retry_plan.proposed.model} · {money(shot.retry_plan.cost?.retry_cost)}
                      {shot.retry_plan.cost?.requires_new_approval ? ` · ${tx({ de: "neue Freigabe nötig", en: "needs new approval", es: "requiere nueva aprobación" })}` : ""}
                    </p>
                  )}
                  {attempts.length > 1 && (
                    <ul className="mt-1 space-y-0.5 border-t border-border/40 pt-1">
                      {attempts.map((a) => {
                        const g = derived.generationById.get(a.generation_id);
                        return (
                          <li key={a.id} className="flex items-center justify-between gap-2 text-muted-foreground">
                            <span className="truncate">
                              #{a.attempt_no} · {a.model} · {money(a.cost_charged)} · QA {a.qa_superseded ? "—" : a.qa_scores?.overall ?? "—"}
                            </span>
                            {g?.video_url && (
                              <button type="button" className="text-primary hover:underline" onClick={() => setPlayer({ url: g.video_url, title: `${title} #${a.attempt_no}` })}>
                                {tx({ de: "Ansehen", en: "View", es: "Ver" })}
                              </button>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>

          {historicalApprovals.length > 0 && (
            <Collapsible open={historyOpen} onOpenChange={setHistoryOpen} className="mt-3">
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="h-7 w-full justify-between px-2 text-xs">
                  {tx({ de: "Freigabe-Verlauf", en: "Approval history", es: "Historial de aprobaciones" })} ({historicalApprovals.length})
                  <ChevronDown className={`h-3.5 w-3.5 transition-transform ${historyOpen ? "rotate-180" : ""}`} />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
                  {historicalApprovals.map((a) => (
                    <li key={a.id} className="flex flex-wrap gap-x-2">
                      <span>{new Date(a.created_at).toLocaleString()}</span>
                      <span>{(a.scope ?? []).length} {tx({ de: "Shots", en: "shots", es: "tomas" })}</span>
                      <span>{money(a.estimated_total)} / max {money(a.max_total)}</span>
                      <Badge variant="outline" className="text-[10px]">
                        {a.status === "pending" ? tx({ de: "abgelaufen", en: "expired", es: "caducada" }) : a.status}
                      </Badge>
                    </li>
                  ))}
                </ul>
              </CollapsibleContent>
            </Collapsible>
          )}
        </div>
      )}

      <Dialog open={!!player} onOpenChange={(o) => !o && setPlayer(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{player?.title || tx({ de: "Clip", en: "Clip", es: "Clip" })}</DialogTitle>
          </DialogHeader>
          {player && <video src={player.url} controls autoPlay className="max-h-[70vh] w-full rounded-md bg-muted object-contain" />}
          {player && (
            <a href={player.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
              <ExternalLink className="h-3 w-3" /> {tx({ de: "In neuem Tab öffnen", en: "Open in new tab", es: "Abrir en nueva pestaña" })}
            </a>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

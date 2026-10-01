import { useEffect, useState } from "react";
import { Target, ExternalLink, AlertTriangle, Layers } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
  const [sources, facts, assets, pillars, areas, videos, shots, social, budgetApprovals] = await Promise.all([
    db.from("campaign_sources").select("url, title, via").eq("campaign_id", id),
    db.from("campaign_facts").select("category, fact, source_url, is_hypothesis").eq("campaign_id", id),
    db.from("campaign_assets").select("id, url, kind, reuse_status, source_url").eq("campaign_id", id),
    db.from("campaign_pillars").select("name, rank, relevance").eq("campaign_id", id).order("rank"),
    db.from("campaign_business_areas").select("area, relevance").eq("campaign_id", id).order("relevance", { ascending: false }),
    db.from("campaign_videos").select("*").eq("campaign_id", id).order("video_index"),
    db.from("campaign_shots").select("*").eq("campaign_id", id).order("shot_index"),
    db.from("campaign_social_profiles").select("*").eq("campaign_id", id),
    db.from("campaign_budget_approvals").select("*").eq("campaign_id", id).order("created_at", { ascending: false }).limit(1),
  ]);
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
    budgetApproval: (budgetApprovals.data ?? [])[0] ?? null,
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

export function CampaignPanel({ conversationId, refreshKey }: { conversationId: string | null; refreshKey: number }) {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [openVideo, setOpenVideo] = useState<number | null>(null);

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

  if (!snap) return null;
  const { campaign: c } = snap;
  const citedFacts = snap.facts.filter((f) => !f.is_hypothesis).length;

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
            {tx({ de: "Abdeckung", en: "Coverage", es: "Cobertura" })} {Math.round(Number(c.coverage_score))}/100
          </Badge>
        )}
        <span className="ml-auto text-xs text-muted-foreground">
          {tx({ de: "Nur Planung — nichts berechnet", en: "Planning only — nothing charged", es: "Solo planificación: sin cargos" })}
        </span>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{c.goal}</p>

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

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
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

      {snap.budgetApproval && (
        <div className="mt-4 rounded-md border border-border/60 bg-background/40 p-3">
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {tx({ de: "Produktion", en: "Production", es: "Producción" })}
          </h3>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Badge variant="outline">
              {tx({ de: "Budget", en: "Budget", es: "Presupuesto" })}: {Number(snap.budgetApproval.estimated_total).toFixed(2)} €
              {" / "}{tx({ de: "max", en: "max", es: "máx" })} {Number(snap.budgetApproval.max_total).toFixed(2)} €
            </Badge>
            <Badge variant="secondary">
              {tx({ de: "Ausgegeben", en: "Spent", es: "Gastado" })}: {Number(snap.budgetApproval.spent_total ?? 0).toFixed(2)} €
            </Badge>
            <Badge variant="outline">{snap.budgetApproval.status}</Badge>
            {snap.budgetApproval.retry_mode === "auto_retry_within_budget" && (
              <Badge variant="outline">
                {tx({ de: "Auto-Retry im Budget", en: "Auto-retry within budget", es: "Reintento automático dentro del presupuesto" })}
              </Badge>
            )}
          </div>
          {snap.shots.some((s) => s.selected_model) && (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[700px] text-left text-xs">
                <thead className="text-muted-foreground">
                  <tr className="border-b border-border/60">
                    <th className="p-1.5">{tx({ de: "Shot", en: "Shot", es: "Toma" })}</th>
                    <th className="p-1.5">{tx({ de: "Modell", en: "Model", es: "Modelo" })}</th>
                    <th className="p-1.5">{tx({ de: "Modus", en: "Mode", es: "Modo" })}</th>
                    <th className="p-1.5">{tx({ de: "Kosten", en: "Cost", es: "Coste" })}</th>
                    <th className="p-1.5">QA</th>
                    <th className="p-1.5">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {snap.shots
                    .filter((s) => s.selected_model)
                    .map((s) => (
                      <tr key={s.id} className="border-b border-border/40 align-top">
                        <td className="p-1.5">V{s.video_index ?? "?"}/S{(s.shot_index ?? 0) + 1}</td>
                        <td className="p-1.5 font-medium text-foreground">{s.selected_model}</td>
                        <td className="p-1.5">{s.generation_mode}</td>
                        <td className="p-1.5">{s.estimated_cost != null ? `${Number(s.estimated_cost).toFixed(2)} €` : "—"}</td>
                        <td className="p-1.5">
                          {s.qa_summary?.overall != null ? `${s.qa_summary.overall}/10` : "—"}
                          {s.client_ready && <Badge className="ml-1 bg-primary/15 text-primary hover:bg-primary/15">ready</Badge>}
                        </td>
                        <td className="p-1.5">
                          <Badge variant={s.status === "failed" ? "destructive" : "outline"} className="text-[10px]">
                            {s.status}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

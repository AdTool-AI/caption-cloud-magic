import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Bot, Loader2, Send, Wrench, AlertTriangle, CheckCircle2, Plus, MessageSquare, Clapperboard, ChevronDown, RotateCcw } from "lucide-react";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { CampaignPanel } from "@/components/agent/CampaignPanel";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useAIVideoWallet } from "@/hooks/useAIVideoWallet";
import { formatMoney, groupByTurn, isApprovalActionable } from "@/lib/agentStatus";
import { tx } from "@/lib/i18nText";
import { useTranslation } from "@/hooks/useTranslation";
import {
  sendAgentMessage,
  decideAgentApproval,
  decideCampaignBudgetApproval,
  listAgentConversations,
  loadAgentConversation,
  subscribeAgentConversation,
} from "@/services/muse";
import type {
  AgentApprovalQuote,
  AgentChatMessage,
  AgentOperation,
  AgentTask,
  ConversationSummary,
  StoredApproval,
  StoredCampaignApproval,
} from "@/services/muse";

const TOOL_LABELS: Record<string, { de: string; en: string; es: string }> = {
  get_user_context: { de: "Kontext gelesen", en: "Reading context", es: "Leyendo contexto" },
  get_available_video_models: { de: "Modelle geprüft", en: "Checking models", es: "Revisando modelos" },
  estimate_video_cost: { de: "Kosten berechnet", en: "Estimating cost", es: "Estimando coste" },
  generate_video: { de: "Video wird erstellt", en: "Generating video", es: "Generando vídeo" },
  get_video_status: { de: "Status geprüft", en: "Checking status", es: "Comprobando estado" },
  analyze_asset: { de: "Ergebnis geprüft", en: "Reviewing result", es: "Revisando resultado" },
  regenerate_video: { de: "Neuer Versuch", en: "Retrying", es: "Reintentando" },
  create_campaign: { de: "Kampagne angelegt", en: "Creating campaign", es: "Creando campaña" },
  research_business: { de: "Unternehmen recherchiert", en: "Researching business", es: "Investigando negocio" },
  record_research_findings: { de: "Erkenntnisse gespeichert", en: "Saving findings", es: "Guardando hallazgos" },
  discover_social_profiles: { de: "Social-Profile gesucht", en: "Finding social profiles", es: "Buscando perfiles sociales" },
  record_social_analysis: { de: "Social-Analyse gespeichert", en: "Saving social analysis", es: "Guardando análisis social" },
  collect_campaign_assets: { de: "Material gesammelt", en: "Collecting assets", es: "Reuniendo recursos" },
  identify_content_pillars: { de: "Content-Säulen", en: "Content pillars", es: "Pilares de contenido" },
  identify_business_areas: { de: "Geschäftsbereiche", en: "Business areas", es: "Áreas de negocio" },
  plan_campaign_videos: { de: "Videos geplant", en: "Planning videos", es: "Planificando vídeos" },
  write_video_scripts: { de: "Skripte & Shots", en: "Scripts & shots", es: "Guiones y tomas" },
  get_campaign: { de: "Kampagne gelesen", en: "Reading campaign", es: "Leyendo campaña" },
  route_campaign_shots: { de: "Shots geroutet", en: "Routing shots", es: "Asignando modelos" },
  estimate_campaign_budget: { de: "Budget berechnet", en: "Estimating budget", es: "Estimando presupuesto" },
  start_campaign_production: { de: "Produktion gestartet", en: "Starting production", es: "Iniciando producción" },
  review_shot: { de: "Shot geprüft", en: "Reviewing shot", es: "Revisando toma" },
  prepare_shot_retry: { de: "Retry vorbereitet", en: "Preparing retry", es: "Preparando reintento" },
  retry_shot: { de: "Shot wiederholt", en: "Retrying shot", es: "Repitiendo toma" },
  get_campaign_production_status: { de: "Produktionsstatus", en: "Production status", es: "Estado de producción" },
};

export default function AdToolAgent() {
  const { language } = useTranslation();
  const [messages, setMessages] = useState<AgentChatMessage[]>([]);
  const [operations, setOperations] = useState<AgentOperation[]>([]);
  const [searchParams, setSearchParams] = useSearchParams();
  const conversationId = searchParams.get("conversation");
  const [tasks, setTasks] = useState<AgentTask[]>([]);
  const [history, setHistory] = useState<ConversationSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const busyRef = useRef(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [usage, setUsage] = useState<{ costUsd: number } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [approvals, setApprovals] = useState<StoredApproval[]>([]);
  const [campaignApprovals, setCampaignApprovals] = useState<StoredCampaignApproval[]>([]);
  const { wallet } = useAIVideoWallet();
  const walletCurrency = wallet?.currency ?? null;
  const [focusGen, setFocusGen] = useState<{ id: string; nonce: number } | null>(null);
  const [activityOpen, setActivityOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const setConversationId = useCallback(
    (id: string | null) => {
      setSearchParams(id ? { conversation: id } : {}, { replace: false });
    },
    [setSearchParams]
  );

  const refreshHistory = useCallback(async () => {
    setHistory(await listAgentConversations());
  }, []);

  // Backend is the source of truth: (re)load the conversation from the database.
  const reload = useCallback(async (id: string | null) => {
    if (!id) {
      setMessages([]);
      setOperations([]);
      setApprovals([]);
      setCampaignApprovals([]);
      setTasks([]);
      setUsage(null);
      return;
    }
    const snap = await loadAgentConversation(id);
    if (!snap || busyRef.current) return;
    setMessages(snap.messages);
    setOperations(snap.operations);
    setApprovals(snap.approvals);
    setCampaignApprovals(snap.campaignApprovals);
    setTasks(snap.tasks);
    setUsage({ costUsd: snap.costUsd });
  }, []);

  useEffect(() => {
    void refreshHistory();
  }, [refreshHistory]);

  useEffect(() => {
    if (busyRef.current) return; // the streaming turn owns the state until it ends
    setLoading(true);
    void reload(conversationId).finally(() => setLoading(false));
  }, [conversationId, reload]);

  const waiting = tasks.some((t) => t.status === "waiting_for_generation" || t.status === "analyzing");

  // Live updates while the page is open + light polling fallback while a task is running.
  useEffect(() => {
    if (!conversationId) return;
    const unsub = subscribeAgentConversation(conversationId, () => {
      if (!busyRef.current) void reload(conversationId);
    });
    const timer = waiting ? window.setInterval(() => !busyRef.current && void reload(conversationId), 20000) : undefined;
    return () => {
      unsub();
      if (timer) window.clearInterval(timer);
    };
  }, [conversationId, waiting, reload]);

  const label = (name: string) => {
    const entry = TOOL_LABELS[name];
    return entry ? tx(entry) : name;
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    await sendText(text);
  };

  const decide = async (quote: AgentApprovalQuote, decision: "approve" | "reject") => {
    if (busy) return;
    const res = await decideAgentApproval(quote.approval_id, decision);
    if (res.ok === false) {
      const err = res.error;
      setApprovals((prev) => prev.map((a) => (a.approval_id === quote.approval_id ? { ...a, state: "error", error: err } : a)));
      return;
    }
    setApprovals((prev) =>
      prev.map((a) => (a.approval_id === quote.approval_id ? { ...a, state: decision === "approve" ? "approved" : "rejected" } : a))
    );
    await sendText(
      decision === "approve"
        ? tx({
            de: `Freigegeben: ${quote.total_cost} ${quote.currency} (approval_id ${quote.approval_id}). Bitte starte die Produktion.`,
            en: `Approved: ${quote.total_cost} ${quote.currency} (approval_id ${quote.approval_id}). Please start the production.`,
            es: `Aprobado: ${quote.total_cost} ${quote.currency} (approval_id ${quote.approval_id}). Inicia la producción.`,
          })
        : tx({
            de: "Ich habe dieses Angebot abgelehnt. Bitte nichts erzeugen.",
            en: "I declined this quote. Please do not generate anything.",
            es: "He rechazado esta oferta. No generes nada.",
          })
    );
  };

  const decideCampaign = async (quote: StoredCampaignApproval, decision: "approve" | "reject") => {
    if (busy) return;
    const res = await decideCampaignBudgetApproval(quote.approval_id, decision);
    if (res.ok === false) {
      const err = res.error;
      setCampaignApprovals((prev) => prev.map((a) => (a.approval_id === quote.approval_id ? { ...a, state: "error", error: err } : a)));
      return;
    }
    setCampaignApprovals((prev) =>
      prev.map((a) => (a.approval_id === quote.approval_id ? { ...a, state: decision === "approve" ? "approved" : "rejected" } : a))
    );
    await sendText(
      decision === "approve"
        ? tx({
            de: `Kampagnen-Budget freigegeben: ${formatMoney(quote.estimated_total, walletCurrency)} geschätzt, maximal ${formatMoney(quote.max_total, walletCurrency)} (approval_id ${quote.approval_id}). Bitte starte die Produktion.`,
            en: `Campaign budget approved: ${formatMoney(quote.estimated_total, walletCurrency)} estimated, at most ${formatMoney(quote.max_total, walletCurrency)} (approval_id ${quote.approval_id}). Please start the production.`,
            es: `Presupuesto de campaña aprobado: ${formatMoney(quote.estimated_total, walletCurrency)} estimado, máximo ${formatMoney(quote.max_total, walletCurrency)} (approval_id ${quote.approval_id}). Inicia la producción.`,
          })
        : tx({
            de: "Ich habe dieses Kampagnen-Budget abgelehnt. Bitte nichts produzieren.",
            en: "I declined this campaign budget. Please do not produce anything.",
            es: "He rechazado este presupuesto de campaña. No produzcas nada.",
          })
    );
  };

  const sendText = async (text: string) => {
    setBusy(true);
    busyRef.current = true;
    let activeId = conversationId;
    setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "user", text, createdAt: new Date().toISOString() }]);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      await sendAgentMessage({
        message: text,
        conversationId,
        language,
        signal: controller.signal,
        onEvent: (event) => {
          switch (event.type) {
            case "conversation":
              activeId = event.conversationId;
              if (event.conversationId !== conversationId) setConversationId(event.conversationId);
              break;
            case "tool_started":
              setOperations((prev) => [
                ...prev,
                { id: crypto.randomUUID(), name: event.name, status: "running", arguments: event.arguments },
              ]);
              break;
            case "tool_result": {
              const failed = !!(event.result && typeof event.result === "object" && "error" in (event.result as object));
              setOperations((prev) => {
                const next = [...prev];
                for (let i = next.length - 1; i >= 0; i--) {
                  if (next[i].name === event.name && next[i].status === "running") {
                    next[i] = {
                      ...next[i],
                      status: failed ? "failed" : "succeeded",
                      result: event.result,
                      generationId: event.generationId,
                    };
                    break;
                  }
                }
                return next;
              });
              break;
            }
            case "approval_required": {
              const ap = event.approval as AgentApprovalQuote & { kind?: string; campaign_approval_id?: string };
              if (ap.kind === "campaign_budget") {
                setCampaignApprovals((prev) => [
                  ...prev,
                  {
                    approval_id: String(ap.campaign_approval_id),
                    campaign_id: String((ap as unknown as { campaign_id: string }).campaign_id),
                    shots: (ap as unknown as { shots: StoredCampaignApproval["shots"] }).shots ?? [],
                    estimated_total: Number((ap as unknown as { estimated_total: number }).estimated_total),
                    max_total: Number((ap as unknown as { max_total: number }).max_total),
                    retry_budget_per_shot: Number((ap as unknown as { retry_budget_per_shot: number }).retry_budget_per_shot ?? 0),
                    retry_mode: ((ap as unknown as { retry_mode: string }).retry_mode === "auto_retry_within_budget"
                      ? "auto_retry_within_budget"
                      : "manual_retry") as StoredCampaignApproval["retry_mode"],
                    currency: String((ap as unknown as { currency: string }).currency ?? "EUR"),
                    sufficient_credits: (ap as unknown as { sufficient_credits?: boolean }).sufficient_credits,
                    start_expires_at: String((ap as unknown as { start_expires_at?: string }).start_expires_at ?? ""),
                    execution_expires_at: String((ap as unknown as { execution_expires_at?: string }).execution_expires_at ?? ""),
                    state: "pending",
                    created_at: new Date().toISOString(),
                  },
                ]);
              } else {
                setApprovals((prev) => [...prev, { ...event.approval, state: "pending", created_at: new Date().toISOString() }]);
              }
              break;
            }
            case "message":
              setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "assistant", text: event.text, createdAt: new Date().toISOString() }]);
              break;
            case "usage":
              setUsage({ costUsd: event.costUsd });
              break;
            case "error":
              setMessages((prev) => [
                ...prev,
                { id: crypto.randomUUID(), role: "assistant", text: event.message, status: "interrupted", error: event.message, createdAt: new Date().toISOString() },
              ]);
              break;
          }
        },
      });
    } finally {
      busyRef.current = false;
      setBusy(false);
      abortRef.current = null;
      await reload(activeId);
      void refreshHistory();
    }
  };

  // ---- turn association ---------------------------------------------------
  type Item =
    | { kind: "approval"; at?: string; a: StoredApproval }
    | { kind: "campaign"; at?: string; a: StoredCampaignApproval }
    | { kind: "task"; at?: string; t: AgentTask };
  const now = Date.now();
  // Only valid, open approvals render in the chat; everything else lives in the
  // campaign workspace's collapsed approval history.
  const items: Item[] = [
    ...approvals.filter((a) => isApprovalActionable(a.state, a.approval_expires_at, now)).map((a) => ({ kind: "approval" as const, at: a.created_at, a })),
    ...campaignApprovals.filter((a) => isApprovalActionable(a.state, a.start_expires_at, now)).map((a) => ({ kind: "campaign" as const, at: a.created_at, a })),
    ...tasks.map((t) => ({ kind: "task" as const, at: t.created_at, t })),
  ];
  const userIdx: number[] = [];
  messages.forEach((m, i) => m.role === "user" && userIdx.push(i));
  const byTurn = groupByTurn(
    userIdx.map((i) => messages[i].createdAt ?? new Date().toISOString()),
    items,
    (it) => it.at,
  );
  const turnEnd = new Map<number, number>(); // message index after which a turn's items render
  userIdx.forEach((mi, ti) => {
    const next = userIdx[ti + 1] ?? messages.length;
    turnEnd.set(next - 1, ti);
  });
  const lastUserText = (beforeIndex: number) => {
    for (let i = beforeIndex; i >= 0; i--) if (messages[i].role === "user") return messages[i].text;
    return null;
  };

  const viewClip = (generationId: string) => setFocusGen({ id: generationId, nonce: Date.now() });

  const renderItem = (it: Item) => {
    if (it.kind === "task") {
      const t = it.t;
      return (
        <div key={t.id} className="flex max-w-[85%] items-center gap-2 rounded-lg border border-border/60 bg-background/40 px-3 py-2 text-xs">
          {t.status === "waiting_for_generation" || t.status === "analyzing" ? (
            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
          ) : t.status === "failed" ? (
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-destructive" />
          ) : (
            <Clapperboard className="h-3.5 w-3.5 shrink-0 text-primary" />
          )}
          <span className="min-w-0 flex-1 truncate text-foreground">
            {t.status === "waiting_for_generation" &&
              (t.slow_since
                ? tx({ de: "Video wird erstellt (dauert länger)", en: "Generating video (taking longer)", es: "Generando vídeo (tarda más)" })
                : tx({ de: "Video wird erstellt", en: "Generating video", es: "Generando vídeo" }))}
            {t.status === "analyzing" && tx({ de: "Video fertig · wird geprüft", en: "Video done · being checked", es: "Vídeo listo · en revisión" })}
            {t.status === "completed" && tx({ de: "Video fertig · QA siehe Kampagne", en: "Video done · see QA in campaign", es: "Vídeo listo · QA en la campaña" })}
            {t.status === "failed" && `${tx({ de: "Video fehlgeschlagen", en: "Video failed", es: "El vídeo ha fallado" })}${t.error ? ` — ${t.error}` : ""}`}
            {!["waiting_for_generation", "analyzing", "completed", "failed"].includes(t.status) && t.status}
          </span>
          {t.result?.video_url && (
            <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => viewClip(t.generation_id)}>
              {tx({ de: "Clip ansehen", en: "View clip", es: "Ver clip" })}
            </Button>
          )}
        </div>
      );
    }
    if (it.kind === "approval") {
      const a = it.a;
      return (
        <div key={a.approval_id} className="max-w-[85%] rounded-2xl border border-primary/40 bg-primary/5 p-3 text-sm">
          <p className="font-medium text-foreground">{tx({ de: "Kostenfreigabe", en: "Cost approval", es: "Aprobación de coste" })}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{a.model_name ?? a.model} · {a.duration}s · {a.resolution}</p>
          <p className="mt-1 text-foreground">
            {formatMoney(a.total_cost, a.currency)}
            <span className="text-xs text-muted-foreground"> · {tx({ de: "maximal", en: "at most", es: "máximo" })} {formatMoney(a.max_total_cost, a.currency)}</span>
          </p>
          <div className="mt-2 flex gap-2">
            <Button size="sm" onClick={() => void decide(a, "approve")} disabled={busy}>{tx({ de: "Bestätigen", en: "Confirm", es: "Confirmar" })}</Button>
            <Button size="sm" variant="outline" onClick={() => void decide(a, "reject")} disabled={busy}>{tx({ de: "Ablehnen", en: "Decline", es: "Rechazar" })}</Button>
          </div>
          {a.error && <p className="mt-2 text-xs text-destructive">{a.error}</p>}
        </div>
      );
    }
    const a = it.a;
    return (
      <div key={a.approval_id} className="max-w-[85%] rounded-2xl border border-primary/40 bg-primary/5 p-3 text-sm">
        <p className="font-medium text-foreground">{tx({ de: "Kampagnen-Budget", en: "Campaign budget", es: "Presupuesto de campaña" })}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {a.shots.length} {tx({ de: "Shots — Details im Kampagnenbereich", en: "shots — details in the campaign workspace", es: "tomas: detalles en la campaña" })} ·{" "}
          {a.retry_mode === "auto_retry_within_budget"
            ? tx({ de: "automatische Wiederholungen im Budget", en: "automatic retries within budget", es: "reintentos automáticos dentro del presupuesto" })
            : tx({ de: "Wiederholungen nur nach Freigabe", en: "retries only after confirmation", es: "reintentos solo tras confirmación" })}
        </p>
        <p className="mt-1 text-foreground">
          {formatMoney(a.estimated_total, walletCurrency)}
          <span className="text-xs text-muted-foreground"> · {tx({ de: "maximal", en: "at most", es: "máximo" })} {formatMoney(a.max_total, walletCurrency)}</span>
        </p>
        {a.sufficient_credits === false && (
          <p className="mt-1 text-xs text-destructive">{tx({ de: "Guthaben reicht nicht — bitte vorher aufladen.", en: "Insufficient credits — please top up first.", es: "Créditos insuficientes: recarga primero." })}</p>
        )}
        <div className="mt-2 flex gap-2">
          <Button size="sm" onClick={() => void decideCampaign(a, "approve")} disabled={busy}>{tx({ de: "Bestätigen", en: "Confirm", es: "Confirmar" })}</Button>
          <Button size="sm" variant="outline" onClick={() => void decideCampaign(a, "reject")} disabled={busy}>{tx({ de: "Ablehnen", en: "Decline", es: "Rechazar" })}</Button>
        </div>
        {a.error && <p className="mt-2 text-xs text-destructive">{a.error}</p>}
      </div>
    );
  };

  return (
    <PageWrapper className="min-h-0">
      <div className="mx-auto flex min-h-0 w-full max-w-7xl flex-col px-4 py-6">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <Bot className="h-5 w-5" />
          </div>
          <div>
            <h1 className="font-serif text-2xl text-foreground">AdTool Agent</h1>
            <p className="text-sm text-muted-foreground">
              {tx({
                de: "Beschreibe dein Ziel — der Agent plant, rechnet die Kosten vor und produziert nach deiner Freigabe.",
                en: "Describe your goal — the agent plans, quotes the cost up front and produces once you approve.",
                es: "Describe tu objetivo: el agente planifica, calcula el coste y produce tras tu aprobación.",
              })}
            </p>
          </div>
        </div>

        <div className="grid min-h-0 gap-4 lg:h-[calc(100vh-11rem)] lg:grid-cols-[220px_minmax(0,1fr)]">
          {/* Conversation history */}
          <Card className="flex max-h-48 min-h-0 flex-col overflow-hidden border-border/60 bg-card/70 backdrop-blur lg:h-full lg:max-h-none">
            <div className="border-b border-border/60 p-3">
              <Button size="sm" variant="outline" className="w-full" onClick={() => setConversationId(null)} disabled={busy}>
                <Plus className="mr-1 h-4 w-4" />
                {tx({ de: "Neuer Chat", en: "New chat", es: "Nuevo chat" })}
              </Button>
            </div>
            <ScrollArea className="flex-1 p-2">
              {history.length === 0 ? (
                <p className="p-3 text-center text-xs text-muted-foreground">{tx({ de: "Noch keine Chats.", en: "No chats yet.", es: "Aún no hay chats." })}</p>
              ) : (
                <div className="space-y-1">
                  {history.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      disabled={busy}
                      onClick={() => setConversationId(c.id)}
                      className={cn(
                        "flex w-full items-start gap-2 rounded-md px-2 py-2 text-left text-xs transition-colors hover:bg-muted/50",
                        c.id === conversationId && "bg-primary/10 text-foreground"
                      )}
                    >
                      <MessageSquare className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="line-clamp-2">{c.title || tx({ de: "Unbenannt", en: "Untitled", es: "Sin título" })}</span>
                    </button>
                  ))}
                </div>
              )}
            </ScrollArea>
          </Card>

          {/* Conversation — the only scroll area for the chat */}
          <Card className="flex h-[75vh] min-h-0 flex-col overflow-hidden border-border/60 bg-card/70 backdrop-blur lg:h-full">
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
              {loading && messages.length === 0 && (
                <div className="flex justify-center p-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
              )}
              {!loading && messages.length === 0 && (
                <p className="p-6 text-center text-sm text-muted-foreground">
                  {tx({
                    de: "Zum Beispiel: „Erstelle mir ein 8-Sekunden-Reel für meine neue Kaffeemarke, hochkant.“",
                    en: "For example: “Make me an 8 second vertical reel for my new coffee brand.”",
                    es: "Por ejemplo: «Créame un reel vertical de 8 segundos para mi nueva marca de café».",
                  })}
                </p>
              )}
              <div className="space-y-3">
                {(byTurn.get(-1) ?? []).map(renderItem)}
                {messages.map((m, i) => {
                  const turn = turnEnd.get(i);
                  const lastTurn = turn !== undefined && turn === userIdx.length - 1;
                  const unanswered = m.role === "user" && i === messages.length - 1 && !busy;
                  return (
                    <div key={m.id} className="space-y-3">
                      {m.status === "interrupted" ? (
                        <div className="flex max-w-[85%] items-start gap-2 rounded-2xl border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm">
                          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                          <div className="min-w-0">
                            <p className="text-foreground">
                              {tx({ de: "Antwort unterbrochen — der Agent konnte diese Anfrage nicht beantworten. Es wurde nichts gestartet.", en: "Answer interrupted — the agent could not answer this request. Nothing was started.", es: "Respuesta interrumpida: el agente no pudo responder. No se inició nada." })}
                            </p>
                            {m.error && <p className="mt-1 break-words text-xs text-muted-foreground">{m.error}</p>}
                            {lastTurn && lastUserText(i) && (
                              <Button size="sm" variant="outline" className="mt-2 h-7" disabled={busy} onClick={() => void sendText(lastUserText(i)!)}>
                                <RotateCcw className="mr-1 h-3.5 w-3.5" /> {tx({ de: "Erneut fragen", en: "Ask again", es: "Preguntar de nuevo" })}
                              </Button>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div
                          className={cn(
                            "max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-4 py-3 text-sm",
                            m.role === "user" ? "ml-auto bg-primary/15 text-foreground" : "bg-muted/50 text-foreground"
                          )}
                        >
                          {m.text}
                        </div>
                      )}
                      {unanswered && (
                        <div className="flex max-w-[85%] items-start gap-2 rounded-2xl border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm">
                          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                          <div>
                            <p className="text-foreground">
                              {tx({ de: "Für diese Nachricht wurde keine Antwort gespeichert. Es wurde nichts gestartet.", en: "No answer was saved for this message. Nothing was started.", es: "No se guardó ninguna respuesta para este mensaje. No se inició nada." })}
                            </p>
                            <Button size="sm" variant="outline" className="mt-2 h-7" onClick={() => void sendText(m.text)}>
                              <RotateCcw className="mr-1 h-3.5 w-3.5" /> {tx({ de: "Erneut fragen", en: "Ask again", es: "Preguntar de nuevo" })}
                            </Button>
                          </div>
                        </div>
                      )}
                      {turn !== undefined && (byTurn.get(turn) ?? []).map(renderItem)}
                    </div>
                  );
                })}
                {busy && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {operations.length > 0 && operations[operations.length - 1].status === "running"
                      ? label(operations[operations.length - 1].name)
                      : tx({ de: "Der Agent arbeitet…", en: "The agent is working…", es: "El agente está trabajando…" })}
                  </div>
                )}
                <div ref={bottomRef} />
              </div>
            </div>

            <Collapsible open={activityOpen} onOpenChange={setActivityOpen} className="border-t border-border/60">
              <CollapsibleTrigger asChild>
                <button type="button" className="flex w-full items-center gap-2 px-4 py-2 text-xs text-muted-foreground hover:text-foreground">
                  <Wrench className="h-3.5 w-3.5" />
                  {tx({ de: "Aktivitätsdetails", en: "Activity details", es: "Detalles de actividad" })} ({operations.length})
                  {usage && <span className="ml-2">· {tx({ de: "Agent-Kosten", en: "Agent cost", es: "Coste del agente" })} ${usage.costUsd.toFixed(4)}</span>}
                  <ChevronDown className={cn("ml-auto h-3.5 w-3.5 transition-transform", activityOpen && "rotate-180")} />
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <ul className="max-h-48 space-y-1 overflow-y-auto px-4 pb-2 text-xs">
                  {operations.map((op) => {
                    const result = (op.result ?? {}) as Record<string, unknown>;
                    return (
                      <li key={op.id} className="flex items-center gap-2">
                        {op.status === "running" && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
                        {op.status === "succeeded" && <CheckCircle2 className="h-3 w-3 text-primary" />}
                        {op.status === "failed" && <AlertTriangle className="h-3 w-3 text-destructive" />}
                        <span>{label(op.name)}</span>
                        {typeof result.error === "string" && <span className="truncate text-destructive">{result.error}</span>}
                        {op.generationId && typeof result.video_url === "string" && (
                          <button type="button" className="ml-auto text-primary hover:underline" onClick={() => viewClip(op.generationId!)}>
                            {tx({ de: "Clip ansehen", en: "View clip", es: "Ver clip" })}
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </CollapsibleContent>
            </Collapsible>

            <div className="border-t border-border/60 p-3">
              <div className="flex gap-2">
                <Textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void handleSend();
                    }
                  }}
                  rows={2}
                  className="resize-none"
                  placeholder={tx({ de: "Was soll produziert werden?", en: "What should be produced?", es: "¿Qué hay que producir?" })}
                />
                <Button onClick={() => void handleSend()} disabled={busy || !input.trim()} size="icon" className="h-auto w-12">
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </Card>
        </div>
        <CampaignPanel
          conversationId={conversationId}
          currency={walletCurrency}
          focusGenerationId={focusGen}
          refreshKey={operations.length * 1000 + operations.filter((o) => o.status !== "running").length + messages.length + tasks.length}
        />
      </div>
    </PageWrapper>
  );
}

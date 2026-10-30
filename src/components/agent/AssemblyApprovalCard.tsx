import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { tx } from "@/lib/i18nText";
import { toast } from "sonner";
import {
  getAssemblyById, isStaleAssemblyError, resumeAssembly, paramsFromScope, prepareAssembly, rejectAssembly, startAssembly,
} from "@/services/muse/assemblyClient";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;

const FINAL = new Set(["done", "failed", "rejected", "superseded"]);

/** Chat approval card for one prepared assembly. Buttons are the only way to start/reject it. */
export function AssemblyApprovalCard({ prepared: initial, actionable = true, onPrepared }: { prepared: Row; actionable?: boolean; onPrepared?: () => void }) {
  // "Prepare again" swaps in the fresh package; until then this is the prop.
  const [prepared, setPrepared] = useState<Row>(initial);
  useEffect(() => { setPrepared(initial); }, [initial]);
  const id = String(prepared.assembly_id);
  const card: Row = prepared.card ?? {};
  const [job, setJob] = useState<Row | null>(null);
  const [busy, setBusy] = useState(false);
  const [stale, setStale] = useState(false);

  const load = useCallback(async () => { try { setJob(await getAssemblyById(id)); } catch { /* keep last */ } }, [id]);
  useEffect(() => { setStale(false); load(); }, [load]);
  useEffect(() => {
    if (!job || job.status !== "running") return;
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [job, load]);
  // Export finished while the step still waits → wake the worker once (no new action, lease-guarded).
  const kicked = useRef(false);
  useEffect(() => {
    const st: Row[] = Array.isArray(job?.steps) ? job!.steps : [];
    const exp = st.find((s) => s.step === "export");
    if (job?.status === "running" && exp?.status === "waiting" && job.video_export_status === "done" && !kicked.current) {
      kicked.current = true;
      resumeAssembly(id).catch(() => { kicked.current = false; });
    }
  }, [job, id]);

  if (!job) return null;
  // Superseded/rejected packages are history, not open questions.
  if (job.status === "superseded" || job.status === "rejected" || (job.status === "pending" && !actionable)) {
    return <div className="text-xs text-muted-foreground">{tx({ de: "Montage-Paket", en: "Assembly package", es: "Paquete de montaje" })} {id.slice(0, 8)} · {job.status}</div>;
  }
  const scope: Row = job.scope ?? card.scope ?? {};
  const cost: Row = job.max_cost ?? prepared.max_cost ?? {};
  const steps: Row[] = job.steps ?? [];
  const done = steps.filter((s) => s.status === "done").length;
  const current = steps.find((s) => s.status !== "done");
  const failed = steps.find((s) => s.status === "failed");
  const vStep: Row = ((scope.steps ?? []) as Row[]).find((s) => s.step === "voiceover")?.params ?? {};
  const voice: Row = card.voice ?? { voice_id: vStep.voice_id, language: vStep.language };

  const onStart = async () => {
    setBusy(true);
    try {
      await startAssembly(id);
      toast.success(tx({ de: "Montage läuft im Hintergrund.", en: "Assembly is running in the background.", es: "El montaje se ejecuta en segundo plano." }));
    } catch (e) {
      if (isStaleAssemblyError(e)) setStale(true);
      else toast.error((e as Error).message);
    } finally { setBusy(false); load(); }
  };
  const onReject = async () => {
    setBusy(true);
    try { await rejectAssembly(id); toast.success(tx({ de: "Montage abgelehnt.", en: "Assembly rejected.", es: "Montaje rechazado." })); }
    catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); load(); }
  };
  // Free: creates a new pending package with the same content; never starts it.
  const onPrepareAgain = async () => {
    if (!job.video_id) return;
    setBusy(true);
    try {
      const fresh = await prepareAssembly(String(job.video_id), paramsFromScope(scope));
      if (fresh?.assembly_id) {
        setPrepared(fresh);
        toast.success(tx({ de: "Neues Paket vorbereitet. Bitte prüfen und freigeben.", en: "New package prepared. Please review and approve.", es: "Nuevo paquete preparado. Revísalo y apruébalo." }));
        onPrepared?.();
      }
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-2 rounded-lg border border-border bg-card p-3 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{tx({ de: "Komplette Montage freigeben", en: "Approve full assembly", es: "Aprobar montaje completo" })}</span>
        <Badge variant="outline">{stale ? tx({ de: "veraltet", en: "outdated", es: "obsoleto" }) : job.status}</Badge>
      </div>
      <dl className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-0.5 text-muted-foreground">
        <dt>ID</dt><dd className="break-all font-mono">{id}</dd>
        <dt>{tx({ de: "Video", en: "Video", es: "Vídeo" })}</dt><dd>{card.video_title ?? "—"}</dd>
        <dt>{tx({ de: "Schnitt-Revision", en: "Edit revision", es: "Revisión del montaje" })}</dt><dd>{job.edit_revision ?? card.edit_revision}</dd>
        <dt>{tx({ de: "Branding", en: "Branding", es: "Marca" })}</dt><dd>{(scope.branding_mode ?? card.branding_mode) === "text_only" ? tx({ de: "nur Text", en: "text only", es: "solo texto" }) : tx({ de: "freigegebenes Logo", en: "approved logo", es: "logo aprobado" })}</dd>
        <dt>{tx({ de: "Stimme", en: "Voice", es: "Voz" })}</dt><dd>{voice.voice_name ?? "—"} ({voice.voice_id ?? "—"}, {voice.language ?? "—"})</dd>
        <dt>{tx({ de: "Max. Wallet", en: "Max wallet", es: "Máx. monedero" })}</dt><dd>{cost.wallet_usd_max} USD</dd>
        <dt>{tx({ de: "Max. Credits", en: "Max credits", es: "Máx. créditos" })}</dt><dd>{cost.legacy_credits_max}</dd>
      </dl>
      <div className="text-foreground">{tx({ de: "Es werden keine Video-Shots neu erzeugt.", en: "No video shots will be regenerated.", es: "No se regenerará ninguna toma de vídeo." })}</div>
      <ol className="grid grid-cols-2 gap-x-3 sm:grid-cols-5">
        {steps.map((st, i) => (
          <li key={st.step} className={st.status === "failed" ? "text-destructive" : st.status === "done" ? "text-foreground" : "text-muted-foreground"}>{i + 1}. {st.step} · {st.status}</li>
        ))}
      </ol>
      {job.status === "running" && (
        <div className="text-muted-foreground"><Loader2 className="mr-1 inline h-3 w-3 animate-spin" />{current?.step === "export" ? tx({ de: "Export wird gerendert…", en: "Export rendering…", es: "Renderizando exportación…" }) : current?.step === "technical_validation" ? tx({ de: "Technische Prüfung…", en: "Technical validation…", es: "Validación técnica…" }) : `${tx({ de: "Aktueller Schritt", en: "Current step", es: "Paso actual" })}: ${current?.step ?? "—"}`} · {done}/{steps.length}</div>
      )}
      {(failed || job.error) && <div className="text-destructive">{failed?.step ? `${failed.step}: ` : ""}{failed?.error ?? job.error}
        {Array.isArray(failed?.result?.items) && <ul className="mt-1 list-disc pl-4">{(failed!.result.items as Row[]).filter((x) => !x.ok).map((x) => <li key={x.code}>{x.code}: {String(x.observed)} · {tx({ de: "erwartet", en: "expected", es: "esperado" })} {String(x.expected)}</li>)}</ul>}
      </div>}
      {FINAL.has(job.status) && <div className="text-muted-foreground">{tx({ de: "Endstatus", en: "Final status", es: "Estado final" })}: {job.status}</div>}
      {job.status === "failed" && actionable && (
        <div className="space-y-2">
          <div className="text-foreground">
            {tx({
              de: "Diese Montage ist fehlgeschlagen und startet nicht erneut. Bereite ein neues Paket vor – kostenlos, startet nichts, gleicher Text, Stimme, Musik und Branding.",
              en: "This assembly failed and will not restart. Prepare a new package — free, starts nothing, same text, voice, music and branding.",
              es: "Este montaje ha fallado y no se reiniciará. Prepara un paquete nuevo: gratis, no inicia nada, mismo texto, voz, música y marca.",
            })}
          </div>
          <Button size="sm" className="h-7" disabled={busy || !job.video_id} onClick={onPrepareAgain}>
            {busy && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
            {tx({ de: "Neu vorbereiten", en: "Prepare again", es: "Preparar de nuevo" })}
          </Button>
        </div>
      )}
      {job.status === "pending" && stale && (
        <div className="space-y-2">
          <div className="text-foreground">
            {tx({
              de: "Dieses Paket ist veraltet und kann nicht gestartet werden. Bereite es neu vor – das ist kostenlos, startet nichts und übernimmt Text, Stimme, Musik und Branding.",
              en: "This package is outdated and cannot be started. Prepare it again — this is free, starts nothing and keeps the text, voice, music and branding.",
              es: "Este paquete está obsoleto y no se puede iniciar. Prepáralo de nuevo: es gratis, no inicia nada y conserva texto, voz, música y marca.",
            })}
          </div>
          <div className="flex gap-2">
            <Button size="sm" className="h-7" disabled={busy || !job.video_id} onClick={onPrepareAgain}>
              {busy && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
              {tx({ de: "Neu vorbereiten", en: "Prepare again", es: "Preparar de nuevo" })}
            </Button>
            <Button size="sm" variant="outline" className="h-7" disabled={busy} onClick={onReject}>
              {tx({ de: "Ablehnen", en: "Reject", es: "Rechazar" })}
            </Button>
          </div>
        </div>
      )}
      {job.status === "pending" && !stale && (
        <div className="flex gap-2">
          <Button size="sm" className="h-7" disabled={busy} onClick={onStart}>
            {tx({ de: "Freigeben & starten", en: "Approve & start", es: "Aprobar e iniciar" })}
          </Button>
          <Button size="sm" variant="outline" className="h-7" disabled={busy} onClick={onReject}>
            {tx({ de: "Ablehnen", en: "Reject", es: "Rechazar" })}
          </Button>
        </div>
      )}
    </div>
  );
}

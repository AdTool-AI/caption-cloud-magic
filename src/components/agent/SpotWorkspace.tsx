import { useCallback, useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Download, Loader2, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { tx } from "@/lib/i18nText";
import { toast } from "sonner";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;

const STAGES = [
  { key: "planning_done", de: "Planung fertig", en: "Plan done", es: "Plan listo" },
  { key: "clips_done", de: "Einzelclips fertig", en: "Clips done", es: "Clips listos" },
  { key: "cut_done", de: "Schnitt fertig", en: "Cut done", es: "Montaje listo" },
  { key: "export_done", de: "Export fertig", en: "Export done", es: "Exportación lista" },
  { key: "final_checked", de: "Finaler Spot geprüft", en: "Final spot checked", es: "Spot final revisado" },
] as const;

const KIND_LABEL: Record<string, { de: string; en: string; es: string }> = {
  voiceover: { de: "Voiceover", en: "Voiceover", es: "Locución" },
  music: { de: "Musik", en: "Music", es: "Música" },
  sfx: { de: "Soundeffekt", en: "Sound effect", es: "Efecto de sonido" },
  subtitles: { de: "Untertitel", en: "Subtitles", es: "Subtítulos" },
  export: { de: "Export", en: "Export", es: "Exportación" },
};

async function call(body: Row) {
  const { data, error } = await supabase.functions.invoke("campaign-spot", { body });
  if (error) {
    let msg = error.message;
    try { msg = (await (error as any).context?.json())?.error ?? msg; } catch { /* keep */ }
    throw new Error(msg);
  }
  return data;
}

async function upload(file: File, kind: string): Promise<string> {
  const { data: u } = await supabase.auth.getUser();
  const path = `${u.user!.id}/campaign-spot/${kind}-${Date.now()}-${file.name.replace(/[^\w.-]/g, "_")}`;
  const { error } = await supabase.storage.from("media-assets").upload(path, file, { upsert: false });
  if (error) throw error;
  return supabase.storage.from("media-assets").getPublicUrl(path).data.publicUrl;
}

const audioDuration = (file: File) => new Promise<number>((res, rej) => {
  const a = new Audio(URL.createObjectURL(file));
  a.onloadedmetadata = () => res(Math.round(a.duration * 100) / 100);
  a.onerror = () => rej(new Error("audio unreadable"));
});

export function SpotWorkspace({ videoId, title }: { videoId: string; title: string }) {
  const [spot, setSpot] = useState<Row | null>(null);
  const [busy, setBusy] = useState(false);
  const [voText, setVoText] = useState("");
  const [musicPrompt, setMusicPrompt] = useState("");
  const [sfxPrompt, setSfxPrompt] = useState("");
  const [sfxStart, setSfxStart] = useState("0");
  const [checks, setChecks] = useState({ voiceover_audible_correct: false, texts_readable: false, picture_ok: false });

  const run = useCallback(async (body: Row) => {
    setBusy(true);
    try { const r = await call({ video_id: videoId, ...body }); if (r?.video_id) setSpot(r); else setSpot(await call({ action: "get", video_id: videoId })); return r; }
    catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  }, [videoId]);

  useEffect(() => { run({ action: "get" }); }, [run]);
  useEffect(() => {
    if (spot?.export?.status !== "rendering") return;
    const t = setInterval(() => run({ action: "refresh_export" }), 15000);
    return () => clearInterval(t);
  }, [spot?.export?.status, run]);

  if (!spot) return <div className="p-3 text-xs text-muted-foreground"><Loader2 className="inline h-3 w-3 animate-spin" /> {title}</div>;
  const edit: Row = spot.edit ?? {};
  const save = (patch: Row) => run({ action: "save_edit", patch, expected_revision: spot.revision });
  const prepare = (kind: string, params: Row = {}) => run({ action: "prepare", kind, params });
  const approveRun = async (id: string) => { await run({ action: "approve", action_id: id }); await run({ action: "run", action_id: id }); };
  const stageIdx = STAGES.findIndex((s) => s.key === spot.stage);
  const clips: Row[] = edit.clips ?? [];
  const move = (i: number, d: number) => { const c = [...clips]; const [x] = c.splice(i, 1); c.splice(i + d, 0, x); save({ clips: c }); };
  const pending = (spot.actions ?? []).filter((a: Row) => a.status === "pending");

  return (
    <div className="space-y-3 rounded-md border border-border/60 bg-muted/20 p-3 text-xs">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="font-medium text-foreground">{title}</span>
        {STAGES.map((s, i) => (
          <Badge key={s.key} variant={i <= stageIdx ? "default" : "outline"} className="text-[10px]">{tx(s)}</Badge>
        ))}
        {spot.export_stale && <Badge variant="destructive" className="text-[10px]">{tx({ de: "Export veraltet", en: "Export outdated", es: "Exportación obsoleta" })}</Badge>}
        <span className="ml-auto text-muted-foreground">{spot.cut_seconds ?? "–"} / {edit.target_duration ?? "–"} s · {edit.aspect}</span>
      </div>
      {spot.issues?.filter((i: Row) => i.blocking).length > 0 && (
        <ul className="list-disc pl-4 text-muted-foreground">{spot.issues.filter((i: Row) => i.blocking).map((i: Row) => <li key={i.code}>{i.detail}</li>)}</ul>
      )}

      {/* Cut */}
      <section>
        <h4 className="mb-1 font-medium uppercase tracking-wide text-muted-foreground">{tx({ de: "Schnitt (vorhandene Clips)", en: "Cut (existing clips)", es: "Montaje (clips existentes)" })}</h4>
        <ol className="space-y-1">
          {clips.map((c, i) => {
            const shot = spot.shots.find((s: Row) => s.id === c.shot_id);
            return (
              <li key={c.shot_id} className="flex flex-wrap items-center gap-1.5">
                <span className="w-8 font-mono">S{shot?.index}</span>
                <select className="h-7 rounded border border-input bg-background px-1" value={c.attempt_id ?? ""} disabled={busy}
                  onChange={(e) => run({ action: "select_attempt", shot_id: c.shot_id, attempt_id: e.target.value })}>
                  {(shot?.attempts ?? []).map((a: Row) => <option key={a.id} value={a.id} disabled={!a.has_clip}>#{a.attempt_no} · {a.model} · {a.qa_verdict ?? "QA –"}</option>)}
                </select>
                <Input className="h-7 w-16" type="number" step="0.1" defaultValue={c.trim_in} onBlur={(e) => save({ clips: clips.map((x) => x.shot_id === c.shot_id ? { ...x, trim_in: Number(e.target.value) } : x) })} />
                <span>–</span>
                <Input className="h-7 w-16" type="number" step="0.1" defaultValue={c.trim_out} onBlur={(e) => save({ clips: clips.map((x) => x.shot_id === c.shot_id ? { ...x, trim_out: Number(e.target.value) } : x) })} />
                <span className="text-muted-foreground">/ {c.source_duration}s</span>
                <Button size="icon" variant="ghost" className="h-6 w-6" disabled={busy || i === 0} onClick={() => move(i, -1)} aria-label="up"><ArrowUp className="h-3 w-3" /></Button>
                <Button size="icon" variant="ghost" className="h-6 w-6" disabled={busy || i === clips.length - 1} onClick={() => move(i, 1)} aria-label="down"><ArrowDown className="h-3 w-3" /></Button>
              </li>
            );
          })}
        </ol>
      </section>

      {/* Audio */}
      <section className="space-y-1.5">
        <h4 className="font-medium uppercase tracking-wide text-muted-foreground">{tx({ de: "Ton", en: "Audio", es: "Audio" })}</h4>
        <div>
          {edit.voiceover
            ? <div className="flex items-center gap-2"><audio src={edit.voiceover.url} controls className="h-7" /><span>{edit.voiceover.source} · {edit.voiceover.duration}s</span></div>
            : <span className="text-muted-foreground">{tx({ de: "Kein Voiceover", en: "No voiceover", es: "Sin locución" })}</span>}
          <Textarea className="mt-1 min-h-[52px]" placeholder={tx({ de: "Voiceover-Text (Deutsch)", en: "Voiceover text (German)", es: "Texto de locución (alemán)" })} value={voText} onChange={(e) => setVoText(e.target.value)} />
          <div className="mt-1 flex flex-wrap gap-2">
            <Button size="sm" variant="outline" disabled={busy || !voText.trim()} onClick={() => prepare("voiceover", { text: voText, language: "de" })}>{tx({ de: "Voiceover vorbereiten", en: "Prepare voiceover", es: "Preparar locución" })}</Button>
            <label className="inline-flex cursor-pointer items-center rounded-md border border-input px-2 py-1 hover:bg-accent">
              {tx({ de: "Voiceover hochladen", en: "Upload voiceover", es: "Subir locución" })}
              <input type="file" accept="audio/*" className="hidden" onChange={async (e) => {
                const f = e.target.files?.[0]; if (!f) return;
                try { const [url, duration] = await Promise.all([upload(f, "vo"), audioDuration(f)]); await save({ voiceover: { url, duration, start: 0, volume: 1, source: "upload" } }); }
                catch (err) { toast.error((err as Error).message); }
              }} />
            </label>
            <Button size="sm" variant="outline" disabled={busy || !edit.voiceover} onClick={() => prepare("subtitles", { language: "de" })}>{tx({ de: "Untertitel aus Voiceover", en: "Subtitles from voiceover", es: "Subtítulos desde la locución" })}</Button>
          </div>
          {edit.subtitles && <p className="mt-1 text-muted-foreground">{edit.subtitles.segments.length} {tx({ de: "Untertitel-Segmente", en: "subtitle segments", es: "segmentos de subtítulos" })}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {edit.music ? <audio src={edit.music.url} controls className="h-7" /> : <span className="text-muted-foreground">{tx({ de: "Keine Musik", en: "No music", es: "Sin música" })}</span>}
          <Input className="h-7 w-48" placeholder={tx({ de: "Musik-Beschreibung", en: "Music prompt", es: "Descripción musical" })} value={musicPrompt} onChange={(e) => setMusicPrompt(e.target.value)} />
          <Button size="sm" variant="outline" disabled={busy || !musicPrompt.trim()} onClick={() => prepare("music", { prompt: musicPrompt, tier: "minimax-15" })}>{tx({ de: "Musik vorbereiten", en: "Prepare music", es: "Preparar música" })}</Button>
          {edit.music && (
            <>
              <label>{tx({ de: "Lautstärke", en: "Volume", es: "Volumen" })} <Input className="inline h-7 w-16" type="number" step="0.05" min="0" max="1" defaultValue={edit.music.volume} onBlur={(e) => save({ music: { volume: Number(e.target.value) } })} /></label>
              <label>{tx({ de: "Absenkung unter Sprache", en: "Duck under voice", es: "Atenuación bajo voz" })} <Input className="inline h-7 w-16" type="number" step="0.05" min="0" max="1" defaultValue={edit.music.duck} onBlur={(e) => save({ music: { duck: Number(e.target.value) } })} /></label>
            </>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span>{(edit.sfx ?? []).length} SFX</span>
          <Input className="h-7 w-40" placeholder={tx({ de: "Soundeffekt", en: "Sound effect", es: "Efecto" })} value={sfxPrompt} onChange={(e) => setSfxPrompt(e.target.value)} />
          <Input className="h-7 w-16" type="number" step="0.1" value={sfxStart} onChange={(e) => setSfxStart(e.target.value)} aria-label="start" />
          <Button size="sm" variant="outline" disabled={busy || !sfxPrompt.trim()} onClick={() => prepare("sfx", { prompt: sfxPrompt, start: Number(sfxStart), duration: 1.5 })}>{tx({ de: "SFX vorbereiten", en: "Prepare SFX", es: "Preparar SFX" })}</Button>
        </div>
      </section>

      {/* Text & brand */}
      <section className="space-y-1.5">
        <h4 className="font-medium uppercase tracking-wide text-muted-foreground">{tx({ de: "Texte, Logo, Endcard", en: "Texts, logo, endcard", es: "Textos, logo, cierre" })}</h4>
        {(edit.overlays ?? []).map((o: Row, i: number) => (
          <div key={o.id} className="flex flex-wrap items-center gap-1.5">
            <Input className="h-7 flex-1" defaultValue={o.text} onBlur={(e) => save({ overlays: edit.overlays.map((x: Row, j: number) => j === i ? { ...x, text: e.target.value } : x) })} />
            <Input className="h-7 w-14" type="number" step="0.1" defaultValue={o.start} onBlur={(e) => save({ overlays: edit.overlays.map((x: Row, j: number) => j === i ? { ...x, start: Number(e.target.value) } : x) })} />
            <Input className="h-7 w-14" type="number" step="0.1" defaultValue={o.end} onBlur={(e) => save({ overlays: edit.overlays.map((x: Row, j: number) => j === i ? { ...x, end: Number(e.target.value) } : x) })} />
          </div>
        ))}
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => save({ overlays: [...(edit.overlays ?? []), { id: `ov-${Date.now()}`, text: "CORDIAL", start: 0, end: 2, role: "product_name" }] })}>+ {tx({ de: "Text", en: "Text", es: "Texto" })}</Button>
        <div className="flex flex-wrap items-center gap-2">
          {edit.logo ? <img src={edit.logo.url} alt="logo" className="h-8 rounded bg-foreground/80 p-1" /> : <span className="text-muted-foreground">{tx({ de: "Kein Logo — es wird kein Ersatz erzeugt", en: "No logo — no substitute is generated", es: "Sin logo — no se genera sustituto" })}</span>}
          {(spot.logo_candidates ?? []).map((l: Row) => (
            <Button key={l.id} size="sm" variant="outline" disabled={busy} onClick={() => save({ logo: { url: l.url, rights_confirmed: false } })}>{tx({ de: "Kampagnen-Logo nutzen", en: "Use campaign logo", es: "Usar logo de campaña" })}</Button>
          ))}
          <label className="inline-flex cursor-pointer items-center rounded-md border border-input px-2 py-1 hover:bg-accent">
            {tx({ de: "Logo hochladen", en: "Upload logo", es: "Subir logo" })}
            <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
              const f = e.target.files?.[0]; if (!f) return;
              try { await save({ logo: { url: await upload(f, "logo"), rights_confirmed: false } }); } catch (err) { toast.error((err as Error).message); }
            }} />
          </label>
          {edit.logo && (
            <label className="flex items-center gap-1">
              <Checkbox checked={edit.logo.rights_confirmed} onCheckedChange={(v) => save({ logo: { url: edit.logo.url, rights_confirmed: v === true } })} />
              {tx({ de: "Nutzungsrechte bestätigt", en: "Usage rights confirmed", es: "Derechos de uso confirmados" })}
            </label>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span>{tx({ de: "Endcard", en: "Endcard", es: "Cierre" })}</span>
          <Input className="h-7 w-32" defaultValue={edit.endcard?.headline ?? ""} placeholder="Headline" onBlur={(e) => save({ endcard: { ...(edit.endcard ?? { cta: "", duration: 3 }), headline: e.target.value } })} />
          <Input className="h-7 w-40" defaultValue={edit.endcard?.cta ?? ""} placeholder="CTA" onBlur={(e) => save({ endcard: { ...(edit.endcard ?? { headline: "", duration: 3 }), cta: e.target.value } })} />
          <Input className="h-7 w-14" type="number" step="0.5" defaultValue={edit.endcard?.duration ?? 3} onBlur={(e) => save({ endcard: { ...(edit.endcard ?? { headline: "", cta: "" }), duration: Number(e.target.value) } })} />
        </div>
      </section>

      {/* Pending provider steps */}
      {pending.length > 0 && (
        <section className="space-y-1 rounded border border-primary/40 p-2">
          <h4 className="font-medium text-foreground">{tx({ de: "Freigabe nötig", en: "Approval needed", es: "Requiere aprobación" })}</h4>
          {pending.map((a: Row) => (
            <div key={a.id} className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{tx(KIND_LABEL[a.kind])}</Badge>
              <span className="text-muted-foreground">{a.cost?.provider} · {tx({ de: "intern", en: "internal", es: "interno" })}: {a.cost?.internal} · {tx({ de: "Nutzerpreis", en: "user price", es: "precio" })}: {a.cost?.user_price}</span>
              {a.requested_by === "agent" && <Badge variant="secondary" className="text-[10px]">Agent</Badge>}
              <Button size="sm" className="ml-auto h-7" disabled={busy} onClick={() => approveRun(a.id)}>{tx({ de: "Freigeben & ausführen", en: "Approve & run", es: "Aprobar y ejecutar" })}</Button>
            </div>
          ))}
        </section>
      )}

      {/* Export & checks */}
      <section className="space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" disabled={busy || spot.issues?.some((i: Row) => i.blocking)} onClick={() => prepare("export")}>{tx({ de: "Export vorbereiten (9:16)", en: "Prepare export (9:16)", es: "Preparar exportación (9:16)" })}</Button>
          {spot.export?.status && <Badge variant="outline">{spot.export.status}</Badge>}
          {spot.export?.status === "rendering" && <Button size="sm" variant="ghost" onClick={() => run({ action: "refresh_export" })}><RefreshCw className="h-3 w-3" /></Button>}
        </div>
        {spot.export?.url && (
          <div className="space-y-1">
            <video src={spot.export.url} controls className="max-h-80 rounded bg-muted" />
            <a href={spot.export.url} download className="inline-flex items-center gap-1 text-primary hover:underline"><Download className="h-3 w-3" /> {tx({ de: "Herunterladen", en: "Download", es: "Descargar" })}</a>
          </div>
        )}
        {spot.technical_check && (
          <div>
            <p className="font-medium">{tx({ de: "Technische Prüfung", en: "Technical check", es: "Revisión técnica" })}: {spot.technical_check.passed ? "✓" : "✗"}</p>
            <ul className="pl-3 text-muted-foreground">{spot.technical_check.items.map((i: Row) => <li key={i.key}>{i.ok === true ? "✓" : i.ok === false ? "✗" : "?"} {i.key}: {i.detail}</li>)}</ul>
          </div>
        )}
        {spot.export?.status === "done" && !spot.export_stale && (
          <div className="space-y-1">
            <p className="font-medium">{tx({ de: "Inhaltliche Prüfung (durch dich)", en: "Content check (by you)", es: "Revisión de contenido (por ti)" })}: {spot.content_check?.passed ? "✓" : "–"}</p>
            {([
              ["voiceover_audible_correct", { de: "Voiceover hörbar, deutsch und korrekt", en: "Voiceover audible, German and correct", es: "Locución audible, en alemán y correcta" }],
              ["texts_readable", { de: "Texte, Logo und Endcard lesbar und korrekt", en: "Texts, logo and endcard readable and correct", es: "Textos, logo y cierre legibles y correctos" }],
              ["picture_ok", { de: "Bild und Schnitt in Ordnung", en: "Picture and cut OK", es: "Imagen y montaje correctos" }],
            ] as const).map(([k, l]) => (
              <label key={k} className="flex items-center gap-1.5">
                <Checkbox checked={checks[k]} onCheckedChange={(v) => setChecks((c) => ({ ...c, [k]: v === true }))} /> {tx(l)}
              </label>
            ))}
            <Button size="sm" variant="outline" disabled={busy} onClick={() => run({ action: "confirm_content", revision: spot.revision, checks })}>{tx({ de: "Prüfung speichern", en: "Save check", es: "Guardar revisión" })}</Button>
          </div>
        )}
      </section>
    </div>
  );
}

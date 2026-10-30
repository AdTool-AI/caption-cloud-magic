import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { createPlannerBlockWriter, PlannerBlockSaveError } from '@/lib/plannerBlockWrite';
import { validatePreview, type Preview } from '@/lib/plannerRecommendationPreview';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { tx } from '@/lib/i18nText';

export function PlannerRecommendationsDialog({ open, onOpenChange, workspaceId, weekplanId, onApplied }: {
  open: boolean; onOpenChange: (open: boolean) => void; workspaceId: string | null; weekplanId?: string;
  onApplied: () => void;
}) {
  const { user } = useAuth();
  const [plans, setPlans] = useState<{ id: string; start_date: string; weeks: number }[]>([]);
  const [planId, setPlanId] = useState(weekplanId ?? '');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const writer = useRef(createPlannerBlockWriter());
  const generation = useRef(0);
  const locked = useRef(false);
  useEffect(() => () => { generation.current++; writer.current.clear(); }, []);
  useEffect(() => {
    generation.current++; writer.current.clear(); locked.current = false;
    setBusy(false); setUncertain(false); setPreview(null); setPlans([]); setPlanId(weekplanId ?? '');
  }, [user?.id, workspaceId, weekplanId]);
  useEffect(() => {
    if (!open || !workspaceId || !user || weekplanId) return;
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase.from('weekplans').select('id, start_date, weeks')
        .eq('workspace_id', workspaceId).order('start_date', { ascending: false }).limit(100);
      if (cancelled) return;
      if (error) { toast.error(tx({ de: 'Pläne konnten nicht geladen werden.', en: 'Could not load plans.', es: 'No se pudieron cargar los planes.' })); return; }
      setPlans(data ?? []);
    })();
    return () => { cancelled = true; };
  }, [open, workspaceId, user?.id, weekplanId]);
  const load = async () => {
    if (!workspaceId || !planId || !user || locked.current || uncertain) return;
    const scope = generation.current; locked.current = true; setBusy(true); setPreview(null);
    try {
      const { data, error } = await supabase.functions.invoke('planner-apply-recommendations', {
        body: { workspace_id: workspaceId, weekplan_id: planId, mode: 'new' },
      });
      if (scope !== generation.current) return;
      if (error) throw new Error('PREVIEW_UNAVAILABLE');
      setPreview(validatePreview(data, workspaceId, planId));
    } catch {
      if (scope === generation.current) toast.error(tx({ de: 'Empfehlungsvorschau ist derzeit nicht verfügbar.', en: 'Recommendation preview is currently unavailable.', es: 'La vista previa de recomendaciones no está disponible actualmente.' }));
    } finally { if (scope === generation.current) { locked.current = false; setBusy(false); } }
  };
  const apply = async () => {
    if (!preview?.suggestions.length || !user || !workspaceId || locked.current) return;
    const scope = generation.current; locked.current = true; setBusy(true); setUncertain(true);
    try {
      await writer.current.save(user.id, workspaceId, preview.suggestions,
        body => supabase.functions.invoke('planner-upsert-blocks', { body }), preview.weekplan_id);
      if (scope !== generation.current) return;
      setUncertain(false); setPreview(null); onApplied(); onOpenChange(false);
      toast.success(tx({ de: 'Entwürfe gespeichert.', en: 'Drafts saved.', es: 'Borradores guardados.' }));
    } catch (error) {
      if (scope === generation.current) {
        if (error instanceof PlannerBlockSaveError && ['WRITE_FORBIDDEN', 'RECORD_NOT_FOUND', 'REQUEST_ID_REUSED'].includes(error.code)) {
          setUncertain(false); setPreview(null);
          toast.error(tx({ de: 'Entwürfe konnten nicht gespeichert werden. Laden Sie eine neue Vorschau.', en: 'Could not save drafts. Load a new preview.', es: 'No se pudieron guardar los borradores. Carga una nueva vista previa.' }));
        } else toast.error(tx({ de: 'Speichern nicht bestätigt. Wiederholen Sie denselben Speichervorgang.', en: 'Save was not confirmed. Retry this same save to confirm the outcome.', es: 'No se confirmó el guardado. Reintenta este mismo guardado para confirmar el resultado.' }));
      }
    } finally { if (scope === generation.current) { locked.current = false; setBusy(false); } }
  };
  return <Dialog open={open} onOpenChange={next => { if (!locked.current) onOpenChange(next); }}>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{tx({ de: 'Empfehlungen prüfen', en: 'Review recommendations', es: 'Revisar recomendaciones' })}</DialogTitle>
        <DialogDescription>{tx({ de: 'Nur neue Entwürfe. Bestehende Blöcke bleiben erhalten; es werden keine Beiträge veröffentlicht.', en: 'New drafts only. Existing blocks are preserved; this does not publish posts.', es: 'Solo borradores nuevos. Se conservan los bloques existentes; no se publican posts.' })}</DialogDescription>
      </DialogHeader>
      {!weekplanId && <label>
        {tx({ de: 'Wochenplan', en: 'Week plan', es: 'Plan semanal' })}
        <select aria-label="Week plan" className="w-full rounded border bg-background p-2" value={planId} disabled={busy || uncertain}
          onChange={event => { setPlanId(event.target.value); setPreview(null); }}>
          <option value="">{tx({ de: 'Plan auswählen', en: 'Choose a plan', es: 'Seleccionar un plan' })}</option>
          {plans.map(plan => <option key={plan.id} value={plan.id}>{plan.start_date} · {plan.weeks}w</option>)}
        </select>
      </label>}
      {preview && <div className="max-h-64 overflow-auto text-sm">
        {!preview.suggestions.length && <p>{tx({ de: 'Keine Vorschläge verfügbar.', en: 'No suggestions available.', es: 'No hay sugerencias disponibles.' })}</p>}
        {preview.suggestions.map(row => <p key={row.content_id}>{row.platform} · {row.start_at} → {row.end_at}</p>)}
      </div>}
      {uncertain && <p role="status">{tx({ de: 'Ergebnis unbestätigt. Wiederholen Sie denselben Speichervorgang.', en: 'Outcome unconfirmed. Retry the same save.', es: 'Resultado no confirmado. Reintenta el mismo guardado.' })}</p>}
      <DialogFooter>
        <Button variant="outline" disabled={busy || uncertain || !planId} onClick={load}>{tx({ de: 'Vorschau laden', en: 'Load preview', es: 'Cargar vista previa' })}</Button>
        <Button disabled={busy || !preview?.suggestions.length} onClick={apply}>{uncertain
          ? tx({ de: 'Speichern wiederholen', en: 'Retry save', es: 'Reintentar guardado' })
          : tx({ de: 'Als Entwürfe speichern', en: 'Save as drafts', es: 'Guardar como borradores' })}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}

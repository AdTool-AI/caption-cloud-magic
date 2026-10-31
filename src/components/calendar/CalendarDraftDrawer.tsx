import { useEffect, useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useCalendarDraftEdit } from '@/hooks/useCalendarDraftEdit';
import { CalendarDraftEditError, type CalendarDraftSource, type CalendarDraftPatch } from '@/lib/calendarDraftEdit';
import { tx } from '@/lib/i18nText';

export interface CalendarDraftDrawerProps {
  open: boolean; eventId: string | null; workspaceId?: string | null; onClose: () => void; onUpdate?: () => void;
}
export function CalendarDraftDrawer(props: CalendarDraftDrawerProps) {
  const { user } = useAuth();
  if (!props.open || !props.eventId || !props.workspaceId || !user?.id) return null;
  return <DraftEditor key={JSON.stringify([user.id, props.workspaceId, props.eventId])} {...props} workspaceId={props.workspaceId} eventId={props.eventId} />;
}
function DraftEditor({ onClose, onUpdate, workspaceId, eventId }: CalendarDraftDrawerProps & { workspaceId: string; eventId: string }) {
  const [row, setRow] = useState<CalendarDraftSource | null>(null);
  const [form, setForm] = useState({ title: '', brief: '', caption: '', timezone: '' });
  const [loading, setLoading] = useState(true), [message, setMessage] = useState(''), [revision, reload] = useState(0);
  const { edit, pending } = useCalendarDraftEdit(workspaceId);
  useEffect(() => {
    let live = true; setLoading(true); setMessage(''); setRow(null);
    void (async () => {
      try {
        const { data, error } = await supabase.from('calendar_events').select('*').eq('workspace_id', workspaceId).eq('id', eventId).single();
        if (!live) return;
        if (error || !data || data.id !== eventId || data.workspace_id !== workspaceId) throw new Error();
        setRow(data); setForm({ title: data.title, brief: data.brief ?? '', caption: data.caption ?? '', timezone: data.timezone });
      } catch { if (live) setMessage(tx({ en: 'Could not load this draft. Try again.', de: 'Entwurf konnte nicht geladen werden. Bitte erneut versuchen.', es: 'No se pudo cargar el borrador. Inténtalo de nuevo.' })); }
      finally { if (live) setLoading(false); }
    })();
    return () => { live = false; };
  }, [workspaceId, eventId, revision]);
  async function save() {
    if (!row || pending) return;
    const patch: CalendarDraftPatch = {};
    for (const key of ['title','brief','caption','timezone'] as const) {
      if (form[key] !== (row[key] ?? '')) patch[key] = form[key];
    }
    if (!Object.keys(patch).length) return;
    setMessage('');
    try {
      const receipt = await edit(row, patch);
      if (!receipt) return;
      setRow(receipt.event); onUpdate?.();
      setMessage(tx({ en: 'Draft saved.', de: 'Entwurf gespeichert.', es: 'Borrador guardado.' }));
    } catch (error) {
      setMessage(error instanceof CalendarDraftEditError && error.code === 'DRAFT_EDIT_CONFLICT'
        ? tx({ en: 'This draft changed. Reload it before editing again.', de: 'Dieser Entwurf wurde geändert. Bitte vor der nächsten Bearbeitung neu laden.', es: 'Este borrador cambió. Vuelve a cargarlo antes de editarlo.' })
        : tx({ en: 'Draft could not be saved. Retry or reload it.', de: 'Entwurf konnte nicht gespeichert werden. Erneut versuchen oder neu laden.', es: 'No se pudo guardar el borrador. Reinténtalo o vuelve a cargarlo.' }));
    }
  }
  const editable = row?.status === 'briefing';
  return <Sheet open onOpenChange={open => { if (!open) onClose(); }}><SheetContent className="overflow-y-auto sm:max-w-xl">
    <SheetHeader><SheetTitle>{tx({ en: 'Edit draft', de: 'Entwurf bearbeiten', es: 'Editar borrador' })}</SheetTitle></SheetHeader>
    <div className="space-y-4 py-5">
      {loading ? <p role="status">{tx({ en: 'Loading…', de: 'Wird geladen…', es: 'Cargando…' })}</p> : <>
        {!editable && row && <p>{tx({ en: 'Only briefing drafts can be edited here.', de: 'Hier können nur Briefing-Entwürfe bearbeitet werden.', es: 'Aquí solo se pueden editar borradores de briefing.' })}</p>}
        {row && <fieldset disabled={!editable || pending} className="space-y-4">
          <label className="block">{tx({ en: 'Title', de: 'Titel', es: 'Título' })}<Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} /></label>
          <label className="block">Brief<Textarea value={form.brief} onChange={e => setForm({ ...form, brief: e.target.value })} /></label>
          <label className="block">{tx({ en: 'Caption', de: 'Beitragstext', es: 'Texto' })}<Textarea value={form.caption} onChange={e => setForm({ ...form, caption: e.target.value })} /></label>
          <label className="block">{tx({ en: 'Timezone', de: 'Zeitzone', es: 'Zona horaria' })}<Input value={form.timezone} onChange={e => setForm({ ...form, timezone: e.target.value })} /></label>
          <Button type="button" onClick={save}>{pending ? tx({ en: 'Saving…', de: 'Wird gespeichert…', es: 'Guardando…' }) : tx({ en: 'Save draft', de: 'Entwurf speichern', es: 'Guardar borrador' })}</Button>
        </fieldset>}
        <Button type="button" variant="outline" disabled={pending} onClick={() => reload(value => value + 1)}>{tx({ en: 'Reload draft', de: 'Entwurf neu laden', es: 'Volver a cargar' })}</Button>
        <p className="text-sm text-muted-foreground">{tx({ en: 'Saving keeps this as a draft. Publishing and media editing are not available here yet.', de: 'Der Beitrag bleibt ein Entwurf. Veröffentlichung und Medienbearbeitung sind hier noch nicht verfügbar.', es: 'Se mantiene como borrador. La publicación y edición de medios aún no están disponibles aquí.' })}</p>
      </>}
      {message && <p role="status">{message}</p>}
    </div>
  </SheetContent></Sheet>;
}

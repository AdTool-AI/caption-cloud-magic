import { tx } from '@/lib/i18nText';
import { PlannerHandoffError } from './plannerHandoff';

export function plannerHandoffErrorText(error: unknown): string {
  const code = error instanceof PlannerHandoffError ? error.code : 'HANDOFF_RETRY_REQUIRED';
  if (code === 'MEDIA_REVIEW_REQUIRED') return tx({ en: 'Media transfer is not available yet. Choose text-only drafts.', de: 'Die Medienübertragung ist noch nicht verfügbar. Bitte nur Textentwürfe auswählen.' });
  if (code === 'HANDOFF_DRAFT_REQUIRED') return tx({ en: 'Select only draft posts.', de: 'Bitte nur Entwürfe auswählen.' });
  if (code === 'HANDOFF_BATCH_LIMIT') return tx({ en: 'Select between 1 and 50 drafts.', de: 'Bitte 1 bis 50 Entwürfe auswählen.' });
  if (['HANDOFF_CONFLICT','HANDOFF_VERSION_REQUIRED','HANDOFF_SOURCE_NOT_FOUND','INVALID_HANDOFF_REQUEST'].includes(code)) return tx({ en: 'The draft changed or was already transferred. Check Calendar and reload the planner before continuing.', de: 'Der Entwurf wurde geändert oder bereits übertragen. Bitte den Kalender prüfen und den Planer neu laden.' });
  if (code === 'HANDOFF_FORBIDDEN' || code === 'UNAUTHORIZED') return tx({ en: 'Sign in with permission to edit this workspace.', de: 'Bitte mit Bearbeitungsrechten für diesen Arbeitsbereich anmelden.' });
  if (code === 'HANDOFF_SCOPE_CHANGED') return tx({ en: 'The account or workspace changed. Reload the planner.', de: 'Konto oder Arbeitsbereich wurde geändert. Bitte den Planer neu laden.' });
  return tx({ en: 'Transfer is not confirmed. Retry the same selection without editing it, or check Calendar. No automatic retry was sent.', de: 'Die Übertragung ist nicht bestätigt. Dieselbe Auswahl unverändert erneut versuchen oder den Kalender prüfen. Es wurde kein automatischer Wiederholungsversuch gesendet.' });
}

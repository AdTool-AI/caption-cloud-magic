/**
 * The ONE client path to start/reject a prepared Phase C assembly. Used by the
 * chat approval card AND the campaign workspace — both call the same
 * campaign-spot actions with the exact immutable assembly ID. Only an explicit
 * button click calls these; text messages never do.
 */
import { supabase } from '@/integrations/supabase/client';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

/** Error carrying the server's structured code (e.g. SCOPE_MISMATCH). */
export class AssemblyError extends Error {
  code: string | null;
  constructor(message: string, code: string | null) { super(message); this.code = code; }
}

/** Codes meaning "this package can never start — prepare a fresh one". */
export const STALE_CODES = new Set(['SCOPE_MISMATCH', 'EDIT_CHANGED']);
export const isStaleAssemblyError = (e: unknown) => e instanceof AssemblyError && !!e.code && STALE_CODES.has(e.code);

async function call(body: Row) {
  const { data, error } = await supabase.functions.invoke('campaign-spot', { body });
  if (error) {
    let msg = error.message;
    let code: string | null = null;
    try {
      const j = await (error as Row).context?.clone?.().json?.() ?? await (error as Row).context?.json?.();
      msg = j?.error ?? msg; code = typeof j?.code === 'string' ? j.code : null;
    } catch { /* keep */ }
    throw new AssemblyError(msg, code);
  }
  return data;
}

/**
 * Pure: rebuild prepare params from a stored package scope, so "prepare again"
 * reproduces the same content (text, voice, music, SFX, branding) and price.
 */
export function paramsFromScope(scope: Row): Row {
  const steps: Row[] = Array.isArray(scope?.steps) ? scope.steps : [];
  const p = (name: string): Row => steps.find((s) => s?.step === name)?.params ?? {};
  const vo = p('voiceover'), mu = p('music'), sf = p('sfx');
  return {
    branding_mode: scope?.branding_mode === 'approved_logo' ? 'approved_logo' : 'text_only',
    voiceover: { text: vo.text, voice_id: vo.voice_id, language: vo.language, start: vo.start },
    music: { prompt: mu.prompt, tier: mu.tier, volume: mu.volume, duck: mu.duck },
    sfx: { prompt: sf.prompt, start: sf.start, duration: sf.duration, volume: sf.volume },
  };
}

export const startAssembly = (assemblyId: string) => call({ action: 'start_assembly', assembly_id: assemblyId });
export const rejectAssembly = (assemblyId: string) => call({ action: 'reject_assembly', assembly_id: assemblyId });
/** Free: prepares a new pending package (old pending one becomes superseded). Never starts anything. */
export const prepareAssembly = (videoId: string, params: Row): Promise<Row> =>
  call({ action: 'prepare_assembly', video_id: videoId, params });
export const getAssemblyById = async (assemblyId: string): Promise<Row | null> =>
  (await call({ action: 'get_assembly_by_id', assembly_id: assemblyId }))?.assembly ?? null;
/** Read-only: assemblies of campaigns belonging to this conversation (newest first). */
export const listConversationAssemblies = async (conversationId: string): Promise<Row[]> =>
  (await call({ action: 'list_conversation_assemblies', conversation_id: conversationId }))?.assemblies ?? [];
/** Wakes the worker once for a running assembly whose export is done. Creates nothing. */
export const resumeAssembly = (assemblyId: string) => call({ action: 'resume_assembly', assembly_id: assemblyId });

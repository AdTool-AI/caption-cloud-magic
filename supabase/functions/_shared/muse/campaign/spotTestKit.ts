import type { SpotCtx } from './spotRuntime.ts';
// deno-lint-ignore no-explicit-any
type Row = Record<string, any>;

/** Minimal in-memory stand-in for the Supabase client (only what spotRuntime uses). */
export function fakeDb(tables: Record<string, Row[]>) {
  let seq = 0;
  const q = (t: string) => {
    const filters: ((r: Row) => boolean)[] = [];
    let op: 'select' | 'update' | 'insert' = 'select';
    let patch: Row = {};
    let ins: Row | null = null;
    let lim = Infinity;
    const rows = () => (tables[t] ??= []).filter((r) => filters.every((f) => f(r)));
    const exec = () => {
      if (op === 'insert') {
        const open = ['pending', 'approved', 'running'];
        if (t === 'campaign_post_actions' && tables[t].some((r) => r.video_id === ins!.video_id && r.kind === ins!.kind && open.includes(r.status))) return { data: null, error: { message: 'duplicate key' } };
        if (t === 'campaign_assembly_jobs' && (tables[t] ??= []).some((r) => r.video_id === ins!.video_id && ['pending', 'running'].includes(r.status))) return { data: null, error: { message: 'duplicate key' } };
        const r = { id: `act-${++seq}`, status: 'pending', created_at: new Date(Date.now() + seq).toISOString(), ...ins };
        tables[t].push(r); return { data: [r], error: null };
      }
      if (op === 'update') { const hit = rows(); hit.forEach((r) => Object.assign(r, patch)); return { data: hit, error: null }; }
      return { data: rows().slice(0, lim), error: null };
    };
    const b: Row = {
      select: () => b, order: () => b, limit: (n: number) => { lim = n; return b; },
      eq: (k: string, v: unknown) => { filters.push((r) => r[k] === v); return b; },
      is: (k: string, v: unknown) => { filters.push((r) => (r[k] ?? null) === v); return b; },
      in: (k: string, v: unknown[]) => { filters.push((r) => v.includes(r[k])); return b; },
      update: (p: Row) => { op = 'update'; patch = p; return b; },
      insert: (p: Row) => { op = 'insert'; ins = p; return b; },
      maybeSingle: async () => { const r = exec(); return { data: r.data?.[0] ?? null, error: r.error }; },
      single: async () => { const r = exec(); return { data: r.data?.[0] ?? null, error: r.error }; },
      then: (res: (v: unknown) => void) => res(exec()),
    };
    return b;
  };
  const rpc = async (name: string, a: Row) => {
    if (name === 'save_campaign_edit') {
      const v = tables.campaign_videos.find((r) => r.id === a.p_video && r.user_id === a.p_user);
      if (!v || (a.p_expected != null && v.edit_revision !== a.p_expected)) return { data: null, error: { message: 'EDIT_REVISION_CONFLICT' } };
      v.edit = structuredClone(a.p_edit); v.edit_revision += 1; v.final_client_ready = false;
      return { data: v.edit_revision, error: null };
    }
    if (name === 'claim_post_action') {
      const r = tables.campaign_post_actions.find((x) => x.id === a.p_id && x.user_id === a.p_user && x.status === 'approved');
      if (!r) return { data: null, error: null };
      r.status = 'running'; return { data: r, error: null };
    }
    if (name === 'start_assembly_job') {
      const r = (tables.campaign_assembly_jobs ??= []).find((x) => x.id === a.p_id && x.user_id === a.p_user && x.status === 'pending');
      if (!r) return { data: null, error: null };
      r.status = 'running'; return { data: r, error: null };
    }
    throw new Error(name);
  };
  return { from: q, rpc };
}

export const U = 'user-1';
/** Measured shape of a real 30 s 9:16 export with voiceover/music/SFX. */
export const CAFE_EXPORT = { durationSeconds: 30.0, width: 1080, height: 1920, fps: 30, container: 'mp4', sizeBytes: 19_200_000, codec: 'h264', hasVideoTrack: true, hasAudioTrack: true };
export function setup() {
  const durs = [4, 5, 5, 5, 6, 5];
  const tables: Record<string, Row[]> = {
    agent_campaigns: [{ id: 'c1', video_duration_s: 30, language: 'de' }],
    campaign_videos: [{ id: 'v1', campaign_id: 'c1', user_id: U, edit: null, edit_revision: 0, post_production: { voiceover_required: true, subtitles_required: true, music_direction: 'warm', sfx_direction: 'click', cta_text: 'Jetzt ansehen', brand_name_overlay: 'CORDIAL' } }],
    campaign_shots: durs.map((d, i) => ({ id: `s${i + 1}`, video_id: 'v1', user_id: U, shot_index: i + 1, cut_duration_s: d, current_generation_id: `g${i + 1}` })),
    campaign_shot_attempts: [...durs.map((_, i) => ({ id: `a${i + 1}`, shot_id: `s${i + 1}`, campaign_id: 'c1', attempt_no: 1, generation_id: `g${i + 1}` })), { id: 'a1b', shot_id: 's1', campaign_id: 'c1', attempt_no: 2, generation_id: 'g1b' }],
    ai_video_generations: [...durs.map((_, i) => ({ id: `g${i + 1}`, video_url: `https://x/g${i + 1}.mp4`, duration_seconds: i === 4 ? 10 : 5 })), { id: 'g1b', video_url: 'https://x/g1b.mp4', duration_seconds: 5 }],
    campaign_assets: [{ id: 'as1', campaign_id: 'c1', url: 'https://cordial/logo.svg', kind: 'logo', reuse_status: 'reuse_ok' }, { id: 'as2', campaign_id: 'c1', url: 'https://cordial/found-logo.png', kind: 'logo', reuse_status: 'reference_only', discovery_source: 'official_website' }],
    campaign_post_actions: [],
    director_cut_renders: [],
  };
  const calls: { fn: string; body: Row }[] = [];
  const fetchImpl = (async (url: string | URL, init?: RequestInit) => {
    const u = String(url);
    if (u.includes('/functions/v1/')) {
      const fn = u.split('/functions/v1/')[1];
      const body = JSON.parse(String(init?.body ?? '{}'));
      calls.push({ fn, body });
      const out: Record<string, Row> = {
        'generate-voiceover': { audioUrl: 'https://x/vo.mp3', duration: 27 },
        'generate-subtitles': { subtitles: [{ startTime: 0, endTime: 2.5, text: 'Ein Kabel.' }, { startTime: 2.5, endTime: 5, text: 'Ein Klang.' }] },
        'generate-music-track': { url: 'https://x/music.mp3' },
        'generate-scene-sfx': { url: 'https://x/sfx.mp3' },
        'render-directors-cut': { render_id: 'r1' },
      };
      if (fn === 'render-directors-cut') tables.director_cut_renders.push({ id: 'r1', status: 'rendering' });
      return new Response(JSON.stringify(out[fn]), { status: 200 });
    }
    // exported file: moov + vide + soun handlers
    const enc = (s: string) => new TextEncoder().encode(s);
    const bytes = new Uint8Array(20000);
    bytes.set(enc('moov'), 4); bytes.set(enc('hdlr'), 100); bytes.set(enc('vide'), 112); bytes.set(enc('hdlr'), 200); bytes.set(enc('soun'), 212);
    return new Response(bytes, { headers: { 'content-type': 'video/mp4' } });
  }) as typeof fetch;
  const probes: string[] = [];
  const probeMedia = async (url: string) => { probes.push(url); return { ...CAFE_EXPORT }; };
  const ctx: SpotCtx = { admin: fakeDb(tables), userId: U, userJwt: 'jwt', supabaseUrl: 'https://proj.supabase.co', anonKey: 'anon', fetchImpl, probeMedia };
  return { tables, ctx, calls, probes };
}


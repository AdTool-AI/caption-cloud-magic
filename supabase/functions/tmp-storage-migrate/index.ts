// TEMPORARY storage migration utility (source project -> NEW_SUPABASE_URL).
// Admin-only. Never deletes source files. Remove after the migration.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const SRC_URL = Deno.env.get('SUPABASE_URL')!;
const SRC_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const DST_URL = (Deno.env.get('NEW_SUPABASE_URL') ?? '').replace(/\/+$/, '');
const DST_KEY = Deno.env.get('NEW_SUPABASE_SECRET_KEY') ?? '';
const TIME_BUDGET_MS = 100_000;
const CONCURRENCY = 3;

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b, null, 2), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const src = createClient(SRC_URL, SRC_KEY, { auth: { persistSession: false } });
const dst = () => createClient(DST_URL, DST_KEY, { auth: { persistSession: false } });
const enc = (p: string) => p.split('/').map(encodeURIComponent).join('/');
const dstHeaders = () => ({ Authorization: `Bearer ${DST_KEY}`, apikey: DST_KEY });

async function dstObjectSize(bucket: string, name: string): Promise<number | null> {
  const r = await fetch(`${DST_URL}/storage/v1/object/${bucket}/${enc(name)}`, { method: 'HEAD', headers: dstHeaders() });
  if (!r.ok) return null; // missing or ghost metadata row without a physical file
  const len = r.headers.get('content-length');
  return len ? Number(len) : -1;
}

async function ensureBucket(bucket: string) {
  const { data: b, error } = await src.storage.getBucket(bucket);
  if (error || !b) throw new Error(`source bucket ${bucket}: ${error?.message}`);
  const d = dst();
  const existing = await d.storage.getBucket(bucket);
  if (existing.data) {
    if (existing.data.public !== b.public) await d.storage.updateBucket(bucket, { public: b.public });
    return { created: false, public: b.public };
  }
  const { error: cErr } = await d.storage.createBucket(bucket, {
    public: b.public,
    fileSizeLimit: b.file_size_limit ?? undefined,
    allowedMimeTypes: b.allowed_mime_types ?? undefined,
  });
  if (cErr && !/exists/i.test(cErr.message)) throw new Error(`create dest bucket ${bucket}: ${cErr.message}`);
  return { created: true, public: b.public };
}

async function upload(bucket: string, obj: { name: string; mimetype: string | null; cache_control: string | null }) {
  const doUpload = async () => {
    const s = await fetch(`${SRC_URL}/storage/v1/object/authenticated/${bucket}/${enc(obj.name)}`, {
      headers: { Authorization: `Bearer ${SRC_KEY}`, apikey: SRC_KEY },
    });
    if (!s.ok || !s.body) throw new Error(`source download ${s.status}`);
    const headers: Record<string, string> = {
      ...dstHeaders(),
      'x-upsert': 'true',
      'content-type': obj.mimetype || s.headers.get('content-type') || 'application/octet-stream',
      'cache-control': obj.cache_control ? (obj.cache_control.startsWith('max-age') ? obj.cache_control : `max-age=${obj.cache_control}`) : 'max-age=3600',
    };
    const len = s.headers.get('content-length');
    if (len) headers['content-length'] = len;
    // Stream server-to-server; the file never has to fit in memory.
    const r = await fetch(`${DST_URL}/storage/v1/object/${bucket}/${enc(obj.name)}`, {
      method: 'POST', headers, body: s.body,
      // @ts-ignore Deno streaming upload
      duplex: 'half',
    });
    if (!r.ok) throw new Error(`dest upload ${r.status}: ${(await r.text()).slice(0, 300)}`);
  };
  try {
    await doUpload();
  } catch (e) {
    // Ghost metadata row blocking the upsert: remove the dangling row, retry once.
    const del = await fetch(`${DST_URL}/storage/v1/object/${bucket}`, {
      method: 'DELETE', headers: { ...dstHeaders(), 'content-type': 'application/json' },
      body: JSON.stringify({ prefixes: [obj.name] }),
    });
    await del.text();
    try { await doUpload(); } catch (e2) { throw new Error(`${(e as Error).message} | retry: ${(e2 as Error).message}`); }
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    // Admin check
    const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
    const { data: u } = await src.auth.getUser(token);
    if (!u?.user) return json({ error: 'unauthorized' }, 401);
    const { data: isAdmin } = await src.rpc('has_role', { _user_id: u.user.id, _role: 'admin' });
    if (!isAdmin) return json({ error: 'forbidden' }, 403);
    if (!DST_URL || !DST_KEY) return json({ error: 'NEW_SUPABASE_URL / NEW_SUPABASE_SECRET_KEY missing' }, 500);

    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? 'list');

    if (action === 'list') {
      const { data: buckets, error } = await src.storage.listBuckets();
      if (error) throw error;
      const { data: counts, error: cErr } = await src.rpc('tmp_storage_migration_counts');
      if (cErr) throw cErr;
      const dstB = await dst().storage.listBuckets();
      return json({
        mode: 'dry-run',
        buckets: buckets.map((b) => {
          const c = (counts as any[]).find((x) => x.bucket_id === b.id);
          return { bucket: b.id, public: b.public, objects: Number(c?.objects ?? 0), bytes: Number(c?.bytes ?? 0),
            existsInDestination: !!dstB.data?.find((d) => d.id === b.id) };
        }),
      });
    }

    if (action !== 'copy' && action !== 'verify') return json({ error: 'action must be list | copy | verify' }, 400);
    const bucket = String(body.bucket ?? '');
    if (!bucket) return json({ error: 'bucket required' }, 400);
    const limit = Math.min(Math.max(Number(body.limit ?? 50), 1), 500);
    const dryRun = body.dryRun === true;
    let cursor: string = typeof body.cursor === 'string' ? body.cursor : '';

    const bucketInfo = action === 'copy' && !dryRun ? await ensureBucket(bucket) : null;
    const { data: rows, error } = await src.rpc('tmp_storage_migration_list', { _bucket: bucket, _after: cursor, _limit: limit });
    if (error) throw error;
    const objs = (rows ?? []) as { name: string; size: number; mimetype: string | null; cache_control: string | null }[];

    const started = Date.now();
    const res = { copied: 0, skipped: 0, missing: 0, present: 0, failed: 0, wouldCopy: 0 };
    const failures: { name: string; error: string }[] = [];
    let processed = 0;

    for (let i = 0; i < objs.length; i += CONCURRENCY) {
      if (Date.now() - started > TIME_BUDGET_MS) break;
      const chunk = objs.slice(i, i + CONCURRENCY);
      await Promise.all(chunk.map(async (o) => {
        try {
          if (o.name.endsWith('/.emptyFolderPlaceholder') && action === 'copy' && !dryRun) { /* still copy, harmless */ }
          const size = await dstObjectSize(bucket, o.name);
          const exists = size !== null && (size === -1 || Number(o.size) === 0 || size === Number(o.size));
          if (action === 'verify') { exists ? res.present++ : res.missing++; if (!exists) failures.push({ name: o.name, error: 'missing in destination' }); return; }
          if (exists) { res.skipped++; return; }
          if (dryRun) { res.wouldCopy++; return; }
          await upload(bucket, o);
          res.copied++;
        } catch (e) {
          res.failed++;
          failures.push({ name: o.name, error: (e as Error).message });
        }
      }));
      processed = i + chunk.length;
      cursor = chunk[chunk.length - 1].name;
    }

    const done = processed === objs.length && objs.length < limit;
    return json({
      action, bucket, dryRun, bucketInfo, batchSize: objs.length, processed, ...res, failures,
      nextCursor: done ? null : cursor, done,
      hint: done ? 'Bucket finished.' : 'Call again with the same bucket and cursor = nextCursor.',
    });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});

// TEMPORARY admin tool: copies Storage files to the new backend. Remove after migration.
import { useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';

type Bucket = { bucket: string; public: boolean; objects: number; bytes: number; existsInDestination: boolean };

export default function TmpStorageMigration() {
  const [buckets, setBuckets] = useState<Bucket[]>([]);
  const [log, setLog] = useState<string[]>([]);
  const [running, setRunning] = useState<string | null>(null);
  const stopRef = useRef(false);
  const add = (s: string) => setLog((l) => [`${new Date().toLocaleTimeString()} ${s}`, ...l].slice(0, 500));

  const call = async (body: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke('tmp-storage-migrate', { body });
    if (error) throw new Error(error.message);
    return data;
  };

  const list = async () => {
    try { const d = await call({ action: 'list' }); setBuckets(d.buckets); add(`Listed ${d.buckets.length} buckets`); }
    catch (e) { add(`ERROR ${(e as Error).message}`); }
  };

  const run = async (bucket: string, action: 'copy' | 'verify', dryRun = false) => {
    const key = `cursor:${action}:${bucket}`;
    let cursor = localStorage.getItem(key) ?? '';
    setRunning(bucket); stopRef.current = false;
    const tot = { copied: 0, skipped: 0, failed: 0, missing: 0, present: 0, wouldCopy: 0 };
    try {
      for (;;) {
        const d = await call({ action, bucket, cursor, limit: 50, dryRun });
        for (const k of Object.keys(tot) as (keyof typeof tot)[]) tot[k] += d[k] ?? 0;
        d.failures?.forEach((f: any) => add(`  ✗ ${bucket}/${f.name}: ${f.error}`));
        add(`${bucket} ${action}${dryRun ? ' (dry)' : ''}: ${JSON.stringify(tot)} next=${d.nextCursor ?? 'DONE'}`);
        if (d.done || !d.nextCursor) { localStorage.removeItem(key); break; }
        cursor = d.nextCursor; if (!dryRun) localStorage.setItem(key, cursor);
        if (stopRef.current) break;
      }
    } catch (e) { add(`ERROR ${bucket}: ${(e as Error).message} (resume continues from saved cursor)`); }
    setRunning(null);
  };

  return (
    <div className="container mx-auto p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Temporary Storage Migration</h1>
      <p className="text-sm text-muted-foreground">Copies files to the new backend. Source files are never deleted. Progress resumes automatically.</p>
      <Button onClick={list}>1. Dry-run: list buckets</Button>
      <table className="w-full text-sm">
        <thead><tr className="text-left"><th>Bucket</th><th>Public</th><th>Objects</th><th>MB</th><th>In dest</th><th /></tr></thead>
        <tbody>
          {buckets.map((b) => (
            <tr key={b.bucket} className="border-t border-border">
              <td>{b.bucket}</td><td>{b.public ? 'yes' : 'no'}</td><td>{b.objects}</td>
              <td>{(b.bytes / 1e6).toFixed(1)}</td><td>{b.existsInDestination ? 'yes' : 'no'}</td>
              <td className="space-x-2 py-1">
                <Button size="sm" variant="outline" disabled={!!running} onClick={() => run(b.bucket, 'copy', true)}>Dry-run</Button>
                <Button size="sm" disabled={!!running} onClick={() => run(b.bucket, 'copy')}>Copy / resume</Button>
                <Button size="sm" variant="secondary" disabled={!!running} onClick={() => run(b.bucket, 'verify')}>Verify</Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {running && <Button variant="destructive" onClick={() => { stopRef.current = true; }}>Stop after current batch ({running})</Button>}
      <pre className="bg-muted p-3 text-xs max-h-[600px] overflow-auto whitespace-pre-wrap">{log.join('\n')}</pre>
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { readAwsBootstrap, type AwsBootstrapSummary } from '@/lib/awsBootstrap';
import AwsCalendarReadValidation from '@/components/AwsCalendarReadValidation';

export default function AwsValidation() {
  const { user, session, loading, signIn, signOut, requiresMfa, subscriptionCheckStatus } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [summary, setSummary] = useState<AwsBootstrapSummary | null>(null);
  const generation = useRef(0);
  const scope = useRef(session?.access_token);
  scope.current = session?.access_token;

  useEffect(() => {
    generation.current++;
    setSummary(null); setMessage(''); setBusy(false);
    return () => { generation.current++; };
  }, [session?.access_token]);

  async function login(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setMessage('');
    try {
      const result = await signIn(email.trim(), password);
      if (result.error) setMessage('Sign-in failed. Check your credentials and AWS account setup.');
    } catch { setMessage('Sign-in could not complete.'); }
    finally { setPassword(''); setBusy(false); }
  }
  async function validate() {
    if (!session || session.user.id !== user?.id || requiresMfa) return;
    const run = ++generation.current; const accessToken = session.access_token;
    setBusy(true); setSummary(null); setMessage('');
    try {
      const result = await readAwsBootstrap(supabase, session);
      if (run === generation.current && scope.current === accessToken) setSummary(result);
    } catch {
      if (run === generation.current && scope.current === accessToken) setMessage('Validation could not complete. API access, account scope or the session needs review.');
    } finally {
      if (run === generation.current && scope.current === accessToken) setBusy(false);
    }
  }
  const visible = summary?.userId === user?.id ? summary : null;
  const button = 'rounded bg-slate-900 px-4 py-2 text-white disabled:opacity-50';
  return <main className="mx-auto max-w-2xl space-y-5 p-6">
    <h1 className="text-2xl font-semibold">AWS connection validation</h1>
    <p>Backend: <strong>{new URL(import.meta.env.VITE_SUPABASE_URL).hostname}</strong></p>
    <p className="rounded border border-amber-400 bg-amber-50 p-3 text-slate-900">
      Limited validation only. Billing, global admin access and the full application are unavailable here.
      No paid actions, content changes or publishing are enabled by this screen.
    </p>
    {loading ? <p role="status">Checking session…</p> : !user ?
      <form onSubmit={login} className="space-y-3">
        <p>Use a provisioned AWS test account. Self-service signup, Google login and password recovery are unavailable here.</p>
        <label className="block">Email<input className="mt-1 block w-full rounded border p-2" type="email" autoComplete="username" required value={email} onChange={event => setEmail(event.target.value)} /></label>
        <label className="block">Password<input className="mt-1 block w-full rounded border p-2" type="password" autoComplete="current-password" required value={password} onChange={event => setPassword(event.target.value)} /></label>
        <button className={button} disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form> : <section className="space-y-3">
        <p>Signed in as {user.email}</p>
        <p>Subscription check: {subscriptionCheckStatus === 'unavailable' ? 'unavailable; paid access is not granted' : 'not verified'}. Global admin access: unavailable.</p>
        {requiresMfa ? <p role="alert">This account requires an MFA challenge. Validation cannot continue on this screen.</p> :
          <button className={button} disabled={busy} onClick={validate}>{busy ? 'Validating…' : 'Validate account reads and catalogs'}</button>}
        <button className="ml-3 rounded border px-4 py-2" disabled={busy} onClick={async () => {
          generation.current++; setSummary(null); setMessage('');
          try { await signOut(); } catch { setMessage('Sign-out could not complete.'); }
        }}>Sign out</button>
      </section>}
    {message && <p role="alert">{message}</p>}
    {!loading && !requiresMfa && session?.access_token && session.user.id === user?.id &&
      <AwsCalendarReadValidation key={session.access_token} session={session} />}
    {visible && <section aria-label="Validation results" className="space-y-2">
      <h2 className="text-lg font-semibold">Selected reads completed</h2>
      <p>Counts are rows returned for this account, not totals for the service. An empty role result grants no global privileges. An empty template catalog can be valid.</p>
      <pre className="overflow-auto rounded bg-slate-100 p-3 text-sm text-slate-900">{JSON.stringify({
        backend: new URL(import.meta.env.VITE_SUPABASE_URL).hostname,
        reads: visible.tables, pricingModels: visible.pricingModels, visibleTemplates: visible.visibleTemplates,
        subscription: 'unavailable', globalAdminAccess: false, fullApplicationAccepted: false,
      }, null, 2)}</pre>
    </section>}
  </main>;
}

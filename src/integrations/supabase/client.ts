import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';
import { awsTestAuthStorageKey } from '@/lib/backendTarget';
import { createAwsValidationFetch } from '@/lib/awsValidationFetch';
import { readAwsEmailCallback } from '@/lib/awsEmailAuth';

export const awsEmailCallback = typeof window !== 'undefined' ? readAwsEmailCallback(window.location) : {kind:'none' as const};

// Canonical values are supplied only by the mandatory AWS Vite configuration.
const url = import.meta.env.VITE_SUPABASE_URL;
const publicKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const supabase = createClient<Database>(url, publicKey, {
  global: { fetch: createAwsValidationFetch((input, init) => globalThis.fetch(input, init), url) },
  auth: {
    storage: typeof window !== 'undefined' ? window.localStorage : undefined,
    storageKey: awsTestAuthStorageKey(url), persistSession: true, autoRefreshToken: true,
    detectSessionInUrl: 'accessToken' in awsEmailCallback,
  },
  realtime: { params: { eventsPerSecond: 5 } },
});

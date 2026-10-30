/**
 * Backend-Health Smoke — ohne Browser, direkter HTTP-Check.
 * Schnell (< 5s gesamt), fängt Backend-Ausfälle ab.
 */
import { test, expect } from '@playwright/test';

const SUPABASE_URL = 'https://lbunafpxuskwmsrraqxl.supabase.co';
const ANON_KEY =
  'REDACTED_TOKEN_CONFIGURE_ON_TARGET';

test.describe('Backend Health', () => {
  test('Supabase REST ist erreichbar (kein 5xx)', async ({ request }) => {
    const resp = await request.get(`${SUPABASE_URL}/rest/v1/`, {
      headers: { apikey: ANON_KEY },
    });
    expect(resp.status(), `REST-Endpoint Status`).toBeLessThan(500);
  });

  test('Supabase Auth Health-Endpoint antwortet', async ({ request }) => {
    const resp = await request.get(`${SUPABASE_URL}/auth/v1/health`, {
      headers: { apikey: ANON_KEY },
    });
    expect(resp.status(), `Auth-Health Status`).toBeLessThan(500);
  });

  test('Edge Functions Domain ist erreichbar', async ({ request }) => {
    // OPTIONS auf eine bekannte Function-URL — sollte CORS-Header liefern, nicht 5xx
    const resp = await request.fetch(
      `${SUPABASE_URL.replace('.supabase.co', '.functions.supabase.co')}/ingest-e2e-results`,
      { method: 'OPTIONS' }
    );
    expect(resp.status(), `Edge-Function OPTIONS Status`).toBeLessThan(500);
  });
});

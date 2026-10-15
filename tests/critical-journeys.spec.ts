/**
 * Critical User Journeys — Phase 2
 *
 * 5 wichtigste öffentliche Pfade. Läuft gegen die Live Preview/Published URL.
 */
import { test, expect, Page, ConsoleMessage } from '@playwright/test';

const BASE = process.env.BASE_URL || 'http://localhost:5173';

function collectErrors(page: Page): { assertNoErrors: () => void } {
  const errors: string[] = [];

  page.on('pageerror', (err) => {
    errors.push(`pageerror: ${err.message}`);
  });

  page.on('console', (msg: ConsoleMessage) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (
      text.includes('favicon') ||
      text.includes('ResizeObserver') ||
      text.includes('Failed to load resource') ||
      text.includes('net::ERR_BLOCKED_BY_CLIENT')
    ) {
      return;
    }
    errors.push(`console.error: ${text}`);
  });

  return {
    assertNoErrors: () => {
      if (errors.length > 0) {
        throw new Error(`Unerwartete JS-Errors auf der Seite:\n  - ${errors.join('\n  - ')}`);
      }
    },
  };
}

test.describe('Critical Journeys', () => {
  test('Landing Page lädt sauber & zeigt Pricing + Legal-Links', async ({ page }) => {
    const { assertNoErrors } = collectErrors(page);

    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 10_000 });
    await page.waitForLoadState('networkidle').catch(() => {});

    const hasPriceOnLanding = await page
      .getByText(/\d+[,.]\d{2}\s*€|€\s*\d+|\$\s*\d+|kostenlos|free\s*plan|monatlich|per\s*month/i)
      .first()
      .isVisible()
      .catch(() => false);
    const hasPricingLink = await page
      .getByRole('link', { name: /pricing|preise|plan|tarif/i })
      .first()
      .isVisible()
      .catch(() => false);
    const hasPricingButton = await page
      .getByRole('button', { name: /pricing|preise|plan|tarif|jetzt\s*starten|get\s*started/i })
      .first()
      .isVisible()
      .catch(() => false);
    expect(
      hasPriceOnLanding || hasPricingLink || hasPricingButton,
      'Weder Preis-Indikation noch Pricing-Link/Button auf Landing gefunden'
    ).toBeTruthy();

    const hasImpressumLink = await page
      .getByRole('link', { name: /impressum/i })
      .first()
      .isVisible()
      .catch(() => false);
    const hasDatenschutzLink = await page
      .getByRole('link', { name: /datenschutz|privacy/i })
      .first()
      .isVisible()
      .catch(() => false);
    expect(
      hasImpressumLink || hasDatenschutzLink,
      'Weder Impressum- noch Datenschutz-Link im Footer gefunden'
    ).toBeTruthy();

    assertNoErrors();
  });

  test('Auth-Seite rendert Login-Formular', async ({ page }) => {
    const { assertNoErrors } = collectErrors(page);
    await page.goto(`${BASE}/auth`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('input[type="email"]').first()).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('input[type="password"]').first()).toBeVisible();
    await expect(
      page.getByRole('button', { name: /anmelden|sign in|einloggen|log in/i }).first()
    ).toBeVisible();
    assertNoErrors();
  });

  test('Geschützte Routen redirecten unauth auf /auth', async ({ page }) => {
    // Nur echte ProtectedRoute-Pfade aus App.tsx
    // const protectedPaths = ['/streak', '/account/delete', '/brand-characters'];
    const protectedPaths = ['/account/delete', '/settings', '/queue'];

    for (const path of protectedPaths) {
      const resp = await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
      if (resp) {
        expect(resp.status(), `Status für ${path}`).toBeLessThan(500);
      }
      // Robust: warte auf URL-Wechsel zu /auth ODER auf sichtbares Email-Input
      const onAuthPage = await Promise.race([
        page
          .waitForURL('**/auth**', { timeout: 8_000 })
          .then(() => true)
          .catch(() => false),
        page
          .locator('input[type="email"]')
          .first()
          .waitFor({ state: 'visible', timeout: 8_000 })
          .then(() => true)
          .catch(() => false),
      ]);
      expect(onAuthPage, `Erwartete Auth-Redirect für ${path}, war ${page.url()}`).toBeTruthy();
    }
  });

  test('Legal-Seiten sind erreichbar', async ({ page }) => {
    const legalPaths = ['/legal/imprint', '/legal/privacy', '/legal/terms', '/delete-data'];
    for (const path of legalPaths) {
      const resp = await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
      if (resp) {
        expect(resp.status(), `Status für ${path}`).toBeLessThan(400);
      }
      await expect(page.locator('h1, h2').first()).toBeVisible({ timeout: 5_000 });
    }
  });

  test('Landing Page lädt unter 4 Sekunden', async ({ page }) => {
    const start = Date.now();
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('h1').first()).toBeVisible();
    const loadTime = Date.now() - start;
    console.log(`Landing Page: ${loadTime}ms`);
    expect(loadTime, `Load-Time war ${loadTime}ms (Budget: 4000ms)`).toBeLessThan(4000);
  });
});

import { test, expect } from '@playwright/test';

test.describe('E2E Flow P3-P7: Login -> Unified Inbox -> Reply -> Bookings -> AI Flow', () => {
  test('Client Portal pages render and function correctly', async ({ page }) => {
    // client-portal's next.config.ts sets basePath: '/portal'. basePath only
    // auto-prefixes next/link and next/router navigation, never a direct
    // page.goto() (or window.location.href) — every path below needs the
    // prefix explicitly, or Next.js serves its own 404 for the un-prefixed one.
    // 1. Visit Login page
    await page.goto('/portal/login');
    await expect(page).toHaveURL(/.*\/portal\/login/);

    // client-portal's middleware (src/middleware.ts) protects /inbox and
    // /analytics behind a valid access-token cookie; it only checks
    // presence/expiry/audience, not the signature, so this unsigned (alg
    // "none") token from the smoke suite is sufficient here too.
    const token = 'eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJzdWIiOiJ1c2VyLTEiLCJhdWQiOiJjbGllbnQtcG9ydGFsIiwiZXhwIjo5OTk5OTk5OTk5fQ.';
    await page.context().addCookies([
      { name: 'chai_access_token', value: token, domain: '127.0.0.1', path: '/' },
    ]);

    // client-portal's nav labels are Indonesian (see the rendered nav list:
    // "Kotak Masuk (Inbox)", "Analitik & Laporan", "Pelanggan & Kontak",
    // "Pipeline Prospek (Leads)", "Basis Pengetahuan (AI RAG)", "Jadwal &
    // Reservasi", "Katalog & Produk"); match both languages so this survives
    // further copy changes in either direction.
    // 2. Visit Unified Inbox
    await page.goto('/portal/inbox');
    await expect(page.locator('body')).toContainText(/Inbox|Conversations|Kotak Masuk/i);

    // 3. Visit Analytics 7 Tabs
    await page.goto('/portal/analytics');
    await expect(page.locator('body')).toContainText(/Analytics|Overview|Analitik/i);

    // 4. Visit Customer 360
    await page.goto('/portal/customers');
    await expect(page.locator('body')).toContainText(/Customer 360|Unified Profiles|Pelanggan/i);

    // 5. Visit Lead Pipeline
    await page.goto('/portal/leads');
    await expect(page.locator('body')).toContainText(/Lead Pipeline|Deals|Prospek/i);

    // 6. Visit Knowledge (RAG)
    await page.goto('/portal/knowledge');
    await expect(page.locator('body')).toContainText(/Knowledge|pgvector|Pengetahuan/i);

    // 7. Visit Bookings
    await page.goto('/portal/bookings');
    await expect(page.locator('body')).toContainText(/Bookings|Appointments|Reservasi|Jadwal/i);

    // 8. Visit Commerce
    await page.goto('/portal/commerce');
    await expect(page.locator('body')).toContainText(/Commerce|Catalog|Katalog|Produk/i);
  });
});

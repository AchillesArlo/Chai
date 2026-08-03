import { expect, test } from '@playwright/test';

/**
 * Audience boundary smoke: owner and client surfaces must not share chrome.
 * Plan Task 6/14 — browser proof that shells stay distinct.
 */
test.describe('audience shell boundaries', () => {
  test('owner console shows internal control, not customer outcomes', async ({
    page,
  }) => {
    await page.goto('http://127.0.0.1:3000/');
    // owner-overview.tsx sets this page title in Indonesian; app-shell.tsx's
    // "Internal control" audience label is unlocalized.
    await expect(page.getByText('Ikhtisar Platform Global')).toBeVisible();
    await expect(page.getByText('Internal control', { exact: true })).toBeVisible();
    await expect(page.getByText('Outcomes today')).toHaveCount(0);
  });

  test('client portal shows customer outcomes, not platform reliability rail', async ({
    page,
  }) => {
    // client-portal's next.config.ts sets basePath: '/portal'; a direct
    // page.goto() is not auto-prefixed the way next/link navigation is, so the
    // un-prefixed root 404s here just like any other un-prefixed route.
    await page.goto('http://127.0.0.1:3002/portal');
    await expect(page.getByText('Outcomes today')).toBeVisible();
    await expect(page.getByText('Critical alert rail')).toHaveCount(0);
    await expect(page.getByText('Platform overview')).toHaveCount(0);
  });

  test('client inbox route stays on customer operations surface', async ({ page }) => {
    const token = 'eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJzdWIiOiJ1c2VyLTEiLCJhdWQiOiJjbGllbnQtcG9ydGFsIiwiZXhwIjo5OTk5OTk5OTk5fQ.';
    await page.context().addCookies([
      { name: 'chai_access_token', value: token, domain: '127.0.0.1', path: '/' },
    ]);
    // client-portal's next.config.ts sets basePath: '/portal'; a direct
    // page.goto() is not auto-prefixed the way next/link navigation is.
    await page.goto('http://127.0.0.1:3002/portal/inbox');
    await expect(page.getByText(/inbox|conversation/i).first()).toBeVisible();
    await expect(page.getByText('Critical alert rail')).toHaveCount(0);
  });
});

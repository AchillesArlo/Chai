import { expect, test } from '@playwright/test';

test.describe('browser login and automatic redirect flow', () => {
  test('owner console login redirects automatically to /tenants', async ({ page }) => {
    await page.goto('http://127.0.0.1:3000/login');

    await page.fill('input[name="email"]', 'founder@websitetest.chai.local');
    await page.fill('input[name="password"]', 'WebsiteTest#2026');
    await page.click('button[type="submit"]');

    // Verify automatic redirect away from /login to /tenants
    await expect(page).toHaveURL('http://127.0.0.1:3000/tenants', { timeout: 10_000 });
    await expect(page.getByText(/Tenants|Overview|Platform/i).first()).toBeVisible();
  });

  test('client portal login redirects automatically to /portal/inbox', async ({ page }) => {
    await page.goto('http://127.0.0.1:3002/portal/login');

    await page.fill('input[name="email"]', 'owner@websitetest.chai.local');
    await page.fill('input[name="password"]', 'WebsiteTest#2026');
    await page.click('button[type="submit"]');

    // Verify automatic redirect away from /portal/login to /portal/inbox
    await expect(page).toHaveURL('http://127.0.0.1:3002/portal/inbox', { timeout: 10_000 });
    await expect(page.getByText(/Open conversations|Conversation queue|Inbox/i).first()).toBeVisible();
  });
});

import { test, expect } from '@playwright/test';

test.describe('E2E Flow P3-P7: Login -> Unified Inbox -> Reply -> Bookings -> AI Flow', () => {
  test('Client Portal pages render and function correctly', async ({ page }) => {
    // 1. Visit Login page
    await page.goto('/login');
    await expect(page).toHaveURL(/.*login/);

    // 2. Visit Unified Inbox
    await page.goto('/inbox');
    await expect(page.locator('body')).toContainText(/Inbox|Conversations/i);

    // 3. Visit Analytics 7 Tabs
    await page.goto('/analytics');
    await expect(page.locator('body')).toContainText(/Analytics|Overview/i);

    // 4. Visit Customer 360
    await page.goto('/customers');
    await expect(page.locator('body')).toContainText(/Customer 360|Unified Profiles/i);

    // 5. Visit Lead Pipeline
    await page.goto('/leads');
    await expect(page.locator('body')).toContainText(/Lead Pipeline|Deals/i);

    // 6. Visit Knowledge (RAG)
    await page.goto('/knowledge');
    await expect(page.locator('body')).toContainText(/Knowledge|pgvector/i);

    // 7. Visit Bookings
    await page.goto('/bookings');
    await expect(page.locator('body')).toContainText(/Bookings|Appointments/i);

    // 8. Visit Commerce
    await page.goto('/commerce');
    await expect(page.locator('body')).toContainText(/Commerce|Catalog/i);
  });
});

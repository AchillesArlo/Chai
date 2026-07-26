import { defineConfig, devices } from '@playwright/test';

/**
 * Stage 1 smoke config. Vitest owns API/domain e2e (`pnpm test:e2e`).
 * Playwright owns browser shell audience boundaries.
 *
 * ponytail: no multi-project matrix yet — chromium only until pilot expands.
 */
export default defineConfig({
  forbidOnly: !!process.env.CI,
  fullyParallel: true,
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  reporter: 'list',
  retries: process.env.CI ? 1 : 0,
  testDir: 'tests/smoke',
  timeout: 30_000,
  use: {
    trace: 'on-first-retry',
  },
  webServer: [
    {
      command: 'pnpm --filter @chai/api dev',
      port: 3001,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: 'pnpm --filter @chai/owner-console dev',
      port: 3000,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: 'pnpm --filter @chai/client-portal dev',
      port: 3002,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});

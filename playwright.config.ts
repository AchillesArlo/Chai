import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright owns two kinds of spec here, in the SAME run:
 *  - `tests/smoke/**` — browser shell audience boundaries (`page` fixture).
 *  - `tests/security/**` and `tests/e2e/**` — API-level security/isolation
 *    checks against the running API, plus a few browser-driven flows
 *    (`request`/`page` fixtures). These were written against Playwright but
 *    had no `testDir`/`testMatch` naming them, so `pnpm test:smoke` never ran
 *    them (REQ-02-018): they were not skipped on purpose, they were simply
 *    unreachable by any script.
 * Vitest still owns API/domain integration e2e (`pnpm test:e2e`, S1-S5 suites
 * under `vitest.integration.config.ts`) — this file must not grow into those.
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
  testDir: 'tests',
  testMatch: [
    'smoke/**/*.spec.ts',
    'security/**/*.spec.ts',
    'e2e/**/*.spec.ts',
  ],
  timeout: 30_000,
  use: {
    // tests/e2e/p3-p7-flow.spec.ts navigates with page-relative paths
    // (`page.goto('/login')`); client-portal is the client-facing surface
    // those routes belong to.
    baseURL: 'http://127.0.0.1:3002',
    trace: 'on-first-retry',
  },
  webServer: [
    {
      command: 'pnpm --filter @chai/api dev',
      // x-test-subject (tests/security, tests/e2e) is only honoured when
      // APP_ENV is 'local' or 'test' (apps/api/src/auth/local-identity.ts);
      // main.ts defaults APP_ENV to 'production' when unset, which made
      // registerLocalIdentityHook a silent no-op for every request this
      // server ever served under this config. Without this, every spec that
      // was just added to testMatch above would fail closed on 401.
      //
      // CHAI_CAPABILITY_PAYMENT_ORCHESTRATION: optional capabilities default
      // OFF per tenant (apps/api/src/modules/entitlements/entitlement.service.ts)
      // so a tenant that never bought payments cannot reach the payment
      // surface. tests/e2e/payment-flow.spec.ts and
      // tests/security/tenant-isolation.spec.ts's payment-session case need
      // it on; without this env var every checkout call 403s with
      // FEATURE_NOT_ENABLED before the test's own assertions run.
      env: {
        ...process.env,
        APP_ENV: 'test',
        CHAI_CAPABILITY_PAYMENT_ORCHESTRATION: 'true',
      },
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

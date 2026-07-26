import { defineConfig } from 'vitest/config';

/**
 * S-series integration test config (S1-S5).
 * Runs the Staging / Load / Chaos / Pentest suites in-process.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'tests/integration/**/*.test.ts',
      'tests/staging/**/*.test.ts',
      'tests/load/**/*.test.ts',
      'tests/chaos/**/*.test.ts',
      'tests/pentest/**/*.test.ts',
    ],
    exclude: ['**/node_modules/**'],
    passWithNoTests: true,
    testTimeout: 60_000,
  },
});

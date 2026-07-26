import { defineConfig } from 'vitest/config';

export default defineConfig({
  oxc: {
    jsx: {
      runtime: 'automatic',
      importSource: 'react',
      development: true,
    },
  },
  test: {
    environment: 'jsdom',
    // jsdom needs seconds just to boot an environment, and the root test script
    // runs every package in parallel; the 5s default turns CPU contention into
    // phantom failures. Calibration for real hardware, not a licence for slow
    // tests.
    hookTimeout: 30_000,
    testTimeout: 30_000,
    include: ['src/**/*.test.tsx'],
    setupFiles: ['./src/test-setup.ts'],
  },
});

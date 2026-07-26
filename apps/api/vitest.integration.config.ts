import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    fileParallelism: false,
    globalSetup: ['./test/integration/global-setup.ts'],
    hookTimeout: 120_000,
    include: ['test/integration/**/*.integration.test.ts'],
    testTimeout: 60_000,
  },
});

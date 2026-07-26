import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    fileParallelism: false,
    globalSetup: ['./test/global-setup.ts'],
    hookTimeout: 120_000,
    include: ['test/**/*.integration.test.ts'],
    testTimeout: 30_000,
  },
});

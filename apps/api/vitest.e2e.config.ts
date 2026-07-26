import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    hookTimeout: 30_000,
    include: [
      'test/**/*.e2e.test.ts',
      'test/isolation/**/*.e2e.test.ts',
      'test/chaos/**/*.e2e.test.ts',
    ],
    testTimeout: 30_000,
  },
});

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
    },
    exclude: [
      '**/e2e/**',
      '**/*.e2e.test.ts',
      '**/*.integration.test.ts',
      '**/node_modules/**',
    ],
    include: ['**/*.test.ts'],
  },
});

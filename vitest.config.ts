import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: [
      'packages/shared/src/**/*.test.ts',
      'apps/server/tests/**/*.test.ts',
      'apps/web/src/**/*.test.ts',
    ],
    testTimeout: 20_000,
    hookTimeout: 60_000,
    fileParallelism: false,
    coverage: {
      provider: 'v8',
      include: ['packages/shared/src/**/*.ts'],
      exclude: ['**/*.test.ts'],
      thresholds: { statements: 90, branches: 90, functions: 90, lines: 90 },
    },
  },
});

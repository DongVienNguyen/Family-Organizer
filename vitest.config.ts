import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // These tests run in the separate mandatory Windows Playwright job.
    exclude: [...configDefaults.exclude, 'tests/e2e/**'],
    pool: 'forks', // Legacy fixtures use process.chdir; worker threads cannot do that.
    setupFiles: ['tests/setup.ts'],
    testTimeout: 10_000,
    hookTimeout: 10_000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts', 'src/**/*.tsx', 'server/**/*.ts'],
      exclude: ['**/*.test.ts', '**/*.test.tsx', '**/*.d.ts'],
      reportsDirectory: 'reports/coverage',
      reporter: ['text-summary', 'json', 'json-summary', 'lcov', 'html'],
    },
  },
});

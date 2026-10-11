import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    pool: 'forks', // Legacy fixtures use process.chdir; worker threads cannot do that.
    setupFiles: ['tests/setup.ts'],
    testTimeout: 10_000,
    hookTimeout: 10_000,
  },
});

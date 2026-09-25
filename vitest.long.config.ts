import { defineConfig } from 'vitest/config';

// Long suite (exhaustive oracles, large simulations). Runs only in the manual workflow.
export default defineConfig({
  test: {
    include: ['tests/long/**/*.test.ts'],
    environment: 'node',
    passWithNoTests: true,
    testTimeout: 0,
    hookTimeout: 0,
  },
});

import { defineConfig } from 'vitest/config';

// Fast suite: unit, property and fast statistical tests. Runs in CI and in `npm run check`.
export default defineConfig({
  test: {
    include: ['tests/{unit,property,statistical}/**/*.test.{ts,tsx}'],
    environment: 'node',
    passWithNoTests: false,
  },
});

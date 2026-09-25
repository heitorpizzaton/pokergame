import { defineConfig, devices } from '@playwright/test';
import { chromiumOnly } from './playwright.config.ts';

const PORT = 4174;

/**
 * Visual regression of the table at every size, portrait and landscape (AGENTS.md §13.3). It runs
 * against the seeded e2e build, so each screenshot shows the same deal. Baselines are generated
 * and compared only in CI, with the official Playwright Chromium, because pixels depend on the
 * browser build (ADR-023). Update them with the `update-visual-baselines` PR label.
 */
export default defineConfig({
  testDir: 'tests/visual',
  snapshotPathTemplate: '{testDir}/__screenshots__/{projectName}/{arg}{ext}',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  expect: {
    toHaveScreenshot: { animations: 'disabled', caret: 'hide', maxDiffPixelRatio: 0.01 },
  },
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'portrait',
      use: {
        ...devices['Pixel 7'],
        ...chromiumOnly,
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 1,
      },
    },
    {
      name: 'landscape',
      use: {
        ...devices['Pixel 7 landscape'],
        ...chromiumOnly,
        viewport: { width: 844, height: 390 },
        deviceScaleFactor: 1,
      },
    },
  ],
  webServer: {
    command: `npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
  },
});

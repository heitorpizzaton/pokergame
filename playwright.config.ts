import { existsSync } from 'node:fs';
import { chromium, defineConfig, devices } from '@playwright/test';

const PORT = 4173;

// Some sandboxes ship a preinstalled Chromium that does not match this Playwright release.
// PLAYWRIGHT_CHROMIUM_EXECUTABLE points at it explicitly; otherwise the known sandbox path is
// used only when Playwright's own browser is missing. CI installs the matching browser.
function chromiumExecutable(): string | undefined {
  const fromEnv = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
  if (fromEnv) return fromEnv;
  if (existsSync(chromium.executablePath())) return undefined;
  const sandboxChromium = '/opt/pw-browsers/chromium';
  return existsSync(sandboxChromium) ? sandboxChromium : undefined;
}

const executablePath = chromiumExecutable();

// Every project runs on Chromium; the device descriptors only supply viewport, touch and
// user-agent settings. See docs/DECISIONS.md (ADR-004).
const chromiumOnly = {
  browserName: 'chromium' as const,
  ...(executablePath ? { launchOptions: { executablePath } } : {}),
};

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [
    // Section 2.8: every screen must work at 360×640 portrait.
    { name: 'min-360x640', use: { ...devices['Galaxy S5'], ...chromiumOnly } },
    { name: 'iphone-se', use: { ...devices['iPhone SE (3rd gen)'], ...chromiumOnly } },
    { name: 'pixel-7', use: { ...devices['Pixel 7'], ...chromiumOnly } },
    { name: 'ipad', use: { ...devices['iPad (gen 7)'], ...chromiumOnly } },
    {
      name: 'desktop',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
        ...chromiumOnly,
      },
    },
  ],
  webServer: {
    command: `npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
  },
});

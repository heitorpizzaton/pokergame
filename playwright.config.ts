import { existsSync } from 'node:fs';
import { chromium, defineConfig, devices } from '@playwright/test';

const PORT = 4173;

// Local-only escape hatch: some sandboxes ship a preinstalled Chromium that does not match this
// Playwright release. Outside CI, PLAYWRIGHT_CHROMIUM_EXECUTABLE points at it explicitly, or the
// known sandbox path is used when Playwright's own browser is missing. In CI the fallback is
// disabled: the workflow installs the official browser (`npx playwright install --with-deps
// chromium`), and a missing browser must fail loudly instead of silently testing another build.
export function chromiumExecutable(): string | undefined {
  if (process.env.CI) return undefined;
  const fromEnv = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
  if (fromEnv) return fromEnv;
  if (existsSync(chromium.executablePath())) return undefined;
  const sandboxChromium = '/opt/pw-browsers/chromium';
  return existsSync(sandboxChromium) ? sandboxChromium : undefined;
}

const executablePath = chromiumExecutable();

// Every project runs on Chromium; the device descriptors only supply viewport, touch and
// user-agent settings. See docs/DECISIONS.md (ADR-004).
export const chromiumOnly = {
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

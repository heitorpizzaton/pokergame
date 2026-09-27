import { defineConfig } from '@playwright/test';
import base from './playwright.config.ts';

/**
 * `npm run looks`: renders the three candidate looks of the 3D table (AGENTS.md §28, Phase V2)
 * into docs/looks/ for the owner to choose from. Not part of CI.
 */
export default defineConfig({
  ...base,
  testDir: 'tests/looks',
  workers: 1,
  fullyParallel: false,
  projects: (base.projects ?? []).filter((p) => p.name === 'pixel-7' || p.name === 'desktop'),
});

import { defineConfig } from '@playwright/test';
import base from './playwright.config.ts';

/**
 * The main-thread budget check (AGENTS.md §12) runs on its own, one browser at a time: in the
 * parallel e2e run, other browsers compete for the CPU and would be measured as long tasks.
 */
export default defineConfig({
  ...base,
  testDir: 'tests/perf',
  workers: 1,
  fullyParallel: false,
  projects: (base.projects ?? []).filter((p) => p.name === 'pixel-7' || p.name === 'desktop'),
});

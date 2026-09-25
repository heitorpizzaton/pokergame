import { expect, test } from '@playwright/test';
import { strings } from '../../src/i18n/index.ts';

/**
 * AGENTS.md §12: no main-thread task over 50 ms during play. The browser reports every task
 * longer than 50 ms as a `longtask` entry; none may appear while hands are played with
 * animations on (NPCs and equity run in workers).
 */
test('no long main-thread tasks while playing', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/?speed=fast');
  await page.getByRole('button', { name: strings.menu.newGame }).click();
  await page.getByRole('button', { name: strings.setup.start }).click();
  await expect(page.getByTestId('action-bar').or(page.getByTestId('pre-action-bar'))).toBeVisible({
    timeout: 20_000,
  });
  // Start measuring once the table is up (loading the app is covered by Lighthouse).
  await page.evaluate(() => {
    const w = window as unknown as { longTasks: number[] };
    w.longTasks = [];
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) w.longTasks.push(Math.round(entry.duration));
    }).observe({ type: 'longtask' });
  });
  const handNumber = page.getByTestId('hand-number');
  const hand = async () =>
    Number(
      /\d+/.exec((await handNumber.textContent({ timeout: 1000 }).catch(() => '')) ?? '')?.[0] ?? 0,
    );
  const start = await hand();
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if ((await hand()) >= start + 3 || (await page.getByTestId('summary-screen').isVisible()))
      break;
    const call = page.getByTestId('act-call');
    if (await call.isVisible().catch(() => false)) await call.click().catch(() => undefined);
    else await page.waitForTimeout(100);
  }
  const longTasks = await page.evaluate(
    () => (window as unknown as { longTasks: number[] }).longTasks,
  );
  expect(longTasks).toEqual([]);
});

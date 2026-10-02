import { expect, type Page, test } from '@playwright/test';
import { strings } from '../../src/i18n/index.ts';

/** AGENTS.md §19: Desligado / Minimizado (default) / Expandido, remembered between games. */

// Counts the requests sent to the equity worker, to prove "off" computes nothing for display.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { equityRequests: number };
    w.equityRequests = 0;
    const Original = window.Worker;
    window.Worker = class extends Original {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        if (String(url).includes('equity')) {
          const post = this.postMessage.bind(this);
          this.postMessage = (message: unknown, transfer?: unknown) => {
            const type = (message as { type?: string } | null)?.type;
            if (type === 'compute' || type === 'versus') w.equityRequests++;
            post(message, transfer as Transferable[]);
          };
        }
      }
    };
  });
});

async function startGame(page: Page): Promise<void> {
  await page.goto('/?speed=instant');
  await page.getByRole('button', { name: strings.menu.newGame }).click();
  await page.getByRole('button', { name: strings.setup.start }).click();
  await expect(page.getByTestId('action-bar')).toBeVisible({ timeout: 20_000 });
}

test('starts minimized on a fresh profile and remembers the expanded state', async ({ page }) => {
  await startGame(page);
  const panel = page.getByTestId('odds-panel');
  await expect(panel).toHaveAttribute('data-state', 'minimized');
  // §31.1.2: the minimized pill hides the number, and nothing is computed until it is opened.
  await expect(panel).toHaveText(new RegExp(strings.odds.reveal));
  await expect(page.getByTestId('odds-equity')).toHaveCount(0);
  await expect(page.getByTestId('odds-details')).toHaveCount(0);
  expect(
    await page.evaluate(() => (window as unknown as { equityRequests: number }).equityRequests),
  ).toBe(0);

  await panel.click();
  await expect(panel).toHaveAttribute('data-state', 'expanded');
  await expect(page.getByTestId('odds-details')).toBeVisible();
  await expect(page.getByTestId('odds-equity')).toHaveText(/%$/, { timeout: 20_000 });

  await page.reload();
  await page.getByRole('button', { name: strings.menu.newGame }).click();
  await page.getByRole('button', { name: strings.setup.start }).click();
  await expect(page.getByTestId('odds-panel')).toHaveAttribute('data-state', 'expanded', {
    timeout: 20_000,
  });

  await page.getByTestId('odds-minimize').click();
  await expect(page.getByTestId('odds-panel')).toHaveAttribute('data-state', 'minimized');
  await page.reload();
  await page.getByRole('button', { name: strings.menu.newGame }).click();
  await page.getByRole('button', { name: strings.setup.start }).click();
  await expect(page.getByTestId('odds-panel')).toHaveAttribute('data-state', 'minimized', {
    timeout: 20_000,
  });
});

test('turning it off stops every probability computation for display', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('mesa-viva:settings', JSON.stringify({ oddsPanel: false }));
  });
  await startGame(page);
  // Play a few decisions, then check that nothing was asked of the equity worker. Checking or
  // folding never risks the stack, so the game cannot end before the toggle below.
  for (let i = 0; i < 6; i++) {
    const check = page.getByRole('button', { name: strings.actions.check, exact: true });
    const fold = page.getByTestId('act-fold');
    if (await check.isVisible().catch(() => false)) await check.click().catch(() => undefined);
    else if (await fold.isVisible().catch(() => false)) await fold.click().catch(() => undefined);
    await page.waitForTimeout(150);
  }
  await expect(page.getByTestId('odds-panel')).toHaveCount(0);
  expect(
    await page.evaluate(() => (window as unknown as { equityRequests: number }).equityRequests),
  ).toBe(0);

  // Turning it back on and opening it computes again.
  await page.getByTestId('odds-toggle').click();
  await expect(page.getByTestId('odds-panel')).toBeVisible({ timeout: 20_000 });
  await page.getByTestId('odds-panel').click();
  await expect
    .poll(() =>
      page.evaluate(() => (window as unknown as { equityRequests: number }).equityRequests),
    )
    .toBeGreaterThan(0);
});

test('swiping the expanded panel down minimizes it', async ({ page }) => {
  await startGame(page);
  const panel = page.getByTestId('odds-panel');
  await panel.click();
  await expect(panel).toHaveAttribute('data-state', 'expanded');
  const box = await panel.boundingBox();
  if (!box) throw new Error('no panel');
  const x = box.x + box.width / 2;
  const y = box.y + 10;
  await panel.evaluate(
    (el, { x, y }) => {
      const touch = (clientY: number) =>
        new Touch({ identifier: 1, target: el, clientX: x, clientY });
      el.dispatchEvent(
        new TouchEvent('touchstart', {
          bubbles: true,
          touches: [touch(y)],
          changedTouches: [touch(y)],
        }),
      );
      el.dispatchEvent(
        new TouchEvent('touchend', { bubbles: true, touches: [], changedTouches: [touch(y + 80)] }),
      );
    },
    { x, y },
  );
  await expect(page.getByTestId('odds-panel')).toHaveAttribute('data-state', 'minimized');
});

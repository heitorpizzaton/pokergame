import { expect, type Page, test } from '@playwright/test';
import { strings } from '../../src/i18n/index.ts';

async function startGame(page: Page, query: string, players = 3): Promise<void> {
  await page.goto(`/${query}`);
  await page.getByRole('button', { name: strings.menu.newGame }).click();
  const count = page.getByTestId('player-count');
  for (let i = 0; i < 10 && Number(await count.textContent()) !== players; i++) {
    const current = Number(await count.textContent());
    await page
      .getByRole('button', { name: current < players ? strings.setup.more : strings.setup.fewer })
      .click();
  }
  await page.getByRole('button', { name: strings.setup.start }).click();
  await expect(page.getByTestId('table-screen')).toBeVisible();
}

/** Plays the user's turns with check/fold until `done` holds or `timeoutMs` elapses. */
async function checkFoldUntil(
  page: Page,
  done: () => Promise<boolean>,
  timeoutMs = 25_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await done()) return;
    const fold = page.getByTestId('act-fold');
    const call = page.getByTestId('act-call');
    if (await fold.isVisible().catch(() => false)) await fold.click().catch(() => undefined);
    else if (await call.isVisible().catch(() => false)) await call.click().catch(() => undefined);
    else await page.waitForTimeout(100);
  }
  expect(await done()).toBe(true);
}

/** True once the table shows hand `n` or later (instant speed can skip past polls). */
async function handAtLeast(page: Page, n: number): Promise<boolean> {
  const text =
    (await page
      .getByTestId('hand-number')
      .textContent()
      .catch(() => null)) ?? '';
  const match = /(\d+)\s*$/.exec(text);
  return match !== null && Number(match[1]) >= n;
}

async function openSettings(page: Page): Promise<void> {
  await page.goto('/?speed=instant');
  await page.getByRole('button', { name: strings.menu.settings }).click();
  await expect(page.getByTestId('settings-screen')).toBeVisible();
}

test('the odds panel shows equity and can be toggled off and on', async ({ page }) => {
  await startGame(page, '?speed=instant');
  const panel = page.getByTestId('odds-panel');
  await expect(panel).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('odds-equity')).toHaveText(/%$/, { timeout: 20_000 });
  await page.getByTestId('odds-toggle').click();
  await expect(panel).toBeHidden();
  await page.getByTestId('odds-toggle').click();
  await expect(panel).toBeVisible();
});

test('the timer expires, the user is marked away, and "Voltar" returns control', async ({
  page,
}) => {
  await startGame(page, '?speed=instant&timerMs=700&bankMs=300');
  await expect(page.getByTestId('action-bar')).toBeVisible({ timeout: 20_000 });
  // Do nothing: after 1 s the timer and bank run out.
  await expect(page.getByText(strings.table.away)).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: strings.table.back, exact: true }).click();
  await expect(page.getByText(strings.table.away)).toBeHidden();
});

test('rabbit hunt reveals the cards that would have come', async ({ page }) => {
  test.setTimeout(90_000);
  await startGame(page, '?speed=fast', 2);
  const rabbit = page.getByTestId('rabbit-hunt');
  await checkFoldUntil(page, () => rabbit.isVisible().catch(() => false), 75_000);
  await rabbit.click();
  await expect(page.getByText(strings.table.rabbitCards)).toBeVisible();
  await expect(page.getByTestId('board').locator('[data-card]')).toHaveCount(5);
});

test('hand history: enable, play, open the replayer and export', async ({ page }) => {
  test.setTimeout(90_000);
  await openSettings(page);
  await page.getByRole('switch', { name: strings.settings.handHistory }).check();
  await page.getByRole('button', { name: strings.settings.back }).click();
  await page.getByRole('button', { name: strings.menu.newGame }).click();
  await page.getByRole('button', { name: strings.setup.start }).click();
  // Play until hand 3 starts (two hands recorded).
  await checkFoldUntil(page, () => handAtLeast(page, 3));
  await page.getByRole('button', { name: strings.table.pause }).click();
  await page.getByRole('button', { name: strings.pause.quit }).click();
  await page.getByRole('button', { name: strings.pause.confirmQuitYes }).click();
  await page.getByRole('button', { name: strings.menu.history }).click();
  const items = page.getByTestId('history-item');
  await expect(items.first()).toBeVisible();
  expect(await items.count()).toBeGreaterThanOrEqual(2);
  await items.first().click();
  await expect(page.getByTestId('replayer')).toBeVisible();
  const step = page.getByTestId('replay-step');
  const first = await step.textContent();
  await page.getByTestId('replay-next').click();
  await expect(step).not.toHaveText(first ?? '');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: strings.history.exportHand }).click();
  expect((await download).suggestedFilename()).toMatch(/^mesa-viva-mao-\d+\.txt$/);
});

test('history is off by default and records nothing', async ({ page }) => {
  await startGame(page, '?speed=instant');
  await checkFoldUntil(page, () => handAtLeast(page, 2));
  const stored = await page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        const open = indexedDB.open('mesa-viva', 1);
        open.onupgradeneeded = () => open.result.createObjectStore('hands', { keyPath: 'id' });
        open.onsuccess = () => {
          const req = open.result.transaction('hands').objectStore('hands').count();
          req.onsuccess = () => {
            resolve(req.result);
          };
        };
      }),
  );
  expect(stored).toBe(0);
});

test('autosave and resume after closing the app', async ({ page }) => {
  await startGame(page, '?speed=instant');
  await checkFoldUntil(page, () => handAtLeast(page, 3));
  await page.reload();
  await page.getByRole('button', { name: strings.menu.continueGame }).click();
  await expect(page.getByTestId('table-screen')).toBeVisible();
  await expect(page.getByTestId('hand-number')).toBeVisible();
  expect(await handAtLeast(page, 3)).toBe(true);
});

test('settings persist and the all-in confirmation appears when enabled', async ({ page }) => {
  await openSettings(page);
  await page.getByRole('switch', { name: strings.settings.confirmAllIn }).check();
  await page.getByRole('switch', { name: strings.settings.fourColorDeck }).check();
  await page.reload();
  await page.getByRole('button', { name: strings.menu.settings }).click();
  await expect(page.getByRole('switch', { name: strings.settings.confirmAllIn })).toBeChecked();
  await page.getByRole('button', { name: strings.settings.back }).click();
  await page.getByRole('button', { name: strings.menu.newGame }).click();
  await page.getByRole('button', { name: strings.setup.start }).click();
  const raise = page.getByTestId('act-raise');
  await checkFoldUntil(page, () => raise.isVisible().catch(() => false));
  await page.getByTestId('preset-allIn').click();
  await raise.click();
  await expect(page.getByTestId('confirm-all-in')).toBeVisible();
});

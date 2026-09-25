import { expect, type Page, test } from '@playwright/test';
import { strings } from '../../src/i18n/index.ts';

/** Seed 1 of the seeded e2e build: shoving every hand heads-up wins the game. */
const WINNING_SEED = 1;

async function startHeadsUp(page: Page, seed: number): Promise<void> {
  await page.goto(`/?seed=${seed}&speed=instant`);
  await expect(page.locator('html')).toHaveAttribute('data-rng', 'mesa-viva-seeded-debug');
  await page.getByRole('button', { name: strings.menu.newGame }).click();
  const count = page.getByTestId('player-count');
  for (let i = 0; i < 10 && Number(await count.textContent()) !== 2; i++) {
    await page.getByRole('button', { name: strings.setup.fewer }).click();
  }
  await page.getByRole('button', { name: '1.000', exact: true }).click();
  await page.getByRole('button', { name: strings.setup.start }).click();
}

async function userHole(page: Page): Promise<string[]> {
  await expect(page.getByTestId('action-bar')).toBeVisible({ timeout: 20_000 });
  return page
    .getByTestId('seat-user')
    .locator('[data-card]')
    .evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.card ?? ''));
}

test('the seeded debug build deals the same game for the same seed', async ({ page }) => {
  await startHeadsUp(page, 7);
  const first = await userHole(page);
  await startHeadsUp(page, 7);
  expect(await userHole(page)).toEqual(first);
});

test('winning a game reaches the victory summary (seeded build)', async ({ page }) => {
  test.setTimeout(90_000);
  await startHeadsUp(page, WINNING_SEED);
  const summary = page.getByTestId('summary-screen');
  for (let turn = 0; turn < 60; turn++) {
    await expect(page.getByTestId('action-bar').or(summary)).toBeVisible({ timeout: 20_000 });
    if (await summary.isVisible()) break;
    const raise = page.getByTestId('act-raise');
    if (await raise.isVisible()) {
      await page.getByTestId('preset-allIn').click();
      await raise.click();
    } else {
      await page.getByTestId('act-call').click();
    }
  }
  await expect(summary).toHaveAttribute('data-result', 'victory');
  await expect(page.getByTestId('finishing-place')).toHaveText(strings.summary.finished(1, 2));
});

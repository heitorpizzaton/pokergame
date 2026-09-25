import { expect, type Page, test } from '@playwright/test';
import { strings } from '../../src/i18n/index.ts';

async function openSetup(page: Page): Promise<void> {
  await page.goto('/?speed=instant');
  await page.getByRole('button', { name: strings.menu.newGame }).click();
  await expect(page.getByTestId('setup-screen')).toBeVisible();
}

async function setPlayers(page: Page, players: number): Promise<void> {
  const count = page.getByTestId('player-count');
  for (let i = 0; i < 10; i++) {
    const current = Number(await count.textContent());
    if (current === players) break;
    await page
      .getByRole('button', { name: current < players ? strings.setup.more : strings.setup.fewer })
      .click();
  }
  await expect(count).toHaveText(String(players));
}

async function noHorizontalScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

/** Waits for the user's turn, or for the game to end. */
async function waitForTurnOrEnd(page: Page): Promise<'turn' | 'end'> {
  const bar = page.getByTestId('action-bar');
  const summary = page.getByTestId('summary-screen');
  await expect(bar.or(summary)).toBeVisible({ timeout: 30_000 });
  return (await summary.isVisible()) ? 'end' : 'turn';
}

for (const players of [2, 6, 9]) {
  test(`configures and starts a ${players}-player game`, async ({ page }) => {
    await openSetup(page);
    await setPlayers(page, players);
    await noHorizontalScroll(page);
    await page.getByRole('button', { name: strings.setup.start }).click();
    await expect(page.getByTestId('table-screen')).toBeVisible();
    await expect(page.locator('[data-testid^="seat-"]')).toHaveCount(players);
    // The user's own two hole cards are face up and labelled for screen readers.
    await expect(page.getByTestId('seat-user').locator('[data-card]')).toHaveCount(2);
    await noHorizontalScroll(page);
  });
}

test('validates the setup form', async ({ page }) => {
  await openSetup(page);
  await page.getByLabel(strings.setup.bigBlind).fill('40');
  await expect(page.getByText(strings.setup.errors.bigBlindAboveSmall)).toBeVisible();
  await expect(page.getByRole('button', { name: strings.setup.start })).toBeDisabled();
  await page.getByLabel(strings.setup.bigBlind).fill('100');
  await page.getByRole('button', { name: '1.000', exact: true }).click();
  await expect(page.getByText(strings.setup.warnings.shortStack)).toBeVisible();
  await expect(page.getByRole('button', { name: strings.setup.start })).toBeEnabled();
});

test('plays hands using every action type', async ({ page }) => {
  test.setTimeout(90_000);
  await openSetup(page);
  await setPlayers(page, 3);
  await page.getByRole('button', { name: strings.setup.start }).click();
  const used = new Set<string>();
  for (let turn = 0; turn < 150 && used.size < 5; turn++) {
    if ((await waitForTurnOrEnd(page)) === 'end') break;
    const fold = page.getByTestId('act-fold');
    const call = page.getByTestId('act-call');
    const raise = page.getByTestId('act-raise');
    const callLabel = (await call.textContent()) ?? '';
    const isCheck = callLabel === strings.actions.check;
    if (!used.has('raise') && (await raise.isVisible())) {
      used.add('raise');
      await raise.click();
    } else if (!used.has('check') && isCheck) {
      used.add('check');
      await call.click();
    } else if (!used.has('call') && !isCheck) {
      used.add('call');
      await call.click();
    } else if (!used.has('fold') && (await fold.isVisible())) {
      used.add('fold');
      await fold.click();
    } else if (used.size === 4 && (await raise.isVisible())) {
      used.add('allIn');
      await page.getByTestId('preset-allIn').click();
      await expect(raise).toHaveText(strings.actions.allIn);
      await raise.click();
    } else {
      await call.click();
    }
  }
  expect([...used].sort()).toEqual(['allIn', 'call', 'check', 'fold', 'raise']);
  await noHorizontalScroll(page);
});

test('the user busts and reaches the summary', async ({ page }) => {
  test.setTimeout(120_000);
  await openSetup(page);
  await setPlayers(page, 2);
  await page.getByRole('button', { name: '1.000', exact: true }).click();
  await page.getByRole('button', { name: strings.setup.start }).click();
  // Shove every hand. A game the user happens to win is replayed until one ends in a bust.
  for (let game = 0; game < 25; game++) {
    while ((await waitForTurnOrEnd(page)) === 'turn') {
      const raise = page.getByTestId('act-raise');
      if (await raise.isVisible()) {
        await page.getByTestId('preset-allIn').click();
        await raise.click();
      } else {
        await page.getByTestId('act-call').click();
      }
    }
    const summary = page.getByTestId('summary-screen');
    if ((await summary.getAttribute('data-result')) === 'busted') {
      await expect(page.getByTestId('finishing-place')).toHaveText(strings.summary.finished(2, 2));
      await expect(page.getByText(strings.summary.handsPlayed)).toBeVisible();
      await noHorizontalScroll(page);
      await page.getByRole('button', { name: strings.summary.menu }).click();
      await expect(page.getByTestId('menu-screen')).toBeVisible();
      return;
    }
    await page.getByRole('button', { name: strings.summary.playAgain }).click();
  }
  throw new Error('The user never busted in 25 games');
});

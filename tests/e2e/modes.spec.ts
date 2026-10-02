import { expect, type Page, test } from '@playwright/test';
import { strings } from '../../src/i18n/index.ts';

/** AGENTS.md §31.3: tournament blinds, opponent level and lifetime statistics. */

const t = strings.setup;

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
    await page.getByRole('button', { name: current < players ? t.more : t.fewer }).click();
  }
  await expect(count).toHaveText(String(players));
}

/** Waits for the user's turn, or for the game to end. */
async function waitForTurnOrEnd(page: Page): Promise<'turn' | 'end'> {
  const bar = page.getByTestId('action-bar');
  const summary = page.getByTestId('summary-screen');
  await expect(bar.or(summary)).toBeVisible({ timeout: 30_000 });
  return (await summary.isVisible()) ? 'end' : 'turn';
}

test('rising blinds and the opponent level are chosen in Setup and shown at the table', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await openSetup(page);
  const structure = page.getByTestId('blind-structure');
  await expect(structure.getByRole('radio', { name: t.fixedBlinds })).toBeChecked();
  await structure.getByRole('radio', { name: t.risingBlinds }).check();
  await expect(
    structure.getByRole('button', { name: t.everyHands(10), exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await structure.getByRole('button', { name: t.everyHands(5), exact: true }).click();
  await page.getByRole('button', { name: t.opponentLevels.hard }).click();
  await expect(page.getByText(t.opponentLevelHints.hard)).toBeVisible();
  await page.getByRole('button', { name: t.start }).click();

  await expect(page.getByTestId('action-bar')).toBeVisible({ timeout: 20_000 });
  const level = page.getByTestId('blind-level');
  await expect(level).toContainText(strings.table.level.label(1));

  // Check or fold until the second level starts (hands 6–10), then the blinds have risen.
  const second = strings.table.level.label(2);
  for (let i = 0; i < 200; i++) {
    if ((await level.textContent())?.includes(second)) break;
    expect(await waitForTurnOrEnd(page)).toBe('turn');
    const check = page.getByRole('button', { name: strings.actions.check, exact: true });
    if (await check.isVisible().catch(() => false)) await check.click().catch(() => undefined);
    else
      await page
        .getByTestId('act-fold')
        .click()
        .catch(() => undefined);
  }
  await expect(level).toContainText(second);
  const hand = Number((await page.getByTestId('hand-number').textContent())?.replace(/\D/g, ''));
  expect(hand).toBeGreaterThanOrEqual(6);
  expect(hand).toBeLessThanOrEqual(10);
  await expect(page.getByText(strings.table.blindsLabel(75, 150))).toBeVisible();

  // Setup remembers the choices.
  await page.reload();
  await page.getByRole('button', { name: strings.menu.newGame }).click();
  await expect(
    page.getByTestId('blind-structure').getByRole('button', { name: t.everyHands(5), exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: t.opponentLevels.hard })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

test('a finished game is added to Estatísticas, which can be reset', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/?speed=instant');
  await page.getByRole('button', { name: strings.menu.stats }).click();
  await expect(page.getByTestId('stats-screen')).toContainText(strings.stats.empty);
  await page.getByRole('button', { name: strings.stats.back }).click();

  await openSetup(page);
  await setPlayers(page, 2);
  await page.getByRole('button', { name: '1.000', exact: true }).click();
  await page.getByRole('button', { name: t.start }).click();
  // Shove every hand until the game ends either way.
  while ((await waitForTurnOrEnd(page)) === 'turn') {
    const raise = page.getByTestId('act-raise');
    if (await raise.isVisible()) {
      await page.getByTestId('preset-allIn').click();
      await raise.click();
    } else {
      await page.getByTestId('act-call').click();
    }
  }
  await page.getByRole('button', { name: strings.summary.menu }).click();

  await page.getByRole('button', { name: strings.menu.stats }).click();
  const screen = page.getByTestId('stats-screen');
  const row = (label: string) =>
    screen.locator('div', { has: page.getByText(label, { exact: true }) });
  await expect(row(strings.stats.games).locator('dd')).toHaveText('1');
  await expect(row(strings.stats.handsPlayed).locator('dd')).not.toHaveText('0');

  await page.getByRole('button', { name: strings.stats.reset }).click();
  await expect(screen).toContainText(strings.stats.confirmReset);
  await page.getByTestId('confirm-reset-stats').click();
  await expect(screen).toContainText(strings.stats.empty);
});

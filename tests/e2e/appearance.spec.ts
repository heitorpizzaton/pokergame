import { expect, test } from '@playwright/test';
import { strings } from '../../src/i18n/index.ts';

/** AGENTS.md §32: the casino table with its dealer, and the color choices in Configurações. */

const t = strings.settings;

test('felt, card backs and accent can be chosen and are remembered', async ({ page }) => {
  await page.goto('/?speed=instant');
  const html = page.locator('html');
  await expect(html).not.toHaveAttribute('data-felt', /.*/);

  await page.getByRole('button', { name: strings.menu.settings }).click();
  await page.getByRole('radiogroup', { name: t.felt }).getByLabel(t.feltOptions.blue).check();
  await page
    .getByRole('radiogroup', { name: t.cardBack })
    .getByLabel(t.cardBackOptions.black)
    .check();
  await page.getByRole('radiogroup', { name: t.accent }).getByLabel(t.accentOptions.ruby).check();
  await expect(html).toHaveAttribute('data-felt', 'blue');
  await expect(html).toHaveAttribute('data-cardback', 'black');
  await expect(html).toHaveAttribute('data-accent', 'ruby');

  // Applied before the first paint after a reload.
  await page.reload();
  await expect(html).toHaveAttribute('data-felt', 'blue');
  const felt = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--color-felt').trim(),
  );
  expect(felt).toBe('#124a7a');

  await page.getByRole('button', { name: strings.menu.settings }).click();
  await page.getByRole('radiogroup', { name: t.felt }).getByLabel(t.feltOptions.green).check();
  await expect(html).not.toHaveAttribute('data-felt', /.*/);
});

test('the dealer sits at the top of the table and the deck is in front of them', async ({
  page,
}) => {
  await page.goto('/?speed=instant');
  await page.getByRole('button', { name: strings.menu.newGame }).click();
  await page.getByRole('button', { name: strings.setup.start }).click();
  await expect(page.getByTestId('action-bar')).toBeVisible({ timeout: 20_000 });
  const dealer = await page.getByTestId('dealer').boundingBox();
  const deck = await page.getByTestId('deck').boundingBox();
  const user = await page.getByTestId('seat-user').boundingBox();
  if (!dealer || !deck || !user) throw new Error('missing table elements');
  // Centred horizontally, across the table from the user.
  expect(Math.abs(dealer.x + dealer.width / 2 - (user.x + user.width / 2))).toBeLessThan(4);
  expect(dealer.y).toBeLessThan(user.y);
  expect(deck.y).toBeGreaterThan(dealer.y);
});

test('blind presets set both blinds from the stack depth', async ({ page }) => {
  await page.goto('/?speed=instant');
  await page.getByRole('button', { name: strings.menu.newGame }).click();
  await page.getByRole('button', { name: '1.000', exact: true }).click();
  await page.getByRole('button', { name: new RegExp(strings.setup.blindDepths.turbo) }).click();
  await expect(page.getByLabel(strings.setup.smallBlind)).toHaveValue('20');
  await expect(page.getByLabel(strings.setup.bigBlind)).toHaveValue('40');
  await expect(page.getByTestId('setup-summary')).toHaveText(
    strings.setup.summary(6, 1000, 20, 40),
  );
});

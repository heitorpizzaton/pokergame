import { expect, test } from '@playwright/test';
import { strings } from '../../src/i18n/index.ts';

/** AGENTS.md §31.2: first-game tips, made hand, opponent profiles and the hand log. */

test('the first table shows three tips and waits for them', async ({ page }) => {
  // A fresh profile (the e2e build otherwise starts with the tips dismissed).
  await page.addInitScript(() => {
    const key = 'mesa-viva:settings';
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify({ tipsSeen: false }));
  });
  await page.goto('/?speed=instant');
  await page.getByRole('button', { name: strings.menu.newGame }).click();
  await page.getByRole('button', { name: strings.setup.start }).click();
  const tips = page.getByTestId('table-tips');
  await expect(tips).toBeVisible();
  // The game has not started: nobody has been dealt in yet.
  await expect(page.getByTestId('action-bar')).toHaveCount(0);
  for (const step of strings.table.tips.steps.slice(0, -1)) {
    await expect(tips).toContainText(step.title);
    await page.getByRole('button', { name: strings.table.tips.next }).click();
  }
  await page.getByRole('button', { name: strings.table.tips.done }).click();
  await expect(tips).toHaveCount(0);
  await expect(page.getByTestId('action-bar')).toBeVisible({ timeout: 20_000 });

  // Dismissed tips stay dismissed.
  await page.reload();
  await page.getByRole('button', { name: strings.menu.newGame }).click();
  await page.getByRole('button', { name: strings.setup.start }).click();
  await expect(page.getByTestId('action-bar')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('table-tips')).toHaveCount(0);
});

test('made hand, opponent profile and hand log', async ({ page }) => {
  await page.goto('/?seed=11&speed=instant');
  await page.getByRole('button', { name: strings.menu.newGame }).click();
  await page.getByRole('button', { name: strings.setup.start }).click();
  await expect(page.getByTestId('action-bar')).toBeVisible({ timeout: 20_000 });

  // The user's hand is named next to their cards.
  await expect(page.getByTestId('made-hand')).not.toBeEmpty();

  // Tapping an opponent opens their profile.
  await page
    .getByRole('button', { name: /^Ver perfil de / })
    .first()
    .click();
  const profile = page.getByTestId('opponent-profile');
  await expect(profile).toBeVisible();
  await expect(profile).toContainText(strings.table.profile.vpip);
  await page.getByRole('button', { name: strings.table.profile.close }).click();
  await expect(profile).toHaveCount(0);

  // The hand log lists the blinds and the actions so far.
  await page.getByTestId('hand-log-toggle').click();
  const log = page.getByTestId('hand-log');
  await expect(log).toBeVisible();
  await expect(log).toContainText(strings.table.log.streets.preflop);
  await expect(log).toContainText(/pagou o blind/);
  await page.getByRole('button', { name: strings.table.log.close }).click();
  await expect(log).toHaveCount(0);
});

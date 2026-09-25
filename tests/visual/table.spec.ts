import { expect, test } from '@playwright/test';
import { strings } from '../../src/i18n/index.ts';

// Screenshots must not depend on time or on Monte Carlo sampling: no action timer, no odds panel.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'mesa-viva:settings',
      JSON.stringify({ oddsPanel: false, actionTimer: 'off', sound: false }),
    );
  });
});

for (let players = 2; players <= 9; players++) {
  test(`table with ${players} players`, async ({ page }) => {
    // The seeded e2e build deals the same cards and NPC decisions on every run.
    await page.goto(`/?seed=${700 + players}&speed=instant`);
    await expect(page.locator('html')).toHaveAttribute('data-rng', 'mesa-viva-seeded-debug');
    await page.getByRole('button', { name: strings.menu.newGame }).click();
    const count = page.getByTestId('player-count');
    for (let i = 0; i < 10 && Number(await count.textContent()) !== players; i++) {
      const current = Number(await count.textContent());
      await page
        .getByRole('button', { name: current < players ? strings.setup.more : strings.setup.fewer })
        .click();
    }
    await page.getByRole('button', { name: strings.setup.start }).click();
    await expect(page.getByTestId('action-bar')).toBeVisible({ timeout: 20_000 });
    await page.evaluate(() => document.fonts.ready);
    await expect(page).toHaveScreenshot(`table-${players}.png`);
  });
}

import { expect, test } from '@playwright/test';
import { strings } from '../../src/i18n/index.ts';

for (const look of ['a', 'b', 'c'] as const) {
  test(`look ${look}`, async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    await page.addInitScript(() => {
      localStorage.setItem('mesa-viva:settings', JSON.stringify({ graphics: 'high' }));
    });
    await page.goto(`/?seed=7&speed=instant&look=${look}`);
    await page.getByRole('button', { name: strings.menu.newGame }).click();
    const more = page.getByRole('button', { name: strings.setup.more });
    for (let i = 6; i < 9; i++) await more.click();
    await page.getByRole('button', { name: strings.setup.start }).click();
    await expect(page.getByTestId('action-bar')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole('region', { name: strings.table.tableLabel })).toHaveAttribute(
      'data-renderer',
      '3d',
      { timeout: 60_000 },
    );
    // Let the characters load and settle.
    await page.waitForTimeout(4_000);
    await page.screenshot({
      path: `docs/looks/look-${look}-${testInfo.project.name}.jpg`,
      type: 'jpeg',
      quality: 80,
    });
  });
}

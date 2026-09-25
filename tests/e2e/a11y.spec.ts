import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { strings } from '../../src/i18n/index.ts';

/** AGENTS.md §12: no WCAG 2 A/AA violations that axe can detect, on every screen. */
async function expectNoViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  const summary = results.violations.map(
    (v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(' ')).join(', ')})`,
  );
  expect(summary).toEqual([]);
}

test('menu', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('menu-screen')).toBeVisible();
  await expectNoViolations(page);
});

test('setup', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: strings.menu.newGame }).click();
  await expectNoViolations(page);
});

test('settings', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: strings.menu.settings }).click();
  await expectNoViolations(page);
});

test('guide', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: strings.menu.guide }).click();
  await expect(page.getByTestId('guide-screen')).toBeVisible();
  await expect(page.getByTestId('guide-ranking')).toHaveCount(10);
  await expectNoViolations(page);
});

test('table on the user turn, announced for screen readers', async ({ page }) => {
  await page.goto('/?speed=instant');
  await page.getByRole('button', { name: strings.menu.newGame }).click();
  await page.getByRole('button', { name: strings.setup.start }).click();
  await expect(page.getByTestId('action-bar')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('announcer')).toContainText(strings.table.yourTurn);
  await expectNoViolations(page);
});

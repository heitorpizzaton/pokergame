import { expect, test } from '@playwright/test';
import { strings } from '../../src/i18n/index.ts';

/** AGENTS.md §30.2: Tema = Automático (follows the device) / Claro / Escuro, persisted. */
test('Automático follows the device; a pinned theme persists across reloads', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  const html = page.locator('html');
  await expect(html).not.toHaveAttribute('data-theme', /.*/);
  const bg = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(await bg()).toBe('rgb(14, 20, 18)');

  await page.getByRole('button', { name: strings.menu.settings }).click();
  await page.getByTestId('theme-setting').selectOption('light');
  await expect(html).toHaveAttribute('data-theme', 'light');
  expect(await bg()).toBe('rgb(244, 246, 245)');

  await page.reload();
  await expect(html).toHaveAttribute('data-theme', 'light');
  expect(await bg()).toBe('rgb(244, 246, 245)');

  await page.getByRole('button', { name: strings.menu.settings }).click();
  await page.getByTestId('theme-setting').selectOption('auto');
  await expect(html).not.toHaveAttribute('data-theme', /.*/);
  expect(await bg()).toBe('rgb(14, 20, 18)');
});

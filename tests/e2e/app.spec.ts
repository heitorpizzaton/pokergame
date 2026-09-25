import { expect, test } from '@playwright/test';
import { strings } from '../../src/i18n/index.ts';

test.describe('menu and PWA', () => {
  test('renders the pt-BR menu with the disclaimer', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('lang', 'pt-BR');
    await expect(page).toHaveTitle(strings.app.name);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(strings.app.name);
    await expect(page.getByRole('button', { name: strings.menu.newGame })).toBeVisible();
    await expect(page.getByText(strings.legal.entertainment)).toBeVisible();
  });

  test('is an installable PWA: manifest and service worker (§3)', async ({ page, request }) => {
    await page.goto('/');
    const href = await page.locator('link[rel="manifest"]').getAttribute('href');
    expect(href).toBeTruthy();
    const response = await request.get(new URL(href ?? '', page.url()).toString());
    expect(response.ok()).toBe(true);
    const manifest = (await response.json()) as {
      name: string;
      lang: string;
      display: string;
      icons: { sizes: string }[];
    };
    expect(manifest.name).toBe(strings.app.name);
    expect(manifest.lang).toBe('pt-BR');
    expect(manifest.display).toBe('standalone');
    expect(manifest.icons.map((i) => i.sizes)).toEqual(
      expect.arrayContaining(['192x192', '512x512']),
    );
    const scriptUrl = await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.ready;
      return registration.active?.scriptURL ?? null;
    });
    expect(scriptUrl).toMatch(/\/sw\.js$/);
  });

  test('plays offline after the first visit (precached app, fonts and workers)', async ({
    page,
    context,
  }) => {
    await page.goto('/?speed=instant');
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    // The first visit precaches; wait until the worker controls the page.
    await page.reload();
    await expect
      .poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null))
      .toBe(true);
    await context.setOffline(true);
    await page.reload();
    await page.getByRole('button', { name: strings.menu.newGame }).click();
    await page.getByRole('button', { name: strings.setup.start }).click();
    await expect(page.getByTestId('action-bar')).toBeVisible({ timeout: 20_000 });
    expect(await page.evaluate(() => document.fonts.check('16px Manrope'))).toBe(true);
  });
});

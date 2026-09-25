import { expect, test } from '@playwright/test';
import { strings } from '../../src/i18n/index.ts';

test.describe('placeholder page', () => {
  test('renders the pt-BR landing content', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('lang', 'pt-BR');
    await expect(page).toHaveTitle(strings.app.name);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(strings.app.name);
    await expect(page.getByText(strings.legal.entertainment)).toBeVisible();
  });

  test('has no horizontal scrolling (§11.2)', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
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
      icons: { sizes: string; type: string }[];
    };
    expect(manifest.name).toBe(strings.app.name);
    expect(manifest.lang).toBe('pt-BR');
    expect(manifest.display).toBe('standalone');
    const sizes = manifest.icons.map((icon) => icon.sizes);
    expect(sizes).toContain('192x192');
    expect(sizes).toContain('512x512');

    const scriptUrl = await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.ready;
      return registration.active?.scriptURL ?? null;
    });
    expect(scriptUrl).toMatch(/\/sw\.js$/);
  });
});

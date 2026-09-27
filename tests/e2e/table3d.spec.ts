import { expect, type Page, test } from '@playwright/test';
import { strings } from '../../src/i18n/index.ts';

/**
 * AGENTS.md §20: the 3D table (Phase V2 spike). CI renders WebGL with SwiftShader, a software
 * renderer, so `Automático` must fall back to 2D there, while an explicit tier still runs 3D.
 */

async function setGraphics(page: Page, graphics: string): Promise<void> {
  await page.addInitScript((value) => {
    const key = 'mesa-viva:settings';
    const current = JSON.parse(localStorage.getItem(key) ?? '{}') as Record<string, unknown>;
    localStorage.setItem(key, JSON.stringify({ ...current, graphics: value }));
  }, graphics);
}

async function startGame(page: Page, players?: number): Promise<void> {
  await page.goto('/?speed=instant');
  await page.getByRole('button', { name: strings.menu.newGame }).click();
  if (players !== undefined) {
    const more = page.getByRole('button', { name: strings.setup.more });
    for (let i = 6; i < players; i++) await more.click();
  }
  await page.getByRole('button', { name: strings.setup.start }).click();
  await expect(page.getByTestId('action-bar')).toBeVisible({ timeout: 30_000 });
}

test('the menu and setup screens never download 3D code or models', async ({ page }) => {
  const requested: string[] = [];
  page.on('request', (r) => requested.push(r.url()));
  await setGraphics(page, 'medium');
  await page.goto('/');
  await page.getByRole('button', { name: strings.menu.newGame }).click();
  await expect(page.getByRole('button', { name: strings.setup.start })).toBeVisible();
  expect(requested.filter((u) => /\/assets\/(3d|gpu)\//.test(u))).toEqual([]);
});

test('Automático falls back to the 2D table on a software renderer', async ({ page }) => {
  await startGame(page);
  const area = page.getByRole('region', { name: strings.table.tableLabel });
  await expect(area).toHaveAttribute('data-renderer', '2d');
  await expect(page.getByTestId('table3d')).toHaveCount(0);
});

test('an explicit tier renders the 3D table with the DOM HUD anchored to it', async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000);
  await setGraphics(page, 'low');
  await startGame(page, 9);
  const area = page.getByRole('region', { name: strings.table.tableLabel });
  await expect(page.getByTestId('table3d')).toHaveAttribute('data-tier', 'low');
  await expect(area).toHaveAttribute('data-renderer', '3d', { timeout: 30_000 });
  await expect(page.locator('canvas')).toHaveCount(1);

  // Every seat label sits inside the table area, and none overlaps another.
  const box = await area.boundingBox();
  const seats = await page.locator('[data-testid^="seat-"]').all();
  expect(seats.length).toBe(9);
  const boxes = [];
  for (const seat of seats) {
    const b = await seat.boundingBox();
    expect(b).not.toBeNull();
    if (!b || !box) continue;
    const cx = b.x + b.width / 2;
    const cy = b.y + b.height / 2;
    expect(cx).toBeGreaterThanOrEqual(box.x);
    expect(cx).toBeLessThanOrEqual(box.x + box.width);
    expect(cy).toBeGreaterThanOrEqual(box.y);
    expect(cy).toBeLessThanOrEqual(box.y + box.height);
    boxes.push({ cx, cy });
  }
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i];
      const b = boxes[j];
      if (!a || !b) continue;
      expect(Math.hypot(a.cx - b.cx, a.cy - b.cy)).toBeGreaterThan(30);
    }
  }

  // AGENTS.md §26: at most 150 draw calls with 9 seats (measured here at Baixa, no shadows).
  const stats = await page.evaluate(() => {
    const gl = (
      window as unknown as {
        mesaViva3d?: { info: { render: { calls: number; triangles: number } } };
      }
    ).mesaViva3d;
    return gl ? { ...gl.info.render } : null;
  });
  expect(stats).not.toBeNull();
  testInfo.annotations.push({ type: 'render', description: JSON.stringify(stats) });
  console.log(`3D render stats (${testInfo.project.name}): ${JSON.stringify(stats)}`);
  expect(stats?.calls ?? 0).toBeLessThanOrEqual(150);

  // The game still plays: fold and reach the next hand.
  await page.getByRole('button', { name: strings.actions.fold }).click();
  await expect(page.getByTestId('hand-number')).not.toHaveText(strings.table.handNumber(1), {
    timeout: 30_000,
  });
  await page.screenshot({ path: testInfo.outputPath('table3d.png') });
});

test('2D clássico never loads the 3D renderer', async ({ page }) => {
  const requested: string[] = [];
  page.on('request', (r) => requested.push(r.url()));
  await setGraphics(page, '2d');
  await startGame(page);
  await expect(page.getByRole('region', { name: strings.table.tableLabel })).toHaveAttribute(
    'data-renderer',
    '2d',
  );
  expect(requested.filter((u) => /\/assets\/(3d|gpu)\//.test(u))).toEqual([]);
});

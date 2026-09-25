import { expect, test } from '@playwright/test';
import { strings } from '../../src/i18n/index.ts';

/** AGENTS.md §14, Phase 8: commit before the hand, reveal in the history, "Verificar". */
test('the deck commitment shown during a hand verifies in the history', async ({ page }) => {
  test.setTimeout(90_000);
  await page.addInitScript(() => {
    localStorage.setItem('mesa-viva:settings', JSON.stringify({ handHistory: true }));
  });
  await page.goto('/?speed=instant');
  await page.getByRole('button', { name: strings.menu.newGame }).click();
  await page.getByRole('button', { name: strings.setup.start }).click();

  // Remember the commitment published for each hand while playing.
  const shown = new Map<number, string>();
  const deadline = Date.now() + 40_000;
  // Four hands seen, so at least three were completed and recorded before quitting.
  while (Date.now() < deadline && shown.size < 4) {
    // Read the hand number and its badge together: at instant speed hands change quickly.
    const seen = await page.evaluate(() => {
      const hand = /\d+/.exec(
        document.querySelector('[data-testid="hand-number"]')?.textContent ?? '',
      );
      const hash = document.querySelector('[data-testid="commitment"]')?.getAttribute('title');
      return hand && hash ? { hand: Number(hand[0]), hash } : null;
    });
    if (seen) shown.set(seen.hand, seen.hash);
    // Check or fold, so the user stays in the game.
    const fold = page.getByTestId('act-fold');
    const call = page.getByTestId('act-call');
    if (await fold.isVisible().catch(() => false)) await fold.click().catch(() => undefined);
    else if (await call.isVisible().catch(() => false)) await call.click().catch(() => undefined);
    else await page.waitForTimeout(50);
  }
  expect(shown.size).toBeGreaterThan(0);

  await page.getByRole('button', { name: strings.table.pause }).click();
  await page.getByRole('button', { name: strings.pause.quit }).click();
  await page.getByRole('button', { name: strings.pause.confirmQuitYes }).click();
  await page.getByRole('button', { name: strings.menu.history }).click();
  // Open a recorded hand whose commitment was seen at the table.
  const items = page.getByTestId('history-item');
  await expect(items.first()).toBeVisible();
  // Each item starts with its "Mão N" label.
  const hands = await items.evaluateAll((els) =>
    els.map((el) => Number(/\d+/.exec(el.firstElementChild?.textContent ?? '')?.[0] ?? 0)),
  );
  const index = hands.findIndex((hand) => shown.has(hand));
  expect(index).toBeGreaterThanOrEqual(0);
  const replayed = hands[index] ?? 0;
  await items.nth(index).click();

  await page.getByTestId('fairness-open').click();
  await expect(page.getByTestId('fairness-hash')).toHaveText(shown.get(replayed) ?? 'missing');
  await page.getByTestId('fairness-verify').click();
  await expect(page.getByTestId('fairness-result')).toHaveText(strings.fairness.verified);
});

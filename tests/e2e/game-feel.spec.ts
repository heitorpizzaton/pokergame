import { expect, test } from '@playwright/test';
import { strings } from '../../src/i18n/index.ts';

/** AGENTS.md §31.1: visible timer, thinking indicator, street pacing and the dealer button. */
test('the table shows the timer, who is thinking, and paces each street', async ({ page }) => {
  test.setTimeout(90_000);
  // Normal speed: the real pacing, not the instant test speed.
  await page.goto('/?seed=23');
  await page.getByRole('button', { name: strings.menu.newGame }).click();
  await page.getByRole('button', { name: strings.setup.start }).click();
  const table = page.getByTestId('table-screen');

  await expect(page.getByTestId('dealer-button')).toBeVisible();

  // The user's turn shows a readable countdown on top of the action bar.
  await expect(page.getByTestId('action-bar')).toBeVisible({ timeout: 30_000 });
  const timer = page.getByTestId('action-timer');
  await expect(timer).toContainText(strings.table.timer.label);
  await expect(timer).toContainText(/\d+ s/);

  // After the user acts, an NPC deciding shows the thinking dots.
  await page.getByTestId('act-call').click();
  await expect(page.getByRole('status', { name: /está pensando/ }).first()).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByTestId('action-bar')).toBeVisible({ timeout: 30_000 });

  // Call or check until a street is dealt: the table pauses on it before the next action.
  for (let i = 0; i < 12; i++) {
    const check = page.getByRole('button', { name: strings.actions.check, exact: true });
    if (await check.isVisible().catch(() => false)) await check.click();
    else await page.getByTestId('act-call').click();
    const sawStreet = await table
      .evaluate(
        (el) =>
          new Promise<boolean>((resolve) => {
            const done = () => {
              observer.disconnect();
              resolve(el.getAttribute('data-phase') === 'street');
            };
            const observer = new MutationObserver(() => {
              const phase = el.getAttribute('data-phase');
              if (phase === 'street' || phase === 'userTurn' || phase === 'handResult') done();
            });
            observer.observe(el, { attributes: true, attributeFilter: ['data-phase'] });
            setTimeout(done, 15_000);
          }),
      )
      .catch(() => false);
    if (sawStreet) {
      await expect(page.getByTestId('board').locator('[data-card]').first()).toBeVisible();
      return;
    }
    await expect(page.getByTestId('action-bar')).toBeVisible({ timeout: 30_000 });
  }
  throw new Error('No street was dealt');
});

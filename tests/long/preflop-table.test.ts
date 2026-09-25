import { describe, expect, it } from 'vitest';
import { type Card, parseCards } from '../../src/core/cards/index.ts';
import { exactEquityVsHands, preflopClass } from '../../src/core/equity/index.ts';

/**
 * Independent check of the generated preflop table: recompute a few classes by brute force over
 * all 1,225 opponent hands and all 1,712,304 boards each, without the suit-isomorphism shortcut
 * the generator uses.
 */
describe('preflop table, brute-force recomputation', () => {
  it.each(['AsAh', '3c2d', 'Td9d'])('%s matches the table exactly', (text) => {
    const hero = parseCards(text);
    let win = 0;
    let tie = 0;
    let equity = 0;
    let n = 0;
    for (let a = 0; a < 52; a++) {
      for (let b = a + 1; b < 52; b++) {
        if (hero.includes(a as Card) || hero.includes(b as Card)) continue;
        const [r] = exactEquityVsHands([hero, [a as Card, b as Card]], []);
        if (!r) throw new Error('missing result');
        win += r.win;
        tie += r.tie;
        equity += r.equity;
        n++;
      }
    }
    expect(n).toBe(1225);
    const table = preflopClass(hero).vsRandom;
    expect(win / n).toBeCloseTo(table.win, 6);
    expect(tie / n).toBeCloseTo(table.tie, 6);
    expect(equity / n).toBeCloseTo(table.equity, 6);
  });
});

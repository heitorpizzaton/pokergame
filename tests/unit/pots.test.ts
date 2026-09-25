import { describe, expect, it } from 'vitest';
import { buildPots, splitPot } from '../../src/core/engine/index.ts';

describe('buildPots', () => {
  it('makes a single pot when everyone contributed the same', () => {
    expect(
      buildPots([
        { seat: 0, amount: 100, folded: false },
        { seat: 1, amount: 100, folded: false },
      ]),
    ).toEqual([{ amount: 200, eligibleSeats: [0, 1] }]);
  });

  it('keeps folded chips in the pot without making the folder eligible', () => {
    expect(
      buildPots([
        { seat: 0, amount: 300, folded: false },
        { seat: 1, amount: 300, folded: false },
        { seat: 2, amount: 100, folded: true },
      ]),
    ).toEqual([{ amount: 700, eligibleSeats: [0, 1] }]);
  });

  it('layers side pots at each all-in level and merges equal eligibility', () => {
    expect(
      buildPots([
        { seat: 0, amount: 100, folded: false },
        { seat: 1, amount: 400, folded: false },
        { seat: 2, amount: 400, folded: false },
        { seat: 3, amount: 250, folded: true },
      ]),
    ).toEqual([
      { amount: 400, eligibleSeats: [0, 1, 2] }, // 100 × 4
      { amount: 750, eligibleSeats: [1, 2] }, // 150 × 3 (folded 3 reached 250) + 150 × 2
    ]);
  });

  it('refuses a layer nobody can win (an uncalled bet left in)', () => {
    expect(() =>
      buildPots([
        { seat: 0, amount: 500, folded: true },
        { seat: 1, amount: 100, folded: false },
      ]),
    ).toThrow();
  });
});

describe('splitPot (odd chips)', () => {
  it('splits evenly when possible', () => {
    expect(splitPot(300, [1, 2], 0, 3)).toEqual([
      { seat: 1, amount: 150 },
      { seat: 2, amount: 150 },
    ]);
  });

  it('gives odd chips one at a time starting left of the button', () => {
    // Button 3 of 5 seats: order from the button is 4, 0, 1, 2, 3.
    expect(splitPot(10, [0, 2, 4], 3, 5)).toEqual([
      { seat: 4, amount: 4 },
      { seat: 0, amount: 3 },
      { seat: 2, amount: 3 },
    ]);
    expect(splitPot(11, [0, 2, 4], 3, 5)).toEqual([
      { seat: 4, amount: 4 },
      { seat: 0, amount: 4 },
      { seat: 2, amount: 3 },
    ]);
  });

  it('puts the button itself last in the odd-chip order', () => {
    expect(splitPot(5, [3, 1], 3, 5)).toEqual([
      { seat: 1, amount: 3 },
      { seat: 3, amount: 2 },
    ]);
  });
});

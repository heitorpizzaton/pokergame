import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { Card } from '../../src/core/cards/index.ts';
import { bestFive, evaluate } from '../../src/core/eval/index.ts';
import { naiveEvaluate5 } from '../support/naive-eval.ts';

const cardsArb = (n: number) =>
  fc.uniqueArray(fc.integer({ min: 0, max: 51 }), { minLength: n, maxLength: n }) as fc.Arbitrary<
    Card[]
  >;

/** Best value over every five-card subset, using the independent naive evaluator. */
function bruteForceBest(cards: readonly Card[]): number {
  let best = -1;
  const n = cards.length;
  for (let a = 0; a < n; a++)
    for (let b = a + 1; b < n; b++)
      for (let c = b + 1; c < n; c++)
        for (let d = c + 1; d < n; d++)
          for (let e = d + 1; e < n; e++) {
            const v = naiveEvaluate5([
              cards[a] as Card,
              cards[b] as Card,
              cards[c] as Card,
              cards[d] as Card,
              cards[e] as Card,
            ]);
            if (v > best) best = v;
          }
  return best;
}

describe('evaluator properties', () => {
  it.each([6, 7])('%i-card value equals the best five-card subset (naive oracle)', (n) => {
    fc.assert(
      fc.property(cardsArb(n), (cards) => {
        expect(evaluate(cards)).toBe(bruteForceBest(cards));
      }),
      { numRuns: 20_000 },
    );
  });

  it('does not depend on the order of the cards', () => {
    fc.assert(
      fc.property(cardsArb(7), fc.integer(), (cards, seed) => {
        const rotated = cards.map((_, i) => cards[(i + Math.abs(seed)) % cards.length] as Card);
        expect(evaluate(rotated)).toBe(evaluate(cards));
        expect(evaluate([...cards].reverse())).toBe(evaluate(cards));
      }),
      { numRuns: 5_000 },
    );
  });

  it('does not depend on which suit is which (suits have no rank)', () => {
    fc.assert(
      fc.property(
        cardsArb(7),
        fc.shuffledSubarray([0, 1, 2, 3], { minLength: 4, maxLength: 4 }),
        (cards, perm) => {
          const relabelled = cards.map((c) => ((c & ~3) | (perm[c & 3] as number)) as Card);
          expect(evaluate(relabelled)).toBe(evaluate(cards));
        },
      ),
      { numRuns: 5_000 },
    );
  });

  it('bestFive returns five input cards that evaluate to the hand value', () => {
    fc.assert(
      fc.property(cardsArb(7), (cards) => {
        const { value, cards: five } = bestFive(cards);
        expect(value).toBe(evaluate(cards));
        expect(five).toHaveLength(5);
        expect(new Set(five).size).toBe(5);
        for (const card of five) expect(cards).toContain(card);
        expect(evaluate(five)).toBe(value);
      }),
      { numRuns: 5_000 },
    );
  });
});

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { orderedDeck, shuffledDeck } from '../../src/core/cards/index.ts';
import { CryptoRng, shuffleInPlace } from '../../src/core/rng/index.ts';
import { SeededRng } from '../../src/core/rng/seeded-rng.ts';

describe('Fisher-Yates shuffle', () => {
  it('always returns a permutation of its input', () => {
    fc.assert(
      fc.property(fc.array(fc.integer(), { maxLength: 60 }), fc.integer(), (items, seed) => {
        const shuffled = shuffleInPlace([...items], new SeededRng(seed));
        expect([...shuffled].sort((a, b) => a - b)).toEqual([...items].sort((a, b) => a - b));
      }),
      { numRuns: 2_000 },
    );
  });

  it('shuffles in place and returns the same array', () => {
    const items = [1, 2, 3, 4, 5];
    expect(shuffleInPlace(items, new SeededRng(3))).toBe(items);
  });

  it('handles empty and single-element arrays', () => {
    expect(shuffleInPlace([], new SeededRng(1))).toEqual([]);
    expect(shuffleInPlace([9], new SeededRng(1))).toEqual([9]);
  });

  it('deals a valid 52-card permutation from a fresh deck every time', () => {
    const rng = new CryptoRng();
    const sorted = orderedDeck();
    for (let i = 0; i < 1_000; i++) {
      const deck = shuffledDeck(rng);
      expect(deck).toHaveLength(52);
      expect([...deck].sort((a, b) => a - b)).toEqual(sorted);
    }
  });
});

import { describe, expect, it } from 'vitest';
import { evaluateMasks, HandCategory } from '../../src/core/eval/index.ts';
import { CryptoRng } from '../../src/core/rng/index.ts';
import { binomialBounds } from '../support/stats.ts';

/**
 * Long tests (AGENTS.md §7.1, §13.2), run by `npm run test:long` / the manual workflow.
 */
const TOTAL_SEVEN_CARD_HANDS = 133_784_560;

const EXPECTED_7: Record<HandCategory, number> = {
  [HandCategory.StraightFlush]: 41_584, // includes royal flushes
  [HandCategory.FourOfAKind]: 224_848,
  [HandCategory.FullHouse]: 3_473_184,
  [HandCategory.Flush]: 4_047_644,
  [HandCategory.Straight]: 6_180_020,
  [HandCategory.ThreeOfAKind]: 6_461_620,
  [HandCategory.TwoPair]: 31_433_400,
  [HandCategory.OnePair]: 58_627_800,
  [HandCategory.HighCard]: 23_294_460,
};

const CATEGORY_SHIFT = 20;

describe('seven-card evaluator, all 133,784,560 hands', () => {
  it('matches the known category counts and has 4,824 distinct hand values', () => {
    const counts = new Array<number>(9).fill(0);
    const seen = new Uint8Array(9 << CATEGORY_SHIFT);
    let total = 0;
    // Suit masks are built incrementally: m[k] holds the masks after k cards (4 per level).
    const m = new Int32Array(8 * 4);
    const add = (level: number, card: number): void => {
      const base = level * 4;
      const next = base + 4;
      m[next] = m[base] as number;
      m[next + 1] = m[base + 1] as number;
      m[next + 2] = m[base + 2] as number;
      m[next + 3] = m[base + 3] as number;
      const i = next + (card & 3);
      m[i] = (m[i] as number) | (1 << (card >> 2));
    };
    for (let a = 0; a < 46; a++) {
      add(0, a);
      for (let b = a + 1; b < 47; b++) {
        add(1, b);
        for (let c = b + 1; c < 48; c++) {
          add(2, c);
          for (let d = c + 1; d < 49; d++) {
            add(3, d);
            for (let e = d + 1; e < 50; e++) {
              add(4, e);
              for (let f = e + 1; f < 51; f++) {
                add(5, f);
                for (let g = f + 1; g < 52; g++) {
                  const card = 1 << (g >> 2);
                  const suit = g & 3;
                  const value = evaluateMasks(
                    (m[24] as number) | (suit === 0 ? card : 0),
                    (m[25] as number) | (suit === 1 ? card : 0),
                    (m[26] as number) | (suit === 2 ? card : 0),
                    (m[27] as number) | (suit === 3 ? card : 0),
                    7,
                  );
                  const category = value >> CATEGORY_SHIFT;
                  counts[category] = (counts[category] as number) + 1;
                  seen[value] = 1;
                  total++;
                }
              }
            }
          }
        }
      }
    }

    expect(total).toBe(TOTAL_SEVEN_CARD_HANDS);
    for (const category of Object.values(HandCategory)) {
      expect(counts[category], `category ${category}`).toBe(EXPECTED_7[category]);
    }
    expect(seen.reduce((sum, v) => sum + v, 0)).toBe(4_824);
  });
});

describe('10 million random 7-card deals (crypto RNG)', () => {
  it('category frequencies match the exact probabilities within 99.9% confidence bounds', () => {
    const deals = 10_000_000;
    const rng = new CryptoRng();
    const deck = Array.from({ length: 52 }, (_, i) => i);
    const counts = new Array<number>(9).fill(0);
    for (let n = 0; n < deals; n++) {
      let clubs = 0;
      let diamonds = 0;
      let hearts = 0;
      let spades = 0;
      // Partial Fisher-Yates: the first 7 positions become a uniform random 7-card hand.
      for (let i = 0; i < 7; i++) {
        const j = i + rng.int(52 - i);
        const card = deck[j] as number;
        deck[j] = deck[i] as number;
        deck[i] = card;
        const bit = 1 << (card >> 2);
        const suit = card & 3;
        if (suit === 0) clubs |= bit;
        else if (suit === 1) diamonds |= bit;
        else if (suit === 2) hearts |= bit;
        else spades |= bit;
      }
      const category = evaluateMasks(clubs, diamonds, hearts, spades, 7) >> CATEGORY_SHIFT;
      counts[category] = (counts[category] as number) + 1;
    }
    for (const category of Object.values(HandCategory)) {
      const p = EXPECTED_7[category] / TOTAL_SEVEN_CARD_HANDS;
      const { lower, upper } = binomialBounds(p, deals, 0.001);
      const observed = counts[category] as number;
      expect(observed, `category ${category}`).toBeGreaterThanOrEqual(lower);
      expect(observed, `category ${category}`).toBeLessThanOrEqual(upper);
    }
  });
});

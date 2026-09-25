import { describe, expect, it } from 'vitest';
import type { Card } from '../../src/core/cards/index.ts';
import { evaluate, HandCategory, handCategory } from '../../src/core/eval/index.ts';
import { naiveEvaluate5 } from '../support/naive-eval.ts';

/**
 * Exhaustive five-card oracle (AGENTS.md §7.1, §13.1): every one of the 2,598,960 hands.
 */
const EXPECTED_COUNTS: Record<HandCategory, number> = {
  [HandCategory.StraightFlush]: 40, // includes the 4 royal flushes
  [HandCategory.FourOfAKind]: 624,
  [HandCategory.FullHouse]: 3_744,
  [HandCategory.Flush]: 5_108,
  [HandCategory.Straight]: 10_200,
  [HandCategory.ThreeOfAKind]: 54_912,
  [HandCategory.TwoPair]: 123_552,
  [HandCategory.OnePair]: 1_098_240,
  [HandCategory.HighCard]: 1_302_540,
};

// Distinct hand ranks per category; 7,462 equivalence classes in total.
const EXPECTED_CLASSES: Record<HandCategory, number> = {
  [HandCategory.StraightFlush]: 10,
  [HandCategory.FourOfAKind]: 156,
  [HandCategory.FullHouse]: 156,
  [HandCategory.Flush]: 1_277,
  [HandCategory.Straight]: 10,
  [HandCategory.ThreeOfAKind]: 858,
  [HandCategory.TwoPair]: 858,
  [HandCategory.OnePair]: 2_860,
  [HandCategory.HighCard]: 1_277,
};

describe('five-card evaluator, all 2,598,960 hands', () => {
  const counts = new Array<number>(9).fill(0);
  const classes = Array.from({ length: 9 }, () => new Set<number>());
  let total = 0;
  let mismatches = 0;
  let firstMismatch = '';

  const hand: Card[] = [0, 0, 0, 0, 0] as Card[];
  for (let a = 0; a < 48; a++) {
    for (let b = a + 1; b < 49; b++) {
      for (let c = b + 1; c < 50; c++) {
        for (let d = c + 1; d < 51; d++) {
          for (let e = d + 1; e < 52; e++) {
            hand[0] = a as Card;
            hand[1] = b as Card;
            hand[2] = c as Card;
            hand[3] = d as Card;
            hand[4] = e as Card;
            const value = evaluate(hand);
            const category = handCategory(value);
            counts[category] = (counts[category] as number) + 1;
            (classes[category] as Set<number>).add(value);
            total++;
            if (value !== naiveEvaluate5(hand)) {
              mismatches++;
              if (!firstMismatch) firstMismatch = hand.join(',');
            }
          }
        }
      }
    }
  }

  it('visits every hand', () => {
    expect(total).toBe(2_598_960);
  });

  it('matches the known count for each category', () => {
    for (const category of Object.values(HandCategory)) {
      expect(counts[category], `category ${category}`).toBe(EXPECTED_COUNTS[category]);
    }
  });

  it('produces exactly 7,462 distinct hand values, split correctly by category', () => {
    for (const category of Object.values(HandCategory)) {
      expect(classes[category]?.size, `category ${category}`).toBe(EXPECTED_CLASSES[category]);
    }
    expect(classes.reduce((sum, set) => sum + set.size, 0)).toBe(7_462);
  });

  it('agrees exactly with the independent naive evaluator on every hand', () => {
    expect(firstMismatch).toBe('');
    expect(mismatches).toBe(0);
  });
});

import type { Card } from '../cards/index.ts';
import { evaluate, type HandValue } from './evaluate.ts';

export interface BestHand {
  readonly value: HandValue;
  /** The five cards that make the hand, used for highlighting and naming (AGENTS.md §5.6). */
  readonly cards: readonly Card[];
}

/**
 * Finds the best five-card hand among 5 to 7 cards. Not for hot loops (it tries every five-card
 * subset); use {@link evaluate} when only the strength is needed. When several subsets tie, the
 * first one in input order is returned, so the result is deterministic.
 */
export function bestFive(cards: readonly Card[]): BestHand {
  const value = evaluate(cards);
  const n = cards.length;
  const subset: Card[] = [];
  for (let a = 0; a < n - 4; a++) {
    for (let b = a + 1; b < n - 3; b++) {
      for (let c = b + 1; c < n - 2; c++) {
        for (let d = c + 1; d < n - 1; d++) {
          for (let e = d + 1; e < n; e++) {
            subset.length = 0;
            subset.push(
              cards[a] as Card,
              cards[b] as Card,
              cards[c] as Card,
              cards[d] as Card,
              cards[e] as Card,
            );
            if (evaluate(subset) === value) return { value, cards: [...subset] };
          }
        }
      }
    }
  }
  throw new Error('Unreachable: no five-card subset matches the hand value');
}

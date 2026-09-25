import type { Rng } from '../rng/index.ts';
import { shuffleInPlace } from '../rng/index.ts';
import { type Card, DECK_SIZE } from './card.ts';

/** A fresh 52-card deck in encoding order (2c, 2d, 2h, 2s, 3c, …, As). */
export function orderedDeck(): Card[] {
  return Array.from({ length: DECK_SIZE }, (_, i) => i as Card);
}

/**
 * A fresh ordered deck shuffled with an unbiased Fisher-Yates shuffle (AGENTS.md §6). Every hand
 * MUST start from a new call: decks are never reused or continuously shuffled.
 */
export function shuffledDeck(rng: Rng): Card[] {
  return shuffleInPlace(orderedDeck(), rng);
}

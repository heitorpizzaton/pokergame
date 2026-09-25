import { type Card, formatCards, isCard } from '../cards/index.ts';
import type { Rng } from '../rng/index.ts';
import { sha256Hex } from './sha256.ts';

/**
 * Deck commitment (AGENTS.md §14, Phase 8). Before a hand is shown, the game publishes
 * SHA-256(`mesa-viva-deck-v1:<deck>:<salt>`), where `<deck>` lists the shuffled deck in dealing
 * order ("As Kd 7c …") and `<salt>` is 128 secret random bits in hex. After the hand, the deck and
 * salt are revealed; anyone can recompute the hash (with this app or any SHA-256 tool) and check
 * that the deck was fixed before the hand began. The salt stops anyone from guessing the deck
 * from the hash.
 */
export const COMMITMENT_PREFIX = 'mesa-viva-deck-v1';

export interface DeckReveal {
  readonly deck: readonly Card[];
  readonly salt: string;
}

/** 128 random bits from the game's RNG, as 32 hex digits. */
export function newSalt(rng: Rng): string {
  return Array.from({ length: 4 }, () => rng.nextUint32().toString(16).padStart(8, '0')).join('');
}

/** The exact text whose SHA-256 is the commitment. */
export function commitmentText(deck: readonly Card[], salt: string): string {
  return `${COMMITMENT_PREFIX}:${formatCards(deck)}:${salt}`;
}

export function commitDeck(deck: readonly Card[], salt: string): string {
  return sha256Hex(new TextEncoder().encode(commitmentText(deck, salt)));
}

/** A revealed deck matches the published hash, and is a genuine 52-card deck. */
export function verifyCommitment(hash: string, reveal: DeckReveal): boolean {
  const { deck, salt } = reveal;
  const complete = deck.length === 52 && deck.every(isCard) && new Set(deck).size === 52;
  return complete && /^[0-9a-f]{32}$/.test(salt) && commitDeck(deck, salt) === hash;
}

/**
 * Deck positions of the five board cards when `holeCardsDealt` hole cards were dealt first: a
 * card is burned before the flop, the turn and the river (AGENTS.md §5.3).
 */
export function boardDeckPositions(holeCardsDealt: number): number[] {
  const n = holeCardsDealt;
  return [n + 1, n + 2, n + 3, n + 5, n + 7];
}

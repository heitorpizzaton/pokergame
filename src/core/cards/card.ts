/**
 * Card encoding. A card is an integer in [0, 52): `rank * 4 + suit`.
 *
 * - Rank index 0..12 maps to 2, 3, …, 9, T, J, Q, K, A (the ace is 12).
 * - Suit index 0..3 maps to clubs, diamonds, hearts, spades. Suits have no rank (AGENTS.md §5.7);
 *   the order only fixes the encoding.
 *
 * The integer form keeps hot loops (evaluation, equity) allocation-free and makes the whole game
 * state trivially JSON-serializable (AGENTS.md §4.1).
 */

declare const cardBrand: unique symbol;

/** A card encoded as `rank * 4 + suit`. Construct with {@link makeCard} or {@link parseCard}. */
export type Card = number & { readonly [cardBrand]: true };

/** Rank index: 0 = deuce … 12 = ace. */
export type Rank = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;

/** Suit index: 0 = clubs, 1 = diamonds, 2 = hearts, 3 = spades. */
export type Suit = 0 | 1 | 2 | 3;

export const RANK_COUNT = 13;
export const SUIT_COUNT = 4;
export const DECK_SIZE = 52;

export const RANK_CHARS = '23456789TJQKA';
export const SUIT_CHARS = 'cdhs';

export const Suits = { Clubs: 0, Diamonds: 1, Hearts: 2, Spades: 3 } as const;
export const Ranks = {
  Two: 0,
  Three: 1,
  Four: 2,
  Five: 3,
  Six: 4,
  Seven: 5,
  Eight: 6,
  Nine: 7,
  Ten: 8,
  Jack: 9,
  Queen: 10,
  King: 11,
  Ace: 12,
} as const;

export function makeCard(rank: Rank, suit: Suit): Card {
  return (rank * 4 + suit) as Card;
}

export function rankOf(card: Card): Rank {
  return (card >> 2) as Rank;
}

export function suitOf(card: Card): Suit {
  return (card & 3) as Suit;
}

export function isCard(value: unknown): value is Card {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < DECK_SIZE;
}

export function isRank(value: number): value is Rank {
  return Number.isInteger(value) && value >= 0 && value < RANK_COUNT;
}

export function isSuit(value: number): value is Suit {
  return Number.isInteger(value) && value >= 0 && value < SUIT_COUNT;
}

export class CardParseError extends Error {
  override readonly name = 'CardParseError';
}

/** Parses a two-character card such as `As`, `Td` or `2c`. Rank and suit are case-insensitive. */
export function parseCard(text: string): Card {
  if (text.length !== 2) throw new CardParseError(`Invalid card "${text}": expected 2 characters`);
  const rank = RANK_CHARS.indexOf(text.charAt(0).toUpperCase());
  const suit = SUIT_CHARS.indexOf(text.charAt(1).toLowerCase());
  if (!isRank(rank)) throw new CardParseError(`Invalid rank in card "${text}"`);
  if (!isSuit(suit)) throw new CardParseError(`Invalid suit in card "${text}"`);
  return makeCard(rank, suit);
}

/**
 * Parses a list of cards written back to back or separated by whitespace or commas,
 * e.g. `"AsKd"`, `"As Kd Qh"`, `"As,Kd"`. Duplicate cards are rejected.
 */
export function parseCards(text: string): Card[] {
  const compact = text.replace(/[\s,]+/g, '');
  if (compact.length % 2 !== 0) {
    throw new CardParseError(`Invalid card list "${text}": odd number of characters`);
  }
  const cards: Card[] = [];
  const seen = new Set<Card>();
  for (let i = 0; i < compact.length; i += 2) {
    const card = parseCard(compact.slice(i, i + 2));
    if (seen.has(card)) throw new CardParseError(`Duplicate card "${formatCard(card)}"`);
    seen.add(card);
    cards.push(card);
  }
  return cards;
}

/** Formats a card as rank + suit characters, e.g. `As`. Language-neutral (not for UI labels). */
export function formatCard(card: Card): string {
  return RANK_CHARS.charAt(rankOf(card)) + SUIT_CHARS.charAt(suitOf(card));
}

export function formatCards(cards: readonly Card[], separator = ' '): string {
  return cards.map(formatCard).join(separator);
}

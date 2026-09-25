import type { Card } from '../cards/index.ts';
import * as tables from './tables.ts';

// Module-local references to the lookup tables. Some module runners (Vitest's among them) turn
// every access to an imported binding into a getter call, which cut throughput ~4x in the hot
// path; plain local constants keep the inner loop to direct typed-array reads everywhere.
const POPCOUNT = tables.POPCOUNT;
const STRAIGHT_TOP = tables.STRAIGHT_TOP;
const TOP_FIVE = tables.TOP_FIVE;
const TOP_RANK = tables.TOP_RANK;

/**
 * Hand categories, weakest to strongest (AGENTS.md §5.7). A royal flush is the ace-high
 * straight flush; see {@link isRoyalFlush}.
 */
export const HandCategory = {
  HighCard: 0,
  OnePair: 1,
  TwoPair: 2,
  ThreeOfAKind: 3,
  Straight: 4,
  Flush: 5,
  FullHouse: 6,
  FourOfAKind: 7,
  StraightFlush: 8,
} as const;
export type HandCategory = (typeof HandCategory)[keyof typeof HandCategory];

declare const handValueBrand: unique symbol;

/**
 * Comparable hand strength: a higher value is a better hand, and equal values tie.
 *
 * Layout: `category << 20 | r1 << 16 | r2 << 12 | r3 << 8 | r4 << 4 | r5`, where r1…r5 are rank
 * indices in the order that decides the hand within its category:
 * - straight flush / straight: top card (5 for the wheel)
 * - four of a kind: quad rank, kicker
 * - full house: trips rank, pair rank
 * - flush / high card: five ranks, highest first
 * - three of a kind: trips rank, two kickers
 * - two pair: high pair, low pair, kicker
 * - one pair: pair rank, three kickers
 */
export type HandValue = number & { readonly [handValueBrand]: true };

const CATEGORY_SHIFT = 20;
const HIGH_CARD = HandCategory.HighCard << CATEGORY_SHIFT;
const ONE_PAIR = HandCategory.OnePair << CATEGORY_SHIFT;
const TWO_PAIR = HandCategory.TwoPair << CATEGORY_SHIFT;
const THREE_OF_A_KIND = HandCategory.ThreeOfAKind << CATEGORY_SHIFT;
const STRAIGHT = HandCategory.Straight << CATEGORY_SHIFT;
const FLUSH = HandCategory.Flush << CATEGORY_SHIFT;
const FULL_HOUSE = HandCategory.FullHouse << CATEGORY_SHIFT;
const FOUR_OF_A_KIND = HandCategory.FourOfAKind << CATEGORY_SHIFT;
const STRAIGHT_FLUSH = HandCategory.StraightFlush << CATEGORY_SHIFT;

/**
 * Evaluates the best five-card hand from 5 to 7 cards given as per-suit 13-bit rank masks.
 * This is the allocation-free core used by the equity engine's inner loops.
 *
 * @param clubs, diamonds, hearts, spades per-suit rank masks (bit r = rank index r)
 * @param cardCount total number of cards (5, 6 or 7; the masks must not overlap within a suit)
 */
export function evaluateMasks(
  clubs: number,
  diamonds: number,
  hearts: number,
  spades: number,
  cardCount: number,
): HandValue {
  const ranks = clubs | diamonds | hearts | spades;
  const distinct = POPCOUNT[ranks] as number;

  // With 7 or fewer cards, a flush or straight needs five distinct ranks, and then a full house
  // or quads (which need at least three duplicated ranks) is impossible.
  if (distinct >= 5) {
    let suited = 0;
    if ((POPCOUNT[clubs] as number) >= 5) suited = clubs;
    else if ((POPCOUNT[diamonds] as number) >= 5) suited = diamonds;
    else if ((POPCOUNT[hearts] as number) >= 5) suited = hearts;
    else if ((POPCOUNT[spades] as number) >= 5) suited = spades;
    if (suited !== 0) {
      const straightTop = STRAIGHT_TOP[suited] as number;
      if (straightTop !== 0) return (STRAIGHT_FLUSH | ((straightTop - 1) << 16)) as HandValue;
      return (FLUSH | (TOP_FIVE[suited] as number)) as HandValue;
    }
    const straightTop = STRAIGHT_TOP[ranks] as number;
    if (straightTop !== 0) return (STRAIGHT | ((straightTop - 1) << 16)) as HandValue;
    if (distinct === cardCount) return (HIGH_CARD | (TOP_FIVE[ranks] as number)) as HandValue;
  }

  const quads = clubs & diamonds & hearts & spades;
  if (quads !== 0) {
    const quadRank = TOP_RANK[quads] as number;
    return (FOUR_OF_A_KIND |
      (quadRank << 16) |
      ((TOP_RANK[ranks ^ quads] as number) << 12)) as HandValue;
  }

  // Ranks held exactly twice: XOR keeps ranks with an odd count (1 or 3).
  const pairs = ranks ^ (clubs ^ diamonds ^ hearts ^ spades);
  // Ranks held at least three times (quads were handled above, so exactly three).
  const trips = ((clubs & diamonds) | (hearts & spades)) & ((clubs & hearts) | (diamonds & spades));

  if (trips !== 0) {
    const tripRank = TOP_RANK[trips] as number;
    const pairCandidates = pairs | (trips ^ (1 << tripRank));
    if (pairCandidates !== 0) {
      return (FULL_HOUSE |
        (tripRank << 16) |
        ((TOP_RANK[pairCandidates] as number) << 12)) as HandValue;
    }
    const kickers = (TOP_FIVE[ranks ^ trips] as number) >> 12;
    return (THREE_OF_A_KIND | (tripRank << 16) | (kickers << 8)) as HandValue;
  }

  if ((POPCOUNT[pairs] as number) >= 2) {
    const high = TOP_RANK[pairs] as number;
    const low = TOP_RANK[pairs ^ (1 << high)] as number;
    const kicker = TOP_RANK[ranks ^ (1 << high) ^ (1 << low)] as number;
    return (TWO_PAIR | (high << 16) | (low << 12) | (kicker << 8)) as HandValue;
  }

  const pairRank = TOP_RANK[pairs] as number;
  const kickers = (TOP_FIVE[ranks ^ pairs] as number) >> 8;
  return (ONE_PAIR | (pairRank << 16) | (kickers << 4)) as HandValue;
}

/** Evaluates the best five-card hand among 5 to 7 distinct cards. */
export function evaluate(cards: readonly Card[]): HandValue {
  const count = cards.length;
  if (count < 5 || count > 7) throw new RangeError(`Expected 5 to 7 cards, got ${count}`);
  let clubs = 0;
  let diamonds = 0;
  let hearts = 0;
  let spades = 0;
  for (let i = 0; i < count; i++) {
    const card = cards[i] as number;
    const bit = 1 << (card >> 2);
    switch (card & 3) {
      case 0:
        clubs |= bit;
        break;
      case 1:
        diamonds |= bit;
        break;
      case 2:
        hearts |= bit;
        break;
      default:
        spades |= bit;
    }
  }
  return evaluateMasks(clubs, diamonds, hearts, spades, count);
}

export function handCategory(value: HandValue): HandCategory {
  return (value >> CATEGORY_SHIFT) as HandCategory;
}

/** True for the ace-high straight flush. */
export function isRoyalFlush(value: HandValue): boolean {
  return handCategory(value) === HandCategory.StraightFlush && ((value >> 16) & 0xf) === 12;
}

/** Negative when `a` loses to `b`, zero on a tie, positive when `a` wins. */
export function compareHands(a: HandValue, b: HandValue): number {
  return a - b;
}

/**
 * Tournament blinds (AGENTS.md §31.3.1): every `everyHands` hands the big blind grows by about
 * ×1.5, rounded up to a "nice" value, with the small blind at half of it. Level 0 is the setup's
 * own blinds. Pure functions; the engine validates and applies the result between hands.
 */
export interface BlindSchedule {
  /** Hands per level. */
  readonly everyHands: number;
  /** Level 0, as chosen on the Setup screen. */
  readonly smallBlind: number;
  readonly bigBlind: number;
}

export interface Blinds {
  readonly smallBlind: number;
  readonly bigBlind: number;
}

export const BLIND_LEVEL_CHOICES = [5, 10, 15, 20] as const;
export const DEFAULT_LEVEL_HANDS = 10;
const GROWTH = 1.5;
const NICE = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8] as const;

/** The smallest "nice" number (1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8 × 10ⁿ) at or above `value`. */
export function niceAtLeast(value: number): number {
  const v = Math.max(1, Math.ceil(value));
  for (let magnitude = 1; ; magnitude *= 10) {
    for (const step of NICE) {
      const candidate = Math.round(step * magnitude);
      if (candidate >= v && Number.isInteger(step * magnitude)) return candidate;
    }
  }
}

/** The level a hand plays at; `handIndex` counts from 0 for the first hand. */
export function levelForHand(handIndex: number, everyHands: number): number {
  return Math.floor(Math.max(0, handIndex) / Math.max(1, everyHands));
}

/** Blinds at `level`: strictly increasing, integer, with BB > SB ≥ 1. */
export function blindsAtLevel(schedule: BlindSchedule, level: number): Blinds {
  let { smallBlind, bigBlind } = schedule;
  for (let l = 0; l < level; l++) {
    const nextBig = Math.max(bigBlind + 1, niceAtLeast(bigBlind * GROWTH));
    const nextSmall = nextBig % 2 === 0 ? nextBig / 2 : Math.floor(nextBig / 2);
    bigBlind = nextBig;
    smallBlind = Math.max(1, Math.max(smallBlind, nextSmall));
    if (smallBlind >= bigBlind) smallBlind = bigBlind - 1;
  }
  return { smallBlind, bigBlind };
}

/** Hands left before the next level starts, counting the current hand (`handIndex` from 0). */
export function handsToNextLevel(handIndex: number, everyHands: number): number {
  const n = Math.max(1, everyHands);
  return n - (Math.max(0, handIndex) % n);
}

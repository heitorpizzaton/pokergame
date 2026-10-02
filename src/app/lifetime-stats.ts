import { HandCategory, handCategory, type HandValue } from '../core/eval/index.ts';
import type { SavedStats } from './session-stats.ts';

/**
 * The user's statistics across every finished game (AGENTS.md §31.3.3), kept in localStorage.
 * A game counts when it ends for the user (busted or won); abandoned games do not count.
 */
export interface LifetimeStats {
  readonly games: number;
  readonly wins: number;
  /** Sum of finishing places, for the average place. */
  readonly placeSum: number;
  /** Sum of table sizes, for the average table size the places come from. */
  readonly playersSum: number;
  readonly bestPlace: number | null;
  readonly handsPlayed: number;
  readonly handsWon: number;
  readonly vpipHands: number;
  readonly pfrHands: number;
  readonly biggestPotWon: number;
  readonly bestHand: HandValue | null;
  readonly totalMs: number;
}

/** How one game ended for the user. */
export interface GameOutcome {
  readonly place: number;
  readonly players: number;
  readonly stats: SavedStats;
  readonly durationMs: number;
}

export const EMPTY_LIFETIME: LifetimeStats = {
  games: 0,
  wins: 0,
  placeSum: 0,
  playersSum: 0,
  bestPlace: null,
  handsPlayed: 0,
  handsWon: 0,
  vpipHands: 0,
  pfrHands: 0,
  biggestPotWon: 0,
  bestHand: null,
  totalMs: 0,
};

const KEY = 'mesa-viva:lifetime-stats';

export function addGame(stats: LifetimeStats, outcome: GameOutcome): LifetimeStats {
  const { place, players, stats: game, durationMs } = outcome;
  const bestHand =
    game.bestHand === null
      ? stats.bestHand
      : stats.bestHand === null
        ? game.bestHand
        : game.bestHand > stats.bestHand
          ? game.bestHand
          : stats.bestHand;
  return {
    games: stats.games + 1,
    wins: stats.wins + (place === 1 ? 1 : 0),
    placeSum: stats.placeSum + place,
    playersSum: stats.playersSum + players,
    bestPlace: stats.bestPlace === null ? place : Math.min(stats.bestPlace, place),
    handsPlayed: stats.handsPlayed + game.handsPlayed,
    handsWon: stats.handsWon + game.handsWon,
    vpipHands: stats.vpipHands + game.vpipHands,
    pfrHands: stats.pfrHands + game.pfrHands,
    biggestPotWon: Math.max(stats.biggestPotWon, game.biggestPotWon),
    bestHand,
    totalMs: stats.totalMs + Math.max(0, durationMs),
  };
}

const COUNTERS = [
  'games',
  'wins',
  'placeSum',
  'playersSum',
  'handsPlayed',
  'handsWon',
  'vpipHands',
  'pfrHands',
  'biggestPotWon',
  'totalMs',
] as const;

const count = (value: unknown): number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : 0;

/** Reads the stored statistics; anything missing or malformed reads as empty. */
export function loadLifetimeStats(storage: Pick<Storage, 'getItem'> | null): LifetimeStats {
  try {
    const raw = storage?.getItem(KEY);
    if (!raw) return EMPTY_LIFETIME;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const stats = Object.fromEntries(COUNTERS.map((k) => [k, count(parsed[k])])) as Record<
      (typeof COUNTERS)[number],
      number
    >;
    const bestPlace = count(parsed.bestPlace);
    const bestHand = count(parsed.bestHand) as HandValue;
    return {
      ...stats,
      bestPlace: bestPlace >= 1 && stats.games > 0 ? bestPlace : null,
      bestHand:
        bestHand > 0 &&
        stats.handsPlayed > 0 &&
        handCategory(bestHand) <= HandCategory.StraightFlush
          ? bestHand
          : null,
    };
  } catch {
    return EMPTY_LIFETIME;
  }
}

export function saveLifetimeStats(
  storage: Pick<Storage, 'setItem'> | null,
  stats: LifetimeStats,
): void {
  try {
    storage?.setItem(KEY, JSON.stringify(stats));
  } catch {
    // Storage may be full or blocked; the statistics are a convenience.
  }
}

export function recordGame(
  storage: Pick<Storage, 'getItem' | 'setItem'> | null,
  outcome: GameOutcome,
): LifetimeStats {
  const next = addGame(loadLifetimeStats(storage), outcome);
  saveLifetimeStats(storage, next);
  return next;
}

export function clearLifetimeStats(storage: Pick<Storage, 'removeItem'> | null): void {
  try {
    storage?.removeItem(KEY);
  } catch {
    // Ignore blocked storage.
  }
}

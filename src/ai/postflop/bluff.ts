import type { Card } from '../../core/cards/index.ts';
import type { Street } from '../../core/view/index.ts';
import type { StyleProfile } from '../styles/styles.ts';
import type { BetClass } from './classify.ts';

/**
 * Bluff probability (AGENTS.md §18.3): `base(style, street) × Π modifiers`, clamped to
 * [0, 0.95]. Pure functions of public information and the NPC's own cards, so the simulator and
 * the tests can check each modifier on its own.
 */
export interface BluffInput {
  readonly style: StyleProfile;
  readonly street: Exclude<Street, 'preflop'>;
  readonly kind: 'bet' | 'raise';
  readonly betClass: Exclude<BetClass, 'value'>;
  /** Continuation-bet spot: preflop aggressor, heads-up, flop not yet bet. */
  readonly cbet: boolean;
  /** Live opponents in the pot (at least one). */
  readonly opponents: number;
  readonly inPosition: boolean;
  /** How often the opponents fold to a bet, from the opponent model (0–1). */
  readonly foldEquity: number;
  /** −1 (board favours the other range) … 1 (favours the NPC's perceived range). */
  readonly boardStory: number;
  /** 0 … 1: blockers to the opponent's strong hands or the nut draw. */
  readonly blockers: number;
  /** The hand can win at showdown by checking. */
  readonly showdownValue: boolean;
  /** A bluff of this NPC was shown down and lost in the last few hands. */
  readonly recentFailedBluff: boolean;
  readonly tilted: boolean;
  /** Persistent per-NPC multiplier in [0.8, 1.2]. */
  readonly personal: number;
}

/** Population prior for folding to a bet; the fold-equity modifier is 1 at this value. */
export const PRIOR_FOLD_EQUITY = 0.45;

export function bluffProbability(input: BluffInput): number {
  const { style, street, kind, betClass } = input;
  const b = style.bluffing;
  let base: number;
  if (kind === 'raise') base = b.raise * (betClass === 'semiBluff' ? 1.6 : 1);
  else if (input.cbet) base = betClass === 'semiBluff' ? Math.min(0.95, b.cbet * 1.25) : b.cbet;
  else base = betClass === 'semiBluff' ? b.semi[street] : b.pure[street];

  let m = 1;
  // Fold equity: strong styles adapt, weak styles mostly ignore it, the maniac ignores it.
  const ratio = Math.max(0.02, input.foldEquity) / PRIOR_FOLD_EQUITY;
  m *= Math.min(2.2, Math.max(0.15, Math.pow(ratio, b.foldSensitivity)));
  m *= Math.pow(0.55, Math.max(0, input.opponents - 1));
  m *= input.inPosition ? 1.2 : 0.85;
  m *= 1 + 0.2 * input.boardStory;
  m *= 1 + 0.35 * input.blockers;
  if (input.showdownValue) m *= b.showdownRespect;
  if (input.recentFailedBluff) m *= b.failedBluffDamping;
  if (input.tilted) m *= b.tilt;
  m *= input.personal;
  return Math.min(0.95, Math.max(0, base * m));
}

/**
 * Whether the board fits the preflop aggressor's range (high cards, an ace) or the caller's (low,
 * connected): +1 when it favours the NPC's perceived range, −1 when it favours the others'.
 */
export function boardStory(board: readonly Card[], npcWasAggressor: boolean): number {
  const ranks = board.slice(0, 3).map((c) => c >> 2);
  const high = ranks.filter((r) => r >= 8).length; // T or better
  const ace = ranks.includes(12);
  const sorted = [...ranks].sort((a, b) => a - b);
  const low = Math.max(...ranks) <= 7; // nine or lower
  const connected = sorted.length === 3 && (sorted[2] as number) - (sorted[0] as number) <= 4;
  const story = (ace || high >= 2 ? 1 : 0) - (low && connected ? 1 : 0);
  return npcWasAggressor ? story : -story;
}

/**
 * Blockers (0 … 1): the ace of a three-flush suit on the board (the nut flush) is the strongest;
 * an ace that does not pair the board blocks the strongest top-pair and nut-draw calls.
 */
export function blockerScore(hole: readonly Card[], board: readonly Card[]): number {
  const suits = [0, 0, 0, 0];
  for (const c of board) suits[c & 3] = (suits[c & 3] as number) + 1;
  const flushSuit = suits.findIndex((n) => n >= 3);
  if (flushSuit >= 0 && hole.some((c) => c >> 2 === 12 && (c & 3) === flushSuit)) return 1;
  const boardAce = board.some((c) => c >> 2 === 12);
  return !boardAce && hole.some((c) => c >> 2 === 12) ? 0.4 : 0;
}

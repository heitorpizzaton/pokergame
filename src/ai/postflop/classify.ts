import type { Card } from '../../core/cards/index.ts';
import { evaluate, HandCategory, handCategory } from '../../core/eval/index.ts';
import type { Street } from '../../core/view/index.ts';
import { hasDraw, type Range, strengthOnBoard } from '../model/range.ts';
import { ALL_COMBOS } from '../ranges/hand-order.ts';

/**
 * Bet classification (AGENTS.md §18.1), shared by the AI and the simulator statistics so the two
 * can never drift apart. Everything is computed from the NPC's own estimates at decision time.
 */
export type BetClass = 'value' | 'semiBluff' | 'pureBluff';

/** Equity vs. the calling range at or above which a bet is a value bet. */
export const VALUE_EQUITY = 0.55;
/** Equity vs. the calling range below which a bet without a real draw is a pure bluff. */
export const BLUFF_EQUITY = 0.3;
/** Clean outs that make a real draw. */
export const REAL_DRAW_OUTS = 6;
/** A pot with this many players (the NPC included) or more is no bluff opportunity. */
export const MULTIWAY_PLAYERS = 4;

export interface ClassifyInput {
  readonly street: Street;
  /** Equity versus the estimated calling ranges of the live opponents. */
  readonly equityVsCallers: number;
  /** Clean outs to a straight or better (flop and turn). */
  readonly cleanOuts: number;
}

export function classifyBet({ street, equityVsCallers, cleanOuts }: ClassifyInput): BetClass {
  if (equityVsCallers >= VALUE_EQUITY) return 'value';
  if (street === 'river') return equityVsCallers < BLUFF_EQUITY ? 'pureBluff' : 'semiBluff';
  if (cleanOuts >= REAL_DRAW_OUTS || equityVsCallers >= BLUFF_EQUITY) return 'semiBluff';
  return 'pureBluff';
}

/**
 * A decision point where betting or raising would be a bluff (§18.1): the NPC may bet or raise,
 * its hand is not a value hand, and fewer than four players are in the pot.
 */
export function isBluffOpportunity(
  canBetOrRaise: boolean,
  betClass: BetClass,
  playersInPot: number,
): boolean {
  return canBetOrRaise && betClass !== 'value' && playersInPot < MULTIWAY_PLAYERS;
}

/**
 * Outs on the flop or turn to a straight or better that the board alone does not make, not
 * counting cards that pair the board (they can fill an opponent's full house).
 */
export function cleanDrawOuts(hole: readonly Card[], board: readonly Card[]): number {
  if (board.length !== 3 && board.length !== 4) return 0;
  const known = new Set<number>([...hole, ...board]);
  const boardRanks = new Set(board.map((c) => c >> 2));
  const current = handCategory(evaluate([...hole, ...board]));
  if (current >= HandCategory.Straight) return 0;
  let outs = 0;
  for (let c = 0; c < 52; c++) {
    if (known.has(c) || boardRanks.has(c >> 2)) continue;
    const next = [...board, c as Card];
    const mine = handCategory(evaluate([...hole, ...next]));
    if (mine < HandCategory.Straight) continue;
    const boardOnly = next.length === 5 ? handCategory(evaluate(next)) : HandCategory.HighCard;
    if (boardOnly < mine) outs++;
  }
  return outs;
}

/**
 * The part of an opponent's estimated range that would call a bet on this board: the stronger
 * half of the range by current hand strength (weighted median), plus draws.
 */
export function callingRange(range: Range, board: readonly Card[], known: readonly Card[]): Range {
  const strength = strengthOnBoard(board, new Set([...known, ...board]));
  const entries: { s: number; w: number }[] = [];
  let total = 0;
  range.forEach((w, i) => {
    if (w > 0) {
      entries.push({ s: strength[i] as number, w });
      total += w;
    }
  });
  entries.sort((a, b) => a.s - b.s);
  let acc = 0;
  let median = 0;
  for (const e of entries) {
    acc += e.w;
    if (acc >= total / 2) {
      median = e.s;
      break;
    }
  }
  const callers = new Float64Array(range.length);
  ALL_COMBOS.forEach((c, i) => {
    const w = range[i] as number;
    if (w === 0) return;
    if ((strength[i] as number) >= median || hasDraw(c.a, c.b, board)) callers[i] = w;
  });
  return callers;
}

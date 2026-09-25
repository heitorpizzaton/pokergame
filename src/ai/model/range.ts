import type { Card } from '../../core/cards/index.ts';
import { evaluate } from '../../core/eval/index.ts';
import type { ActionRecord, Street } from '../../core/view/index.ts';
import { ALL_COMBOS } from '../ranges/hand-order.ts';
import { boardAt } from '../view-analysis.ts';
import type { TendencyEstimate } from './opponent-model.ts';

/**
 * Weighted range over the 1,326 starting combos (AGENTS.md §8.2.2): starts from what the
 * opponent's observed tendencies imply and is updated by every public action in the hand with a
 * Bayesian-style likelihood. Combos that use known cards (the NPC's own cards, the board) get
 * weight 0 (card removal).
 */
export type Range = Float64Array;

const sigmoid = (x: number): number => 1 / (1 + Math.exp(-x));

/** Soft membership of a percentile in the top `width` share of hands. */
function inTop(percentile: number, width: number, softness = 0.04): number {
  return sigmoid((width - percentile) / softness);
}

/** Relative strength (0 = worst, 1 = best) of every live combo on `board`. */
function strengthOnBoard(board: readonly Card[], dead: ReadonlySet<number>): Float64Array {
  const values = new Float64Array(ALL_COMBOS.length).fill(-1);
  const live: number[] = [];
  ALL_COMBOS.forEach((c, i) => {
    if (dead.has(c.a) || dead.has(c.b)) return;
    values[i] = evaluate([c.a, c.b, ...board]);
    live.push(i);
  });
  const sorted = live.map((i) => values[i] as number).sort((x, y) => x - y);
  const strength = new Float64Array(ALL_COMBOS.length);
  for (const i of live) {
    // Upper-bound rank: ties share the strength of the best in their group.
    const v = values[i] as number;
    let lo = 0;
    let hi = sorted.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if ((sorted[mid] as number) <= v) lo = mid + 1;
      else hi = mid;
    }
    strength[i] = lo / sorted.length;
  }
  return strength;
}

/** Flush draws and open-ended straight draws on the flop or turn get extra weight. */
function hasDraw(a: Card, b: Card, board: readonly Card[]): boolean {
  if (board.length >= 5) return false;
  const cards = [a, b, ...board];
  for (let suit = 0; suit < 4; suit++) {
    if (cards.filter((c) => (c & 3) === suit).length === 4) return true;
  }
  const ranks = new Set(cards.map((c) => c >> 2));
  if (ranks.has(12)) ranks.add(-1);
  for (let low = 0; low <= 8; low++) {
    let run = 0;
    for (let r = low; r < low + 4; r++) if (ranks.has(r)) run++;
    if (run === 4) return true;
  }
  return false;
}

export function estimateRange(
  seat: number,
  actions: readonly ActionRecord[],
  board: readonly Card[],
  known: readonly Card[],
  tendencies: TendencyEstimate,
): Range {
  const dead = new Set<number>([...known, ...board]);
  const weights = new Float64Array(ALL_COMBOS.length);
  ALL_COMBOS.forEach((c, i) => {
    weights[i] = dead.has(c.a) || dead.has(c.b) ? 0 : 1;
  });

  const { vpip, pfr } = tendencies;
  const bluffiness = Math.min(0.5, Math.max(0.12, 0.08 * tendencies.aggression));
  let raises = 0;
  const strengthCache = new Map<Street, Float64Array>();

  for (const action of actions) {
    const isSeat = action.seat === seat;
    const aggressive = action.kind === 'bet' || action.kind === 'raise';
    if (action.street === 'preflop') {
      if (isSeat) {
        ALL_COMBOS.forEach((c, i) => {
          const w = weights[i] as number;
          if (w === 0) return;
          const p = c.percentile;
          let likelihood: number;
          if (aggressive) {
            likelihood = inTop(p, raises === 0 ? pfr : pfr * Math.pow(0.35, raises));
          } else if (action.kind === 'call') {
            const width = raises === 0 ? vpip : Math.max(pfr * 0.8, vpip * 0.55);
            likelihood = inTop(p, width) * (1 - 0.6 * inTop(p, pfr * 0.3 * Math.pow(0.5, raises)));
          } else if (action.kind === 'check') {
            likelihood = 1 - 0.8 * inTop(p, pfr * 0.6);
          } else {
            likelihood = 1;
          }
          weights[i] = w * (0.02 + 0.98 * likelihood);
        });
      }
      if (aggressive) raises++;
      continue;
    }
    if (!isSeat) continue;
    let strength = strengthCache.get(action.street);
    const streetBoard = boardAt(board, action.street);
    if (!strength) {
      strength = strengthOnBoard(streetBoard, new Set([...known, ...streetBoard]));
      strengthCache.set(action.street, strength);
    }
    ALL_COMBOS.forEach((c, i) => {
      const w = weights[i] as number;
      if (w === 0) return;
      const s = strength[i] as number;
      const draw = hasDraw(c.a, c.b, streetBoard) ? 0.3 : 0;
      let likelihood: number;
      if (aggressive) likelihood = (1 - bluffiness) * Math.pow(s, 1.6) + bluffiness + draw;
      else if (action.kind === 'call') likelihood = 0.25 + 0.75 * Math.min(1, s * 1.3) + draw * 0.7;
      else if (action.kind === 'check') likelihood = 1 - 0.45 * Math.pow(s, 3);
      else likelihood = 1;
      weights[i] = w * likelihood;
    });
  }
  return weights;
}

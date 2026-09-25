import type { Card } from '../cards/index.ts';
import { evaluateMasks } from '../eval/index.ts';
import type { EquityResult } from './types.ts';

/** Enumeration budget: the largest number of scenarios {@link exactEquityVsRandom} will visit. */
export const EXACT_BUDGET = 1_250_000;

/** n choose k (exact for the small values used here). */
export function choose(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  let result = 1;
  for (let i = 1; i <= k; i++) result = (result * (n - k + i)) / i;
  return Math.round(result);
}

/**
 * Number of scenarios an exact enumeration against `opponents` random hands visits: every board
 * completion times every ordered assignment of opponent hands.
 */
export function exactScenarioCount(boardCards: number, opponents: number): number {
  let unseen = 52 - 2 - boardCards;
  let count = choose(unseen, 5 - boardCards);
  unseen -= 5 - boardCards;
  for (let i = 0; i < opponents; i++) {
    count *= choose(unseen, 2);
    unseen -= 2;
  }
  return count;
}

function maskOf(cards: readonly Card[]): [number, number, number, number] {
  const m: [number, number, number, number] = [0, 0, 0, 0];
  for (const c of cards) {
    const suit = c & 3;
    m[suit] = (m[suit] as number) | (1 << (c >> 2));
  }
  return m;
}

function unseenCards(known: readonly Card[]): number[] {
  const used = new Set<number>(known);
  const unseen: number[] = [];
  for (let c = 0; c < 52; c++) if (!used.has(c)) unseen.push(c);
  return unseen;
}

/**
 * Calls `visit` with the per-suit masks of every completion of the board to five cards, drawn
 * from `pool`, marking the drawn cards in `taken`. Allocation-free inner loop.
 */
function forEachBoard(
  pool: readonly number[],
  missing: number,
  base: readonly [number, number, number, number],
  taken: Uint8Array,
  visit: (c: number, d: number, h: number, s: number) => void,
): void {
  const masks = new Int32Array(4 * (missing + 1));
  masks.set(base, 0);
  const recurse = (start: number, depth: number): void => {
    const offset = depth * 4;
    if (depth === missing) {
      visit(
        masks[offset] as number,
        masks[offset + 1] as number,
        masks[offset + 2] as number,
        masks[offset + 3] as number,
      );
      return;
    }
    const next = offset + 4;
    for (let i = start; i <= pool.length - (missing - depth); i++) {
      const card = pool[i] as number;
      masks[next] = masks[offset] as number;
      masks[next + 1] = masks[offset + 1] as number;
      masks[next + 2] = masks[offset + 2] as number;
      masks[next + 3] = masks[offset + 3] as number;
      masks[next + (card & 3)] = (masks[next + (card & 3)] as number) | (1 << (card >> 2));
      taken[card] = 1;
      recurse(i + 1, depth + 1);
      taken[card] = 0;
    }
  };
  recurse(0, 0);
}

/**
 * Exact equity of `hero` against `opponents` hands drawn uniformly from the unseen cards, over
 * every possible completion of `board` (AGENTS.md §7.2). Returns null when the enumeration would
 * exceed {@link EXACT_BUDGET}; use Monte Carlo instead.
 */
export function exactEquityVsRandom(
  hero: readonly Card[],
  board: readonly Card[],
  opponents: number,
): EquityResult | null {
  if (opponents < 1) throw new RangeError('At least one opponent is required');
  if (exactScenarioCount(board.length, opponents) > EXACT_BUDGET) return null;

  const pool = unseenCards([...hero, ...board]);
  const heroMask = maskOf(hero);
  const taken = new Uint8Array(52);
  const opponentValues = new Float64Array(opponents);
  let wins = 0;
  let ties = 0;
  let share = 0;
  let count = 0;

  forEachBoard(pool, 5 - board.length, maskOf(board), taken, (c, d, h, s) => {
    const heroValue = evaluateMasks(
      c | heroMask[0],
      d | heroMask[1],
      h | heroMask[2],
      s | heroMask[3],
      7,
    );
    const runout = [c, d, h, s];
    const assign = (depth: number): void => {
      if (depth === opponents) {
        let tied = 0;
        for (let o = 0; o < opponents; o++) {
          const v = opponentValues[o] as number;
          if (v > heroValue) {
            count++;
            return;
          }
          if (v === heroValue) tied++;
        }
        count++;
        if (tied === 0) wins++;
        else ties++;
        share += 1 / (tied + 1);
        return;
      }
      for (let i = 0; i < pool.length - 1; i++) {
        const a = pool[i] as number;
        if (taken[a]) continue;
        taken[a] = 1;
        for (let j = i + 1; j < pool.length; j++) {
          const b = pool[j] as number;
          if (taken[b]) continue;
          taken[b] = 1;
          const m0 = runout[0] as number;
          const m1 = runout[1] as number;
          const m2 = runout[2] as number;
          const m3 = runout[3] as number;
          const bitA = 1 << (a >> 2);
          const bitB = 1 << (b >> 2);
          const sa = a & 3;
          const sb = b & 3;
          opponentValues[depth] = evaluateMasks(
            m0 | (sa === 0 ? bitA : 0) | (sb === 0 ? bitB : 0),
            m1 | (sa === 1 ? bitA : 0) | (sb === 1 ? bitB : 0),
            m2 | (sa === 2 ? bitA : 0) | (sb === 2 ? bitB : 0),
            m3 | (sa === 3 ? bitA : 0) | (sb === 3 ? bitB : 0),
            7,
          );
          assign(depth + 1);
          taken[b] = 0;
        }
        taken[a] = 0;
      }
    };
    assign(0);
  });

  return {
    win: wins / count,
    tie: ties / count,
    equity: share / count,
    samples: count,
    exact: true,
    standardError: 0,
  };
}

/**
 * Exact equity of each known hand over every completion of `board`: all-in runouts (where every
 * hand is public), and hand-vs-hand reference values. Returns one result per hand.
 */
export function exactEquityVsHands(
  hands: readonly (readonly Card[])[],
  board: readonly Card[],
): EquityResult[] {
  const n = hands.length;
  if (n < 2) throw new RangeError('At least two hands are required');
  const pool = unseenCards([...hands.flat(), ...board]);
  const handMasks = hands.map(maskOf);
  const wins = new Float64Array(n);
  const ties = new Float64Array(n);
  const shares = new Float64Array(n);
  const values = new Float64Array(n);
  let count = 0;

  forEachBoard(pool, 5 - board.length, maskOf(board), new Uint8Array(52), (c, d, h, s) => {
    let best = -1;
    let winners = 0;
    for (let i = 0; i < n; i++) {
      const m = handMasks[i] as [number, number, number, number];
      const v = evaluateMasks(c | m[0], d | m[1], h | m[2], s | m[3], 7);
      values[i] = v;
      if (v > best) {
        best = v;
        winners = 1;
      } else if (v === best) {
        winners++;
      }
    }
    for (let i = 0; i < n; i++) {
      if (values[i] !== best) continue;
      if (winners === 1) wins[i] = (wins[i] as number) + 1;
      else ties[i] = (ties[i] as number) + 1;
      shares[i] = (shares[i] as number) + 1 / winners;
    }
    count++;
  });

  return hands.map((_, i) => ({
    win: (wins[i] as number) / count,
    tie: (ties[i] as number) / count,
    equity: (shares[i] as number) / count,
    samples: count,
    exact: true,
    standardError: 0,
  }));
}

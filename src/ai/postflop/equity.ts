import type { Card } from '../../core/cards/index.ts';
import { evaluateMasks } from '../../core/eval/index.ts';
import type { Rng } from '../../core/rng/index.ts';
import type { Range } from '../model/range.ts';
import { ALL_COMBOS } from '../ranges/hand-order.ts';

// Local alias: module runners may compile imported calls into getter lookups (see ADR-008).
const evaluateHand = evaluateMasks;

/**
 * Monte Carlo equity of the NPC's hand against the estimated ranges of its opponents (AGENTS.md
 * §8.2.3): each opponent's hand is sampled from its weighted range, then the board is
 * completed uniformly. Stops at `iterations` or when `deadline` passes.
 */
export function equityVsRanges(
  hole: readonly Card[],
  board: readonly Card[],
  ranges: readonly Range[],
  rng: Rng,
  iterations: number,
  deadline = Infinity,
  now: () => number = () => 0,
): number {
  if (ranges.length === 0) return 1;
  const cumulative = ranges.map((r) => {
    const c = new Float64Array(r.length);
    let sum = 0;
    for (let i = 0; i < r.length; i++) {
      sum += r[i] as number;
      c[i] = sum;
    }
    return c;
  });
  const known = new Set<number>([...hole, ...board]);
  const deck: number[] = [];
  for (let c = 0; c < 52; c++) if (!known.has(c)) deck.push(c);
  const baseMasks = [0, 0, 0, 0];
  for (const c of board) baseMasks[c & 3] = (baseMasks[c & 3] as number) | (1 << (c >> 2));
  const missing = 5 - board.length;
  const used = new Uint8Array(52);
  let share = 0;
  let done = 0;

  for (let it = 0; it < iterations; it++) {
    if ((it & 63) === 0 && it > 0 && now() > deadline) break;
    used.fill(0);
    for (const c of known) used[c] = 1;
    const opponentHands: number[] = [];
    let ok = true;
    for (const cum of cumulative) {
      const total = cum[cum.length - 1] as number;
      let picked = -1;
      for (let attempt = 0; attempt < 12 && picked < 0; attempt++) {
        const target = (rng.nextUint32() / 0x1_0000_0000) * total;
        let lo = 0;
        let hi = cum.length - 1;
        while (lo < hi) {
          const mid = (lo + hi) >> 1;
          if ((cum[mid] as number) <= target) lo = mid + 1;
          else hi = mid;
        }
        const combo = ALL_COMBOS[lo];
        if (combo && !used[combo.a] && !used[combo.b]) picked = lo;
      }
      if (picked < 0) {
        ok = false;
        break;
      }
      const combo = ALL_COMBOS[picked];
      if (!combo) break;
      used[combo.a] = 1;
      used[combo.b] = 1;
      opponentHands.push(combo.a, combo.b);
    }
    if (!ok) continue;
    const masks = [...baseMasks];
    let drawn = 0;
    while (drawn < missing) {
      const c = deck[rng.int(deck.length)] as number;
      if (used[c]) continue;
      used[c] = 1;
      masks[c & 3] = (masks[c & 3] as number) | (1 << (c >> 2));
      drawn++;
    }
    const heroMasks = [...masks];
    for (const c of hole) heroMasks[c & 3] = (heroMasks[c & 3] as number) | (1 << (c >> 2));
    const hero = evaluateHand(
      heroMasks[0] as number,
      heroMasks[1] as number,
      heroMasks[2] as number,
      heroMasks[3] as number,
      7,
    );
    let tied = 0;
    let lost = false;
    for (let o = 0; o < opponentHands.length && !lost; o += 2) {
      const m = [...masks];
      const a = opponentHands[o] as number;
      const b = opponentHands[o + 1] as number;
      m[a & 3] = (m[a & 3] as number) | (1 << (a >> 2));
      m[b & 3] = (m[b & 3] as number) | (1 << (b >> 2));
      const v = evaluateHand(m[0] as number, m[1] as number, m[2] as number, m[3] as number, 7);
      if (v > hero) lost = true;
      else if (v === hero) tied++;
    }
    done++;
    if (!lost) share += 1 / (tied + 1);
  }
  return done === 0 ? 0.5 : share / done;
}

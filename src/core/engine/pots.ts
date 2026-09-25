import type { PublicPot } from '../view/index.ts';

export interface Contribution {
  readonly seat: number;
  readonly amount: number;
  readonly folded: boolean;
}

/**
 * Builds the main pot and side pots from each player's total contribution (docs/RULES.md §6).
 *
 * Contributions are sliced into layers at every distinct contribution level. Each layer is
 * eligible to the non-folded players who reached that level; folded players' chips stay in the
 * layers they reached. Consecutive layers with the same eligible players are merged. Uncalled
 * bets must already have been returned, so every layer has at least one eligible player.
 */
export function buildPots(contributions: readonly Contribution[]): PublicPot[] {
  const levels = [...new Set(contributions.map((c) => c.amount).filter((a) => a > 0))].sort(
    (a, b) => a - b,
  );
  const pots: { amount: number; eligibleSeats: number[] }[] = [];
  let previous = 0;
  for (const level of levels) {
    let amount = 0;
    const eligible: number[] = [];
    for (const c of contributions) {
      amount += Math.min(c.amount, level) - Math.min(c.amount, previous);
      if (!c.folded && c.amount >= level) eligible.push(c.seat);
    }
    previous = level;
    if (amount === 0) continue;
    if (eligible.length === 0) {
      throw new Error('Pot layer with no eligible player: uncalled bet was not returned');
    }
    eligible.sort((a, b) => a - b);
    const last = pots.at(-1);
    if (last && sameSeats(last.eligibleSeats, eligible)) last.amount += amount;
    else pots.push({ amount, eligibleSeats: eligible });
  }
  return pots;
}

function sameSeats(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((seat, i) => seat === b[i]);
}

/**
 * Splits `amount` equally among `winners`; odd chips go one at a time to the winners in seat
 * order starting from the first seat left of the button (docs/RULES.md §6).
 */
export function splitPot(
  amount: number,
  winners: readonly number[],
  button: number,
  seatCount: number,
): { seat: number; amount: number }[] {
  const ordered = [...winners].sort(
    (a, b) => distanceFrom(button, a, seatCount) - distanceFrom(button, b, seatCount),
  );
  const share = Math.floor(amount / ordered.length);
  let remainder = amount - share * ordered.length;
  return ordered.map((seat) => {
    const extra = remainder > 0 ? 1 : 0;
    remainder -= extra;
    return { seat, amount: share + extra };
  });
}

/** Clockwise distance from `from` to `to` in [1, seatCount] (the seat itself is last). */
function distanceFrom(from: number, to: number, seatCount: number): number {
  const d = (to - from + seatCount) % seatCount;
  return d === 0 ? seatCount : d;
}

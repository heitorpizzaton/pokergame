import type { Card } from '../cards/index.ts';
import { evaluate, HandCategory, handCategory } from '../eval/index.ts';

/**
 * Outs and improvement probabilities for the hero on the flop or turn (AGENTS.md §7.3).
 *
 * An **out** is an unseen card that, dealt next, lifts the hero's hand to a higher category that
 * the board alone does not also reach, so the improvement belongs to the hero rather than to
 * everyone at the table. The "improve" probabilities use the same definition over the rest of
 * the runout, enumerated exactly.
 */
export interface DrawOdds {
  readonly category: HandCategory;
  /** Next-card outs, in card order. */
  readonly outs: readonly Card[];
  /** Probability of improving on the next card. */
  readonly improveNextCard: number;
  /** Probability of improving by the river (equals `improveNextCard` on the turn). */
  readonly improveByRiver: number;
  /**
   * Advanced, and only an estimate: outs split by whether they also pair the board or add a
   * third card of a suit, which can give an opponent a stronger hand.
   */
  readonly cleanOuts: readonly Card[];
  readonly taintedOuts: readonly Card[];
}

/** Category of a board of up to five cards on its own (no straights or flushes below five). */
function boardCategory(board: readonly Card[]): HandCategory {
  if (board.length >= 5) return handCategory(evaluate(board));
  const counts = new Map<number, number>();
  for (const c of board) counts.set(c >> 2, (counts.get(c >> 2) ?? 0) + 1);
  const sizes = [...counts.values()].sort((a, b) => b - a);
  if (sizes[0] === 4) return HandCategory.FourOfAKind;
  if (sizes[0] === 3) return HandCategory.ThreeOfAKind;
  if (sizes[0] === 2 && sizes[1] === 2) return HandCategory.TwoPair;
  if (sizes[0] === 2) return HandCategory.OnePair;
  return HandCategory.HighCard;
}

function improves(hero: readonly Card[], board: readonly Card[], base: HandCategory): boolean {
  const category = handCategory(evaluate([...hero, ...board]));
  return category > base && category > boardCategory(board);
}

export function drawOdds(hero: readonly Card[], board: readonly Card[]): DrawOdds | null {
  if (board.length !== 3 && board.length !== 4) return null;
  const known = new Set<number>([...hero, ...board]);
  const unseen: Card[] = [];
  for (let c = 0; c < 52; c++) if (!known.has(c)) unseen.push(c as Card);
  const base = handCategory(evaluate([...hero, ...board]));

  const outs = unseen.filter((c) => improves(hero, [...board, c], base));

  let improveByRiver = outs.length / unseen.length;
  if (board.length === 3) {
    let hits = 0;
    let total = 0;
    for (let i = 0; i < unseen.length; i++) {
      for (let j = i + 1; j < unseen.length; j++) {
        total++;
        if (improves(hero, [...board, unseen[i] as Card, unseen[j] as Card], base)) hits++;
      }
    }
    improveByRiver = hits / total;
  }

  const boardRanks = new Set(board.map((c) => c >> 2));
  const suitCounts = [0, 0, 0, 0];
  for (const c of board) suitCounts[c & 3] = (suitCounts[c & 3] as number) + 1;
  const tainted = (c: Card): boolean => {
    if (boardRanks.has(c >> 2)) return true;
    const category = handCategory(evaluate([...hero, ...board, c]));
    return category < HandCategory.Flush && (suitCounts[c & 3] as number) + 1 >= 3;
  };

  return {
    category: base,
    outs,
    improveNextCard: outs.length / unseen.length,
    improveByRiver,
    cleanOuts: outs.filter((c) => !tainted(c)),
    taintedOuts: outs.filter(tainted),
  };
}

/**
 * Probability that the hero finishes with at least `category` by the river, enumerating every
 * runout exactly (for the reference draw probabilities of §7.2).
 */
export function probabilityOfAtLeast(
  hero: readonly Card[],
  board: readonly Card[],
  category: HandCategory,
): number {
  const known = new Set<number>([...hero, ...board]);
  const unseen: Card[] = [];
  for (let c = 0; c < 52; c++) if (!known.has(c)) unseen.push(c as Card);
  const missing = 5 - board.length;
  let hits = 0;
  let total = 0;
  const pick = (start: number, chosen: Card[]): void => {
    if (chosen.length === missing) {
      total++;
      if (handCategory(evaluate([...hero, ...board, ...chosen])) >= category) hits++;
      return;
    }
    for (let i = start; i < unseen.length; i++) {
      chosen.push(unseen[i] as Card);
      pick(i + 1, chosen);
      chosen.pop();
    }
  };
  if (missing > 2) throw new RangeError('Only flop and turn draws are supported');
  pick(0, []);
  return hits / total;
}

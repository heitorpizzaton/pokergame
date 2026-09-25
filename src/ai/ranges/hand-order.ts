import type { Card } from '../../core/cards/index.ts';
import { handClassLabel, preflopClasses } from '../../core/equity/index.ts';

/**
 * Preflop hand ordering used for ranges (AGENTS.md §8.2). Raw equity against a random hand
 * overrates offsuit high cards for multiway, deep-stacked play, so suitedness, connectedness
 * and pairs get a small playability bonus on top of the exact equity table.
 */
const RANKS = '23456789TJQKA';

function playability(label: string, equity: number): number {
  const hi = RANKS.indexOf(label.charAt(0));
  const lo = RANKS.indexOf(label.charAt(1));
  if (hi === lo) return equity + 0.01;
  const gap = hi - lo - 1;
  let bonus = label.endsWith('s') ? 0.025 : 0;
  if (gap === 0) bonus += 0.015;
  else if (gap === 1) bonus += 0.008;
  else if (gap === 2) bonus += 0.003;
  return equity + bonus;
}

interface Ordered {
  readonly label: string;
  readonly combos: number;
  /** Share of all 1,326 combos ranked strictly above this class. */
  readonly above: number;
  /** Midpoint percentile of the class, in [0, 1]; 0 is the strongest. */
  readonly percentile: number;
}

const ORDER: readonly Ordered[] = (() => {
  const scored = preflopClasses()
    .map((c) => ({
      label: c.label,
      combos: c.combos,
      score: playability(c.label, c.vsRandom.equity),
    }))
    .sort((a, b) => b.score - a.score);
  let above = 0;
  return scored.map((c) => {
    const entry = {
      label: c.label,
      combos: c.combos,
      above: above / 1326,
      percentile: (above + c.combos / 2) / 1326,
    };
    above += c.combos;
    return entry;
  });
})();

const BY_LABEL: ReadonlyMap<string, Ordered> = new Map(ORDER.map((o) => [o.label, o]));

/** Midpoint percentile of a starting hand in [0, 1] (0 = best). */
export function handPercentile(hole: readonly Card[]): number {
  return BY_LABEL.get(handClassLabel(hole))?.percentile ?? 1;
}

/** Class labels strongest first. */
export function orderedClasses(): readonly string[] {
  return ORDER.map((o) => o.label);
}

/** All 1,326 two-card combos with their percentile, for range weighting. */
export interface Combo {
  readonly a: Card;
  readonly b: Card;
  readonly percentile: number;
}

export const ALL_COMBOS: readonly Combo[] = (() => {
  const combos: Combo[] = [];
  for (let a = 0; a < 52; a++) {
    for (let b = a + 1; b < 52; b++) {
      const hole = [a as Card, b as Card];
      combos.push({ a: a as Card, b: b as Card, percentile: handPercentile(hole) });
    }
  }
  return combos;
})();

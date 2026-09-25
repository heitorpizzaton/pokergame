import type { Card } from '../cards/index.ts';
import { PREFLOP_VS_RANDOM } from './preflop-table.ts';
import type { EquityResult } from './types.ts';

const RANKS = '23456789TJQKA';

export interface PreflopClass {
  /** e.g. 'AA', 'AKs', 'T9o'. */
  readonly label: string;
  /** Number of card combinations in the class (6, 4 or 12). */
  readonly combos: number;
  /** Exact heads-up equity against one random hand. */
  readonly vsRandom: EquityResult;
  /**
   * Share of all 1,326 starting combinations that are strictly stronger (by equity against a
   * random hand). AA is 0; "top 10%" means `topShare` below 0.10.
   */
  readonly topShare: number;
  /** 1 = strongest of the 169 classes. */
  readonly rank: number;
}

const CLASSES: ReadonlyMap<string, PreflopClass> = (() => {
  const rows = [...PREFLOP_VS_RANDOM].sort((a, b) => b[4] - a[4]);
  const map = new Map<string, PreflopClass>();
  let stronger = 0;
  rows.forEach(([label, combos, win, tie, equity], i) => {
    map.set(label, {
      label,
      combos,
      vsRandom: { win, tie, equity, samples: 0, exact: true, standardError: 0 },
      topShare: stronger / 1326,
      rank: i + 1,
    });
    stronger += combos;
  });
  return map;
})();

/** The class label of two hole cards, e.g. `AKs`. */
export function handClassLabel(hole: readonly Card[]): string {
  const [a, b] = hole;
  if (a === undefined || b === undefined) throw new RangeError('Two hole cards are required');
  const hi = Math.max(a >> 2, b >> 2);
  const lo = Math.min(a >> 2, b >> 2);
  const H = RANKS.charAt(hi);
  const L = RANKS.charAt(lo);
  if (hi === lo) return H + L;
  return `${H}${L}${(a & 3) === (b & 3) ? 's' : 'o'}`;
}

export function preflopClass(hole: readonly Card[]): PreflopClass {
  const cls = CLASSES.get(handClassLabel(hole));
  if (!cls) throw new Error('Unknown starting hand');
  return cls;
}

/** All 169 classes, strongest first. */
export function preflopClasses(): PreflopClass[] {
  return [...CLASSES.values()];
}

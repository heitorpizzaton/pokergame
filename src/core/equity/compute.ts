import type { Card } from '../cards/index.ts';
import type { Rng } from '../rng/index.ts';
import { exactEquityVsRandom } from './exact.ts';
import { MonteCarloEquity, TARGET_STANDARD_ERROR } from './monte-carlo.ts';
import { preflopClass } from './preflop.ts';
import type { EquityResult } from './types.ts';

export interface EquityRequest {
  readonly hero: readonly Card[];
  readonly board: readonly Card[];
  /** Opponents still in the hand, all modelled as uniformly random hands. */
  readonly opponents: number;
}

export interface EquityRunOptions {
  /** Called with each improved estimate (Monte Carlo) or once with the exact answer. */
  readonly onProgress?: (result: EquityResult) => void;
  /** Checked between chunks; returning true abandons the run (it resolves to null). */
  readonly isCancelled?: () => boolean;
  /** Yields to the event loop between chunks so cancel messages can arrive. */
  readonly yieldControl?: () => Promise<void>;
  readonly now?: () => number;
  /** Hard time cap for Monte Carlo, in milliseconds (AGENTS.md §7.2). */
  readonly timeBudgetMs?: number;
  readonly minIterations?: number;
  readonly maxIterations?: number;
  readonly chunkSize?: number;
}

/**
 * Computes the hero's equity against random hands (AGENTS.md §7.2): the exact preflop table when
 * heads-up preflop, exact enumeration when within budget, otherwise Monte Carlo with progressive
 * results, early stopping once the standard error is below 0.25 pp, and a hard time cap.
 */
export async function runEquity(
  request: EquityRequest,
  rng: Rng,
  options: EquityRunOptions = {},
): Promise<EquityResult | null> {
  const { hero, board, opponents } = request;
  if (hero.length !== 2) throw new RangeError('The hero needs exactly two hole cards');
  if (board.length > 5 || board.length === 1 || board.length === 2) {
    throw new RangeError('The board must have 0, 3, 4 or 5 cards');
  }

  if (board.length === 0 && opponents === 1) {
    const result = { ...preflopClass(hero).vsRandom, samples: 1_712_304 * 1_225 };
    options.onProgress?.(result);
    return result;
  }
  const exact = exactEquityVsRandom(hero, board, opponents);
  if (exact) {
    options.onProgress?.(exact);
    return exact;
  }

  const now = options.now ?? (() => performance.now());
  const deadline = now() + (options.timeBudgetMs ?? 1_500);
  const minIterations = options.minIterations ?? 4_000;
  const maxIterations = options.maxIterations ?? 2_000_000;
  const chunk = options.chunkSize ?? 4_000;
  const mc = new MonteCarloEquity(hero, board, opponents, rng);
  for (;;) {
    mc.run(chunk);
    options.onProgress?.(mc.result());
    const done =
      (mc.iterations >= minIterations && mc.standardError < TARGET_STANDARD_ERROR) ||
      mc.iterations >= maxIterations ||
      now() >= deadline;
    if (done) return mc.result();
    if (options.yieldControl) await options.yieldControl();
    if (options.isCancelled?.()) return null;
  }
}

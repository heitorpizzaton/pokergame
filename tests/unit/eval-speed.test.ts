import { describe, expect, it } from 'vitest';
import { evaluateMasks } from '../../src/core/eval/index.ts';
import { CryptoRng } from '../../src/core/rng/index.ts';
import { measureEvalRate } from '../support/eval-bench.ts';

/**
 * Speed target (AGENTS.md §7.1): at least 10 million 7-card evaluations per second in Node.
 * `npm run bench:eval` prints the full measurement; this test enforces the target on whatever
 * machine runs the suite (CI runners are slower than a modern desktop, so passing here is a
 * conservative check). The best of three runs is used to reduce scheduler noise.
 */
describe('evaluator speed', () => {
  it('evaluates at least 10M random 7-card hands per second', () => {
    const rng = new CryptoRng();
    measureEvalRate(evaluateMasks, rng, 200_000, 2); // warm-up so the JIT has optimized the code
    const best = Math.max(
      ...[0, 1, 2].map(() => measureEvalRate(evaluateMasks, rng, 500_000, 4).perSecond),
    );
    console.info(`evaluator speed: ${(best / 1e6).toFixed(1)}M evals/s`);
    expect(best).toBeGreaterThanOrEqual(10_000_000);
  });
});

/**
 * Evaluator throughput benchmark (AGENTS.md §7.1 target: at least 10M evaluations per second in
 * Node on a modern desktop). Run with `npm run bench:eval`.
 */
import { evaluateMasks } from '../src/core/eval/index.ts';
import { CryptoRng } from '../src/core/rng/index.ts';
import { measureEvalRate } from '../tests/support/eval-bench.ts';

const rng = new CryptoRng();
const warm = measureEvalRate(evaluateMasks, rng, 200_000, 3);
const result = measureEvalRate(evaluateMasks, rng, 1_000_000, 5);
console.log(`warm-up: ${(warm.perSecond / 1e6).toFixed(1)}M evals/s`);
console.log(
  `evaluateMasks, random 7-card hands: ${(result.perSecond / 1e6).toFixed(1)}M evals/s ` +
    `(${result.evaluations.toLocaleString('en-US')} evals in ${result.seconds.toFixed(2)} s)`,
);

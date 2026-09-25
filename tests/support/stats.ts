/**
 * Statistics helpers for the fairness tests (AGENTS.md §13.2).
 */

/** Natural log of the gamma function (Lanczos approximation, g = 7, n = 9). */
export function logGamma(x: number): number {
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6,
    1.5056327351493116e-7,
  ];
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x);
  const z = x - 1;
  let sum = c[0] as number;
  for (let i = 1; i < 9; i++) sum += (c[i] as number) / (z + i);
  const t = z + 7.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(sum);
}

/** Regularized upper incomplete gamma Q(a, x) (Numerical Recipes: series or continued fraction). */
export function upperRegularizedGamma(a: number, x: number): number {
  if (x < 0 || a <= 0) throw new RangeError('Invalid arguments');
  if (x === 0) return 1;
  const gln = logGamma(a);
  if (x < a + 1) {
    let ap = a;
    let sum = 1 / a;
    let del = sum;
    for (let n = 0; n < 10_000; n++) {
      ap += 1;
      del *= x / ap;
      sum += del;
      if (Math.abs(del) < Math.abs(sum) * 1e-15) break;
    }
    return 1 - sum * Math.exp(-x + a * Math.log(x) - gln);
  }
  const tiny = 1e-300;
  let b = x + 1 - a;
  let c = 1 / tiny;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i < 10_000; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < tiny) d = tiny;
    c = b + an / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-15) break;
  }
  return Math.exp(-x + a * Math.log(x) - gln) * h;
}

/** Upper-tail p-value of a chi-square statistic with `df` degrees of freedom. */
export function chiSquarePValue(statistic: number, df: number): number {
  return upperRegularizedGamma(df / 2, statistic / 2);
}

/** Pearson chi-square statistic of observed counts against a uniform expectation. */
export function chiSquareUniform(observed: readonly number[] | Uint32Array): number {
  let total = 0;
  for (const count of observed) total += count;
  const expected = total / observed.length;
  let stat = 0;
  for (const count of observed) {
    const diff = count - expected;
    stat += (diff * diff) / expected;
  }
  return stat;
}

/** Two-sided standard-normal quantile for significance `alpha` (bisection on erfc). */
export function zForTwoSidedAlpha(alpha: number): number {
  let lo = 0;
  let hi = 10;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (erfc(mid / Math.SQRT2) > alpha) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** Complementary error function (Numerical Recipes erfcc, relative error < 1.2e-7). */
export function erfc(x: number): number {
  const z = Math.abs(x);
  const t = 1 / (1 + 0.5 * z);
  const r =
    t *
    Math.exp(
      -z * z -
        1.26551223 +
        t *
          (1.00002368 +
            t *
              (0.37409196 +
                t *
                  (0.09678418 +
                    t *
                      (-0.18628806 +
                        t *
                          (0.27886807 +
                            t *
                              (-1.13520398 +
                                t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))),
    );
  return x >= 0 ? r : 2 - r;
}

/**
 * Normal-approximation confidence interval for a binomial proportion: the observed count of `n`
 * trials must fall inside `[lower, upper]` when the true probability is `p`.
 */
export function binomialBounds(
  p: number,
  n: number,
  alpha: number,
): { lower: number; upper: number } {
  const z = zForTwoSidedAlpha(alpha);
  const mean = n * p;
  const sd = Math.sqrt(n * p * (1 - p));
  return { lower: mean - z * sd, upper: mean + z * sd };
}

import { describe, expect, it } from 'vitest';
import { chiSquarePValue, erfc, zForTwoSidedAlpha } from '../support/stats.ts';

// The fairness tests are only as good as these helpers, so they are checked against reference
// values computed with SciPy (scipy.stats.chi2.sf / chi2.median).
describe('statistics helpers', () => {
  it.each([
    [3.841459, 1, 0.04999999465319563],
    [29.587843, 10, 0.0010001708336657036],
    [86.661, 51, 0.0013535098085677407],
    [50, 51, 0.5133582325491168],
  ])('chi-square p-value(%f, df=%i) ≈ %f', (stat, df, p) => {
    expect(chiSquarePValue(stat, df)).toBeCloseTo(p, 8);
  });

  it('chi-square with large df is centred near its mean', () => {
    // SciPy: chi2.median(2601) = 2600.3333637195415.
    expect(chiSquarePValue(2600.3333637195415, 2601)).toBeCloseTo(0.5, 8);
  });

  it.each([
    [0.05, 1.959964],
    [0.01, 2.575829],
    [0.001, 3.290527],
  ])('two-sided z for alpha %f is %f', (alpha, z) => {
    expect(zForTwoSidedAlpha(alpha)).toBeCloseTo(z, 4);
  });

  it('erfc matches known values', () => {
    expect(erfc(0)).toBeCloseTo(1, 7);
    expect(erfc(1)).toBeCloseTo(0.157299207, 6);
    expect(erfc(-1)).toBeCloseTo(1.842700793, 6);
  });
});

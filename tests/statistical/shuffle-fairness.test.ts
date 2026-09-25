import { beforeAll, describe, expect, it } from 'vitest';
import { shuffledDeck } from '../../src/core/cards/index.ts';
import { CryptoRng, shuffleInPlace } from '../../src/core/rng/index.ts';
import { SeededRng } from '../../src/core/rng/seeded-rng.ts';
import { binomialBounds, chiSquarePValue, chiSquareUniform } from '../support/stats.ts';

/**
 * Fast fairness tests (AGENTS.md §13.2): at least 200,000 shuffles of the production CryptoRng.
 *
 * Significance: the whole file runs at a family-wise alpha of 0.001 (ADR-027). The shuffles are
 * fresh on every run, so each independent check at 0.001 would add its own 0.1% chance of failing
 * a perfect RNG; five such checks fail about 0.5% of CI runs. A Bonferroni correction splits the
 * 0.001 budget across the five families: the combined position × card test, the 52 per-position
 * tests (which split their share again, 52 ways), and the three starting-hand frequencies.
 */
const SHUFFLES = 200_000;
const ALPHA = 0.001;
const FAMILIES = 5;
const FAMILY_ALPHA = ALPHA / FAMILIES;

const positionCounts = new Uint32Array(52 * 52); // [position * 52 + card]
let pocketPairs = 0;
let suitedHands = 0;
let pocketAces = 0;

beforeAll(() => {
  const rng = new CryptoRng();
  for (let s = 0; s < SHUFFLES; s++) {
    const deck = shuffledDeck(rng);
    for (let pos = 0; pos < 52; pos++) {
      const index = pos * 52 + (deck[pos] as number);
      positionCounts[index] = (positionCounts[index] as number) + 1;
    }
    // Starting hand = the first two cards dealt.
    const a = deck[0] as number;
    const b = deck[1] as number;
    if (a >> 2 === b >> 2) {
      pocketPairs++;
      if (a >> 2 === 12) pocketAces++;
    } else if ((a & 3) === (b & 3)) {
      suitedHands++;
    }
  }
});

describe(`shuffle fairness over ${SHUFFLES.toLocaleString('en-US')} crypto shuffles`, () => {
  it('position × card table is uniform (combined chi-square, df = 51 × 51)', () => {
    // With both margins fixed at SHUFFLES, a 52×52 contingency table has 51 × 51 degrees of freedom.
    const stat = chiSquareUniform(positionCounts);
    expect(chiSquarePValue(stat, 51 * 51)).toBeGreaterThan(FAMILY_ALPHA);
  });

  it('every card is uniform at every position (Bonferroni-corrected)', () => {
    const perTestAlpha = FAMILY_ALPHA / 52;
    for (let pos = 0; pos < 52; pos++) {
      const row = positionCounts.subarray(pos * 52, pos * 52 + 52);
      const p = chiSquarePValue(chiSquareUniform(row), 51);
      expect(p, `position ${pos}`).toBeGreaterThan(perTestAlpha);
    }
  });

  it.each([
    { name: 'pocket pair', count: () => pocketPairs, p: 3 / 51 }, // ≈ 5.88%
    { name: 'suited', count: () => suitedHands, p: 12 / 51 }, // ≈ 23.53%
    { name: 'pocket aces', count: () => pocketAces, p: 6 / 1326 }, // ≈ 0.452%
  ])('$name frequency is within its Bonferroni-corrected bounds', ({ count, p }) => {
    const { lower, upper } = binomialBounds(p, SHUFFLES, FAMILY_ALPHA);
    expect(count()).toBeGreaterThanOrEqual(lower);
    expect(count()).toBeLessThanOrEqual(upper);
  });
});

describe('shuffle algorithm uniformity (deterministic, seeded)', () => {
  it('all 24 orderings of 4 items are equally likely', () => {
    // Guards the Fisher-Yates index bounds: an off-by-one (e.g. rng.int(i) or rng.int(n)) skews
    // this distribution far beyond the threshold.
    const rng = new SeededRng(20260925);
    const counts = new Map<string, number>();
    const trials = 240_000;
    for (let t = 0; t < trials; t++) {
      const key = shuffleInPlace([0, 1, 2, 3], rng).join('');
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    expect(counts.size).toBe(24);
    expect(chiSquarePValue(chiSquareUniform([...counts.values()]), 23)).toBeGreaterThan(ALPHA);
  });
});

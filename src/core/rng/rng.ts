/**
 * Random number source used by the engine and the AI (AGENTS.md §6). Production code uses
 * {@link CryptoRng}; tests inject a seeded implementation.
 */
export interface Rng {
  /** A uniformly distributed integer in [0, 2^32). */
  nextUint32(): number;
  /** A uniformly distributed integer in [0, maxExclusive), without modulo bias. */
  int(maxExclusive: number): number;
}

const TWO_POW_32 = 0x1_0000_0000;

/**
 * Uniform integer in [0, maxExclusive) by rejection sampling (AGENTS.md §6).
 *
 * Raw 32-bit values at or above the largest multiple of `maxExclusive` that fits in 2^32 are
 * discarded, so every residue has exactly the same number of pre-images and modulo bias is
 * impossible. The expected number of draws is below 2 for any `maxExclusive`.
 */
export function uniformIntBelow(nextUint32: () => number, maxExclusive: number): number {
  if (!Number.isInteger(maxExclusive) || maxExclusive < 1 || maxExclusive > TWO_POW_32) {
    throw new RangeError(`maxExclusive must be an integer in [1, 2^32], got ${maxExclusive}`);
  }
  const limit = TWO_POW_32 - (TWO_POW_32 % maxExclusive);
  for (;;) {
    const value = nextUint32();
    if (value < limit) return value % maxExclusive;
  }
}

import { describe, expect, it } from 'vitest';
import { CryptoRng, uniformIntBelow } from '../../src/core/rng/index.ts';
import { SeededRng } from '../../src/core/rng/seeded-rng.ts';
import { chiSquarePValue, chiSquareUniform } from '../support/stats.ts';

const TWO_POW_32 = 2 ** 32;

function scripted(values: number[]): () => number {
  let i = 0;
  return () => {
    const value = values[i++];
    if (value === undefined) throw new Error('script exhausted');
    return value;
  };
}

describe('uniformIntBelow (rejection sampling)', () => {
  it('rejects raw values in the biased tail and retries', () => {
    // n = 3 * 2^30: the largest multiple of n below 2^32 is 3 * 2^30, so values >= 3 * 2^30 are
    // rejected. Plain modulo would map them onto [0, 2^30) and double that range's probability.
    const n = 3 * 2 ** 30;
    const next = scripted([TWO_POW_32 - 1, 3 * 2 ** 30, 7]);
    expect(uniformIntBelow(next, n)).toBe(7);
  });

  it('accepts the largest unbiased raw value', () => {
    const n = 3 * 2 ** 30;
    expect(uniformIntBelow(scripted([3 * 2 ** 30 - 1]), n)).toBe(n - 1);
  });

  it('never rejects when n divides 2^32', () => {
    expect(uniformIntBelow(scripted([TWO_POW_32 - 1]), 2 ** 16)).toBe(2 ** 16 - 1);
    expect(uniformIntBelow(scripted([TWO_POW_32 - 1]), TWO_POW_32)).toBe(TWO_POW_32 - 1);
  });

  it('returns 0 for n = 1', () => {
    expect(uniformIntBelow(scripted([123456]), 1)).toBe(0);
  });

  it.each([0, -1, 1.5, NaN, TWO_POW_32 + 1])('rejects invalid bound %s', (n) => {
    expect(() => uniformIntBelow(() => 0, n)).toThrow(RangeError);
  });
});

describe('CryptoRng', () => {
  it('produces 32-bit unsigned integers', () => {
    const rng = new CryptoRng();
    for (let i = 0; i < 10_000; i++) {
      const v = rng.nextUint32();
      expect(Number.isInteger(v) && v >= 0 && v < TWO_POW_32).toBe(true);
    }
  });

  it.each([1, 2, 3, 7, 10, 51, 52, 1000, 2 ** 31 + 1])('int(%i) stays in range', (n) => {
    const rng = new CryptoRng();
    for (let i = 0; i < 5_000; i++) {
      const v = rng.int(n);
      expect(Number.isInteger(v) && v >= 0 && v < n).toBe(true);
    }
  });

  it('has no modulo bias for a bound where plain modulo would be badly biased', () => {
    // With n = 3 * 2^30, modulo sampling would put 50% of the mass in the first third.
    const rng = new CryptoRng();
    const n = 3 * 2 ** 30;
    const buckets = [0, 0, 0];
    const samples = 60_000;
    for (let i = 0; i < samples; i++) {
      const bucket = Math.floor(rng.int(n) / 2 ** 30);
      buckets[bucket] = (buckets[bucket] as number) + 1;
    }
    expect(chiSquarePValue(chiSquareUniform(buckets), 2)).toBeGreaterThan(0.001);
  });

  it('gives independent streams per instance', () => {
    const a = new CryptoRng();
    const b = new CryptoRng();
    const seqA = Array.from({ length: 8 }, () => a.nextUint32());
    const seqB = Array.from({ length: 8 }, () => b.nextUint32());
    expect(seqA).not.toEqual(seqB);
  });
});

describe('SeededRng (tests only)', () => {
  it('is deterministic for a seed', () => {
    const a = new SeededRng(42);
    const b = new SeededRng(42);
    for (let i = 0; i < 100; i++) expect(a.nextUint32()).toBe(b.nextUint32());
  });

  it('differs across seeds', () => {
    const a = new SeededRng(1);
    const b = new SeededRng(2);
    const seqA = Array.from({ length: 8 }, () => a.nextUint32());
    const seqB = Array.from({ length: 8 }, () => b.nextUint32());
    expect(seqA).not.toEqual(seqB);
  });

  it('produces 32-bit unsigned integers and in-range ints', () => {
    const rng = new SeededRng(7);
    for (let i = 0; i < 10_000; i++) {
      const v = rng.nextUint32();
      expect(v >= 0 && v < TWO_POW_32 && Number.isInteger(v)).toBe(true);
      expect(rng.int(52)).toBeLessThan(52);
    }
  });
});

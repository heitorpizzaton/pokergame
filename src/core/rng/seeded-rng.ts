import { type Rng, uniformIntBelow } from './rng.ts';

/**
 * Deterministic RNG for tests and reproducible simulations ONLY (xoshiro128**, seeded through
 * splitmix32). It is not cryptographically secure.
 *
 * Production code MUST NOT import this module: `src/core/rng/index.ts` does not export it, and
 * an ESLint rule rejects any import of it from `src/` (AGENTS.md §4.1), so it can never reach a
 * production bundle.
 */
export class SeededRng implements Rng {
  #s0: number;
  #s1: number;
  #s2: number;
  #s3: number;
  readonly #next = (): number => this.nextUint32();

  constructor(seed: number) {
    let state = seed >>> 0;
    const splitmix32 = (): number => {
      state = (state + 0x9e3779b9) >>> 0;
      let z = state;
      z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
      z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
      return (z ^ (z >>> 16)) >>> 0;
    };
    this.#s0 = splitmix32();
    this.#s1 = splitmix32();
    this.#s2 = splitmix32();
    this.#s3 = splitmix32();
    if ((this.#s0 | this.#s1 | this.#s2 | this.#s3) === 0) this.#s0 = 1;
  }

  nextUint32(): number {
    const result = Math.imul(rotl(Math.imul(this.#s1, 5), 7), 9) >>> 0;
    const t = this.#s1 << 9;
    this.#s2 ^= this.#s0;
    this.#s3 ^= this.#s1;
    this.#s1 ^= this.#s2;
    this.#s0 ^= this.#s3;
    this.#s2 ^= t;
    this.#s3 = rotl(this.#s3, 11);
    return result;
  }

  int(maxExclusive: number): number {
    return uniformIntBelow(this.#next, maxExclusive);
  }
}

function rotl(x: number, k: number): number {
  return (x << k) | (x >>> (32 - k));
}

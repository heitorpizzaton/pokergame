import { type Rng, uniformIntBelow } from './rng.ts';

const BUFFER_SIZE = 4096;

/**
 * Cryptographically secure RNG backed by `crypto.getRandomValues` (AGENTS.md §6). Values are
 * fetched in blocks to keep per-call overhead low. Each instance is an independent stream, so the
 * deck and the NPC decisions can each own one without sharing or correlating values.
 */
export class CryptoRng implements Rng {
  readonly #buffer = new Uint32Array(BUFFER_SIZE);
  #index = BUFFER_SIZE;
  readonly #next = (): number => this.nextUint32();

  nextUint32(): number {
    if (this.#index >= BUFFER_SIZE) {
      globalThis.crypto.getRandomValues(this.#buffer);
      this.#index = 0;
    }
    // Index is always < BUFFER_SIZE here.
    return this.#buffer[this.#index++] as number;
  }

  int(maxExclusive: number): number {
    return uniformIntBelow(this.#next, maxExclusive);
  }
}

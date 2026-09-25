import type { Card } from '../cards/index.ts';
import { evaluateMasks } from '../eval/index.ts';
import type { Rng } from '../rng/index.ts';
import type { EquityResult } from './types.ts';

/** AGENTS.md §7.2: stop once the standard error of the equity is below 0.25 percentage points. */
export const TARGET_STANDARD_ERROR = 0.0025;

/**
 * Incremental Monte Carlo equity estimate against `opponents` uniformly random hands. Each
 * simulation draws the opponents' hands and the rest of the board uniformly without
 * replacement from the unseen cards (a partial Fisher-Yates shuffle). Run it in chunks with
 * {@link run} and read {@link result} at any time for progressive display.
 */
export class MonteCarloEquity {
  readonly #pool: number[];
  readonly #missing: number;
  readonly #opponents: number;
  readonly #rng: Rng;
  readonly #base: [number, number, number, number];
  readonly #hero: [number, number, number, number];
  #n = 0;
  #wins = 0;
  #ties = 0;
  #sum = 0;
  #sumSquares = 0;

  constructor(hero: readonly Card[], board: readonly Card[], opponents: number, rng: Rng) {
    if (opponents < 1) throw new RangeError('At least one opponent is required');
    const known = new Set<number>([...hero, ...board]);
    this.#pool = [];
    for (let c = 0; c < 52; c++) if (!known.has(c)) this.#pool.push(c);
    this.#missing = 5 - board.length;
    this.#opponents = opponents;
    this.#rng = rng;
    this.#base = [0, 0, 0, 0];
    for (const c of board) this.#base[c & 3] = (this.#base[c & 3] as number) | (1 << (c >> 2));
    this.#hero = [0, 0, 0, 0];
    for (const c of hero) this.#hero[c & 3] = (this.#hero[c & 3] as number) | (1 << (c >> 2));
    if (this.#missing + 2 * opponents > this.#pool.length) {
      throw new RangeError('Not enough cards for that many opponents');
    }
  }

  get iterations(): number {
    return this.#n;
  }

  get standardError(): number {
    if (this.#n < 2) return Infinity;
    const mean = this.#sum / this.#n;
    const variance = Math.max(0, this.#sumSquares / this.#n - mean * mean);
    return Math.sqrt(variance / (this.#n - 1));
  }

  /** Runs `iterations` more simulations. */
  run(iterations: number): void {
    const pool = this.#pool;
    const size = pool.length;
    const needed = this.#missing + 2 * this.#opponents;
    const rng = this.#rng;
    for (let it = 0; it < iterations; it++) {
      for (let i = 0; i < needed; i++) {
        const j = i + rng.int(size - i);
        const tmp = pool[i] as number;
        pool[i] = pool[j] as number;
        pool[j] = tmp;
      }
      const board = [...this.#base];
      for (let i = 0; i < this.#missing; i++) {
        const c = pool[i] as number;
        board[c & 3] = (board[c & 3] as number) | (1 << (c >> 2));
      }
      const b0 = board[0] as number;
      const b1 = board[1] as number;
      const b2 = board[2] as number;
      const b3 = board[3] as number;
      const heroValue = evaluateMasks(
        b0 | this.#hero[0],
        b1 | this.#hero[1],
        b2 | this.#hero[2],
        b3 | this.#hero[3],
        7,
      );
      let lost = false;
      let tied = 0;
      for (let o = 0; o < this.#opponents && !lost; o++) {
        const a = pool[this.#missing + 2 * o] as number;
        const b = pool[this.#missing + 2 * o + 1] as number;
        const m = [b0, b1, b2, b3];
        m[a & 3] = (m[a & 3] as number) | (1 << (a >> 2));
        m[b & 3] = (m[b & 3] as number) | (1 << (b >> 2));
        const v = evaluateMasks(m[0] as number, m[1] as number, m[2] as number, m[3] as number, 7);
        if (v > heroValue) lost = true;
        else if (v === heroValue) tied++;
      }
      this.#n++;
      if (lost) continue;
      const share = 1 / (tied + 1);
      if (tied === 0) this.#wins++;
      else this.#ties++;
      this.#sum += share;
      this.#sumSquares += share * share;
    }
  }

  result(): EquityResult {
    const n = Math.max(1, this.#n);
    return {
      win: this.#wins / n,
      tie: this.#ties / n,
      equity: this.#sum / n,
      samples: this.#n,
      exact: false,
      standardError: this.standardError,
    };
  }
}

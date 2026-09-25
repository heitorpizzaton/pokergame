import { CryptoRng, type Rng } from '../core/rng/index.ts';

/**
 * Where a game's randomness comes from. Production always uses {@link cryptoRngFactory}. The
 * seeded factory exists only in the end-to-end debug build (ADR-022).
 */
export interface RngFactory {
  /** Deck shuffles for a new game. */
  deck(): Rng;
  /** NPC timing, names and style mix for a new game. */
  npc(): Rng;
  /** Decisions of one NPC brain. */
  brain(seat: number): Rng;
  /** Whether NPC brains may run in a worker (the seeded build keeps them in-process). */
  readonly workers: boolean;
  /**
   * Clock for NPC time budgets. The seeded build freezes it so decisions never depend on
   * machine speed; production uses the real clock.
   */
  readonly brainClock?: () => number;
}

export const cryptoRngFactory: RngFactory = {
  deck: () => new CryptoRng(),
  npc: () => new CryptoRng(),
  brain: () => new CryptoRng(),
  workers: true,
};

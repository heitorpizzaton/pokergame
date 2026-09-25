// The only production-tree module allowed to import the seeded RNG (see eslint.config.ts). It is
// loaded solely by the end-to-end debug build (`vite build --mode e2e`), so production bundles
// never contain it; `scripts/check-bundle.ts` verifies that (AGENTS.md §4.1, ADR-022).
import { SeededRng } from '../../core/rng/seeded-rng.ts';
import type { RngFactory } from '../rng-factory.ts';

/** Marker checked by end-to-end tests and absent from production bundles. */
export const SEEDED_MARKER = 'mesa-viva-seeded-debug';

/** Deterministic randomness for reproducible end-to-end games: each new game gets new streams. */
export function seededRngFactory(seed: number): RngFactory {
  let games = 0;
  let current = seed;
  document.documentElement.dataset.rng = SEEDED_MARKER;
  return {
    deck: () => {
      games++;
      current = seed * 7919 + games * 104_729;
      return new SeededRng(current);
    },
    npc: () => new SeededRng(current + 1),
    brain: (seat) => new SeededRng(current + 17 * (seat + 1)),
    workers: false,
  };
}

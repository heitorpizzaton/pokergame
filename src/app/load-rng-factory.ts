import { cryptoRngFactory, type RngFactory } from './rng-factory.ts';

/**
 * Production: the crypto RNG, always. The end-to-end debug build (`--mode e2e`, which sets
 * `VITE_SEEDED_DEBUG`) also accepts `?seed=N` for reproducible games. Vite replaces the env check
 * with a constant, so production builds drop the branch and the seeded module (ADR-022).
 */
export async function loadRngFactory(search: string): Promise<RngFactory> {
  if (import.meta.env.VITE_SEEDED_DEBUG === '1') {
    const seed = Number(new URLSearchParams(search).get('seed'));
    if (Number.isSafeInteger(seed) && seed > 0) {
      const { seededRngFactory } = await import('./debug/seeded-factory.ts');
      return seededRngFactory(seed);
    }
  }
  return cryptoRngFactory;
}

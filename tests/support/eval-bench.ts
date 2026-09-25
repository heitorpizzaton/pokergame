import type { evaluateMasks } from '../../src/core/eval/index.ts';
import type { Rng } from '../../src/core/rng/index.ts';

export interface BenchResult {
  evaluations: number;
  seconds: number;
  perSecond: number;
}

/**
 * Pre-generates `hands` random 7-card hands as suit masks, then times `passes` full evaluation
 * passes. Hand generation is excluded from the timing.
 */
export function measureEvalRate(
  evaluate: typeof evaluateMasks,
  rng: Rng,
  hands: number,
  passes: number,
): BenchResult {
  const masks = new Uint16Array(hands * 4);
  const deck = Array.from({ length: 52 }, (_, i) => i);
  for (let h = 0; h < hands; h++) {
    for (let i = 0; i < 7; i++) {
      const j = i + rng.int(52 - i);
      const card = deck[j] as number;
      deck[j] = deck[i] as number;
      deck[i] = card;
      const index = h * 4 + (card & 3);
      masks[index] = (masks[index] as number) | (1 << (card >> 2));
    }
  }

  let checksum = 0;
  const start = performance.now();
  for (let p = 0; p < passes; p++) {
    for (let h = 0; h < hands; h++) {
      const o = h * 4;
      checksum ^= evaluate(
        masks[o] as number,
        masks[o + 1] as number,
        masks[o + 2] as number,
        masks[o + 3] as number,
        7,
      );
    }
  }
  const seconds = (performance.now() - start) / 1000;
  if (checksum === -1) console.log('unreachable'); // keep the loop from being optimized away
  const evaluations = hands * passes;
  return { evaluations, seconds, perSecond: evaluations / seconds };
}

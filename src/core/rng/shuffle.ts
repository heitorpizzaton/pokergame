import type { Rng } from './rng.ts';

/**
 * Unbiased Fisher-Yates (Durstenfeld) shuffle, in place (AGENTS.md §6). Each position `i` is
 * swapped with a uniformly chosen index in [0, i], so all n! orderings are equally likely given
 * a uniform `rng.int`.
 */
export function shuffleInPlace<T>(items: T[], rng: Rng): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    const tmp = items[i] as T;
    items[i] = items[j] as T;
    items[j] = tmp;
  }
  return items;
}

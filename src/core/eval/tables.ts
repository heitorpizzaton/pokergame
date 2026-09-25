/**
 * Lookup tables indexed by a 13-bit rank mask (bit r set = rank index r present). 8192 entries
 * each, built once at module load (a few hundred microseconds), about 50 KB in total.
 */

export const MASK_SIZE = 1 << 13;

/** Number of set bits. */
export const POPCOUNT = new Uint8Array(MASK_SIZE);

/** Index of the highest set bit (0 for an empty mask; never read for empty masks). */
export const TOP_RANK = new Uint8Array(MASK_SIZE);

/**
 * Highest straight in the mask as `topRankIndex + 1`, or 0 when there is none. The wheel
 * (A-2-3-4-5) counts as a five-high straight (top rank index 3, stored as 4). Straights do not
 * wrap around (AGENTS.md §5.7).
 */
export const STRAIGHT_TOP = new Uint8Array(MASK_SIZE);

/**
 * The five highest ranks packed as nibbles, highest first and left-aligned:
 * `r1 << 16 | r2 << 12 | r3 << 8 | r4 << 4 | r5`. Masks with fewer than five bits leave the low
 * nibbles at zero.
 */
export const TOP_FIVE = new Uint32Array(MASK_SIZE);

const WHEEL = (1 << 12) | 0b1111;

for (let mask = 1; mask < MASK_SIZE; mask++) {
  let count = 0;
  let packed = 0;
  let shift = 16;
  let top = -1;
  for (let rank = 12; rank >= 0; rank--) {
    if ((mask & (1 << rank)) === 0) continue;
    count++;
    if (top < 0) top = rank;
    if (shift >= 0) {
      packed |= rank << shift;
      shift -= 4;
    }
  }
  POPCOUNT[mask] = count;
  TOP_RANK[mask] = top;
  TOP_FIVE[mask] = packed;

  for (let high = 12; high >= 4; high--) {
    const run = 0b11111 << (high - 4);
    if ((mask & run) === run) {
      STRAIGHT_TOP[mask] = high + 1;
      break;
    }
  }
  if (STRAIGHT_TOP[mask] === 0 && (mask & WHEEL) === WHEEL) STRAIGHT_TOP[mask] = 3 + 1;
}

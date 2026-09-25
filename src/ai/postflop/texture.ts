import type { Card } from '../../core/cards/index.ts';

export interface Texture {
  readonly paired: boolean;
  readonly monotone: boolean;
  /** Two or more cards of a suit: flush draws are possible. */
  readonly twoTone: boolean;
  /** Three board ranks within a five-rank window: straights are close. */
  readonly connected: boolean;
  /** 0 (dry) … 1 (very wet). */
  readonly wetness: number;
}

/** Board texture (AGENTS.md §8.2.4). */
export function boardTexture(board: readonly Card[]): Texture {
  const suits = [0, 0, 0, 0];
  for (const c of board) suits[c & 3] = (suits[c & 3] as number) + 1;
  const maxSuit = Math.max(...suits);
  const ranks = [...new Set(board.map((c) => c >> 2))].sort((a, b) => a - b);
  const paired = ranks.length < board.length;
  let connected = false;
  for (let i = 0; i + 2 < ranks.length; i++) {
    if ((ranks[i + 2] as number) - (ranks[i] as number) <= 4) connected = true;
  }
  const monotone = board.length >= 3 && maxSuit >= 3;
  const twoTone = maxSuit >= 2;
  const wetness = Math.min(
    1,
    (monotone ? 0.5 : twoTone ? 0.25 : 0) + (connected ? 0.4 : 0) + (paired ? -0.1 : 0) + 0.1,
  );
  return { paired, monotone, twoTone, connected, wetness: Math.max(0, wetness) };
}

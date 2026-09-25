import type { PositionLabel } from '../view/index.ts';

/** Labels for the players between the big blind and the button, in preflop action order. */
const MIDDLE_LABELS: Readonly<Record<number, readonly PositionLabel[]>> = {
  0: [],
  1: ['UTG'],
  2: ['UTG', 'CO'],
  3: ['UTG', 'HJ', 'CO'],
  4: ['UTG', 'LJ', 'HJ', 'CO'],
  5: ['UTG', 'UTG+1', 'LJ', 'HJ', 'CO'],
  6: ['UTG', 'UTG+1', 'MP', 'LJ', 'HJ', 'CO'],
};

/**
 * Position labels by offset from the button (index 0 = button, 1 = next player clockwise, …)
 * for a hand with `count` players dealt in (docs/RULES.md §3). The single source of truth for
 * the UI and the AI.
 */
export function positionLabelsFromButton(count: number): PositionLabel[] {
  if (!Number.isInteger(count) || count < 2 || count > 9) {
    throw new RangeError(`Position labels need 2 to 9 players, got ${count}`);
  }
  if (count === 2) return ['BTN', 'BB'];
  const middle = MIDDLE_LABELS[count - 3] ?? [];
  return ['BTN', 'SB', 'BB', ...middle];
}

/** Position labels in preflop action order (first to act → big blind). */
export function positionLabelsInActionOrder(count: number): PositionLabel[] {
  const fromButton = positionLabelsFromButton(count);
  if (count === 2) return fromButton; // BTN (small blind) acts first preflop heads-up
  // Offsets 3..n-1 act first, then the button, then the blinds.
  return [...fromButton.slice(3), ...fromButton.slice(0, 3)];
}

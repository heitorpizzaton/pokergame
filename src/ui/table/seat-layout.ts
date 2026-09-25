/**
 * Seat positions around the table as percentages of the table area. Visual slot 0 is always
 * the user at the bottom centre (AGENTS.md §5.1); the others follow clockwise, which on screen
 * is bottom → left → top → right. Logical seat order is unaffected.
 */
export interface SeatPosition {
  readonly x: number;
  readonly y: number;
}

export function seatPositions(
  count: number,
  orientation: 'portrait' | 'landscape',
): SeatPosition[] {
  const rx = orientation === 'portrait' ? 40 : 44;
  const ry = orientation === 'portrait' ? 41 : 38;
  const cy = orientation === 'portrait' ? 47 : 46;
  return Array.from({ length: count }, (_, i) => {
    const angle = Math.PI / 2 + (i * 2 * Math.PI) / count;
    return { x: 50 + rx * Math.cos(angle), y: cy + ry * Math.sin(angle) };
  });
}

/** Visual slot of a logical seat so that the user's seat lands in slot 0. */
export function visualSlot(seat: number, userSeat: number, count: number): number {
  return (seat - userSeat + count) % count;
}

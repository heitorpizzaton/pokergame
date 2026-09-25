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

/** Centre of the table in the same percentage coordinates as the seats. */
export function tableCenter(orientation: 'portrait' | 'landscape'): SeatPosition {
  return { x: 50, y: orientation === 'portrait' ? 47 : 46 };
}

/**
 * Where a seat's bet sits: on the betting line between the seat and the centre. The user's large
 * hole cards reach further into the table, so the user's bet sits closer to the centre.
 */
export function betPosition(
  seat: SeatPosition,
  center: SeatPosition,
  isUser = false,
): SeatPosition {
  const t = isUser ? 0.6 : 0.4;
  return { x: seat.x + (center.x - seat.x) * t, y: seat.y + (center.y - seat.y) * t };
}

/** Where the pot's chips sit, just above the board (approximately; flights aim here). */
export function potPosition(center: SeatPosition): SeatPosition {
  return { x: center.x, y: center.y - 9 };
}

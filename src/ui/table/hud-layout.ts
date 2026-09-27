/** Shared HUD geometry in table-area percentages, used by both renderers. */
import type { SeatPosition } from './renderer.ts';

/** Visual slot of a logical seat so that the user's seat lands in slot 0. */
export function visualSlot(seat: number, userSeat: number, count: number): number {
  return (seat - userSeat + count) % count;
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

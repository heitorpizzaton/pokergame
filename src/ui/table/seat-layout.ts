/**
 * Seat positions around the table as percentages of the table area. Visual slot 0 is always
 * the user at the bottom centre (AGENTS.md §5.1); the others follow clockwise, which on screen
 * is bottom → left → top → right. Logical seat order is unaffected.
 */
export interface SeatPosition {
  readonly x: number;
  readonly y: number;
}

/** Half-width (radians) of the gap kept free for the dealer at the top centre. */
const DEALER_GAP: Readonly<Record<'portrait' | 'landscape', number>> = {
  portrait: 0.32,
  landscape: 0.3,
};

function ellipse(orientation: 'portrait' | 'landscape') {
  return {
    rx: orientation === 'portrait' ? 40 : 44,
    ry: orientation === 'portrait' ? 41 : 38,
    cy: orientation === 'portrait' ? 47 : 46,
  };
}

/**
 * Seats around the oval, leaving the top centre to the dealer, who faces the user. The user sits
 * at the bottom centre and the others follow clockwise (bottom → left → top → right), evenly
 * spaced. With an even number of players one spot is left empty beside the dealer, on the right.
 */
export function seatPositions(
  count: number,
  orientation: 'portrait' | 'landscape',
): SeatPosition[] {
  const { rx, ry, cy } = ellipse(orientation);
  const gap = DEALER_GAP[orientation];
  // Arc coordinate: clockwise from the right edge of the dealer's gap to its left edge.
  const arc = 2 * Math.PI - 2 * gap;
  // Heads-up: the opponent sits across the table, just left of the dealer.
  const spots = count === 2 ? 5 : count % 2 === 1 ? count : count + 1;
  const half = Math.floor(count / 2);
  return Array.from({ length: count }, (_, i) => {
    const spot = count === 2 ? i * 2 : i <= half ? i : i + spots - count;
    const s = (arc / 2 + (spot * arc) / spots) % arc;
    const angle = (3 * Math.PI) / 2 + gap + s;
    return { x: 50 + rx * Math.cos(angle), y: cy + ry * Math.sin(angle) };
  });
}

/** The dealer's place: at the top of the oval, just inside the rail, facing the user. */
export function dealerPosition(orientation: 'portrait' | 'landscape'): SeatPosition {
  const { ry, cy } = ellipse(orientation);
  return { x: 50, y: cy - ry * 0.8 };
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

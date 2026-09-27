/**
 * Seat positions around the table as percentages of the table area. Visual slot 0 is always
 * the user at the bottom centre (AGENTS.md §5.1); the others follow clockwise, which on screen
 * is bottom → left → top → right. Logical seat order is unaffected.
 */
import type { SeatPosition, TableLayout } from '../table/renderer.ts';

export type { SeatPosition };

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

/** Centre of the table in the same percentage coordinates as the seats. */
export function tableCenter(orientation: 'portrait' | 'landscape'): SeatPosition {
  return { x: 50, y: orientation === 'portrait' ? 47 : 46 };
}

/** The 2D renderer's layout: fixed positions per table size (AGENTS.md §11.2). */
export function layout2d(count: number, orientation: 'portrait' | 'landscape'): TableLayout {
  return { seats: seatPositions(count, orientation), center: tableCenter(orientation) };
}

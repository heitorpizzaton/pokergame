/** Original vector suit shapes (24×24), drawn for this project. Order: ♣ ♦ ♥ ♠ (suit index). */
const SUIT_PATHS = [
  // Clubs: three lobes and a flared stem.
  'M12 2.6a4.3 4.3 0 0 1 3.5 6.8 4.3 4.3 0 1 1-2.2 6.4l1.1 5.2H9.6l1.1-5.2a4.3 4.3 0 1 1-2.2-6.4A4.3 4.3 0 0 1 12 2.6Z',
  // Diamonds: four gently curved sides.
  'M12 1.8Q15.9 7.1 19.8 12 15.9 16.9 12 22.2 8.1 16.9 4.2 12 8.1 7.1 12 1.8Z',
  // Hearts
  'M12 21.2C5.2 15.8 2.2 12.2 2.2 8.4 2.2 5.4 4.5 3.2 7.2 3.2c2 0 3.8 1.1 4.8 2.9 1-1.8 2.8-2.9 4.8-2.9 2.7 0 5 2.2 5 5.2 0 3.8-3 7.4-9.8 12.8Z',
  // Spades: an inverted heart with a flared stem.
  'M12 2.2c6.8 5.4 9.8 9 9.8 12.4 0 2.6-2.1 4.6-4.6 4.6-1.7 0-3.1-.8-4-2.1l1.1 4.4H9.7l1.1-4.4c-.9 1.3-2.3 2.1-4 2.1-2.5 0-4.6-2-4.6-4.6 0-3.4 3-7 9.8-12.4Z',
] as const;

export function SuitIcon({
  suit,
  className,
}: {
  readonly suit: number;
  readonly className?: string | undefined;
}) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d={SUIT_PATHS[suit] ?? SUIT_PATHS[3]} fill="currentColor" />
    </svg>
  );
}

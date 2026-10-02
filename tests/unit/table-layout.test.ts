import { describe, expect, it } from 'vitest';
import { BLIND_DEPTHS, blindsForDepth, checkSetup, DEFAULT_SETUP } from '../../src/app/setup.ts';
import { dealerPosition, seatPositions } from '../../src/ui/table/seat-layout.ts';

describe('seats around the dealer (AGENTS.md §32.2)', () => {
  for (const orientation of ['portrait', 'landscape'] as const) {
    it(`keeps the user at the bottom and the top centre for the dealer (${orientation})`, () => {
      const dealer = dealerPosition(orientation);
      expect(dealer.x).toBe(50);
      for (let n = 2; n <= 9; n++) {
        const seats = seatPositions(n, orientation);
        expect(seats).toHaveLength(n);
        expect(seats[0]?.x).toBeCloseTo(50);
        expect(Math.max(...seats.map((s) => s.y))).toBeCloseTo(seats[0]?.y ?? 0);
        for (const seat of seats.slice(1)) {
          // Nobody sits in the dealer's spot.
          expect(
            Math.abs(seat.x - 50) > 8 || seat.y > dealer.y + 15,
            `${n}: ${seat.x},${seat.y}`,
          ).toBe(true);
        }
        if (n % 2 === 1) {
          // Odd tables are symmetric: every seat has a mirror image.
          for (const seat of seats) {
            expect(
              seats.some(
                (o) => Math.abs(o.x - (100 - seat.x)) < 1e-9 && Math.abs(o.y - seat.y) < 1e-9,
              ),
            ).toBe(true);
          }
        }
      }
    });
  }

  it('goes clockwise from the user: the next seat is on the left', () => {
    const [user, next] = seatPositions(6, 'portrait');
    expect(next?.x).toBeLessThan(user?.x ?? 0);
  });
});

describe('blind presets by depth (Setup screen)', () => {
  it('gives an even big blind and a small blind of half, close to the target depth', () => {
    for (const stack of [1000, 5000, 10_000, 20_000, 50_000, 1234]) {
      for (const depth of Object.values(BLIND_DEPTHS)) {
        const blinds = blindsForDepth(stack, depth);
        expect(blinds).not.toBeNull();
        if (!blinds) continue;
        expect(blinds.bigBlind % 2).toBe(0);
        expect(blinds.smallBlind * 2).toBe(blinds.bigBlind);
        expect(checkSetup({ ...DEFAULT_SETUP, startingStack: stack, ...blinds }).errors).toEqual(
          [],
        );
        expect(Math.abs(stack / blinds.bigBlind - depth) / depth).toBeLessThan(0.25);
      }
    }
    expect(blindsForDepth(10_000, 100)).toEqual({ smallBlind: 50, bigBlind: 100 });
    expect(blindsForDepth(10, 25)).toBeNull();
    expect(blindsForDepth(Number.NaN, 25)).toBeNull();
  });
});

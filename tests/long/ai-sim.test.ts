import { describe, expect, it } from 'vitest';
import { derived, runSim, type SeatKind } from '../../scripts/sim-core.ts';

/**
 * AI evaluation over large samples (AGENTS.md §8.5, §13.2): style targets for a 6-handed table
 * (docs/AI.md), win rates, and exploit checks.
 */
const TARGETS: Record<string, { vpip: [number, number]; pfr: [number, number] }> = {
  tag: { vpip: [0.2, 0.26], pfr: [0.16, 0.21] },
  lag: { vpip: [0.28, 0.36], pfr: [0.22, 0.3] },
  nit: { vpip: [0.1, 0.15], pfr: [0.08, 0.12] },
  station: { vpip: [0.4, 0.55], pfr: [0.05, 0.1] },
  maniac: { vpip: [0.5, 0.7], pfr: [0.35, 0.55] },
  rec: { vpip: [0.32, 0.45], pfr: [0.06, 0.12] },
};

describe('AI simulation, 100,000 hands, random 6-handed mix', () => {
  it('keeps every style within its VPIP/PFR targets and never acts illegally', () => {
    const result = runSim({
      hands: 100_000,
      players: 6,
      seats: 'random',
      seed: 2026,
      iterations: 200,
    });
    expect(result.illegalActions).toBe(0);
    for (const [style, target] of Object.entries(TARGETS)) {
      const stats = result.byKind[style];
      if (!stats) throw new Error(`no hands for ${style}`);
      const d = derived(stats);
      expect(d.vpip, `${style} VPIP`).toBeGreaterThanOrEqual(target.vpip[0]);
      expect(d.vpip, `${style} VPIP`).toBeLessThanOrEqual(target.vpip[1]);
      expect(d.pfr, `${style} PFR`).toBeGreaterThanOrEqual(target.pfr[0]);
      expect(d.pfr, `${style} PFR`).toBeLessThanOrEqual(target.pfr[1]);
    }
  });
});

function bbPer100(seats: SeatKind[], kind: SeatKind, hands: number, seed: number): number {
  const result = runSim({ hands, players: seats.length, seats, seed, iterations: 200 });
  expect(result.illegalActions).toBe(0);
  const stats = result.byKind[kind];
  if (!stats) throw new Error(`no hands for ${kind}`);
  return derived(stats).bbPer100;
}

describe('win rates and exploit checks (30,000 hands each)', () => {
  it('a TAG beats calling stations and maniacs', () => {
    expect(
      bbPer100(['tag', 'station', 'maniac', 'tag', 'station', 'maniac'], 'tag', 30_000, 7),
    ).toBeGreaterThan(0);
  });

  it('an always-all-in bot loses against a table of regulars', () => {
    expect(
      bbPer100(['allInBot', 'tag', 'tag', 'lag', 'tag', 'nit'], 'allInBot', 30_000, 8),
    ).toBeLessThan(0);
  });

  it('an always-fold-to-any-bet bot loses against a table of regulars', () => {
    expect(
      bbPer100(['foldBot', 'tag', 'tag', 'lag', 'tag', 'nit'], 'foldBot', 30_000, 9),
    ).toBeLessThan(0);
  });
});

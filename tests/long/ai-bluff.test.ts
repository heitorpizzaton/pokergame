import { describe, expect, it } from 'vitest';
import { bluffStats, runSim, type SeatKind } from '../../scripts/sim-core.ts';

/**
 * Bluffing targets (AGENTS.md §18.2, §18.5), measured over 100,000 hands at 6 players with
 * 100 BB stacks and the realistic random mix. Definitions of each rate are in docs/AI.md.
 */
type Range = readonly [number, number];
const TARGETS: Record<
  string,
  { flop: Range; turn: Range; river: Range; riverShare: Range; cbet: Range }
> = {
  tag: {
    flop: [0.2, 0.3],
    turn: [0.15, 0.25],
    river: [0.12, 0.2],
    riverShare: [0.25, 0.35],
    cbet: [0.55, 0.7],
  },
  lag: {
    flop: [0.3, 0.42],
    turn: [0.25, 0.35],
    river: [0.2, 0.3],
    riverShare: [0.35, 0.45],
    cbet: [0.65, 0.8],
  },
  nit: {
    flop: [0.05, 0.12],
    turn: [0.03, 0.08],
    river: [0.02, 0.06],
    riverShare: [0.05, 0.12],
    cbet: [0.4, 0.55],
  },
  station: {
    flop: [0.03, 0.08],
    turn: [0.02, 0.06],
    river: [0.01, 0.05],
    riverShare: [0.03, 0.1],
    cbet: [0.3, 0.45],
  },
  maniac: {
    flop: [0.5, 0.7],
    turn: [0.45, 0.65],
    river: [0.4, 0.6],
    riverShare: [0.5, 0.65],
    cbet: [0.8, 0.95],
  },
  rec: {
    flop: [0.1, 0.2],
    turn: [0.08, 0.15],
    river: [0.08, 0.15],
    riverShare: [0.1, 0.2],
    cbet: [0.4, 0.55],
  },
};

describe('bluffing by style over 100,000 hands (6 players, 100 BB, random mix)', () => {
  it('keeps every style inside its §18.2 ranges', () => {
    const result = runSim({
      hands: 100_000,
      players: 6,
      seats: 'random',
      seed: 2027,
      iterations: 200,
    });
    expect(result.illegalActions).toBe(0);
    for (const [style, t] of Object.entries(TARGETS)) {
      const stats = result.byKind[style];
      if (!stats) throw new Error(`no hands for ${style}`);
      const b = bluffStats(stats);
      const check = (name: string, value: number, [lo, hi]: Range) => {
        expect(value, `${style} ${name}`).toBeGreaterThanOrEqual(lo);
        expect(value, `${style} ${name}`).toBeLessThanOrEqual(hi);
      };
      check('pure-bluff rate, flop', b.pureFlop, t.flop);
      check('pure-bluff rate, turn', b.pureTurn, t.turn);
      check('pure-bluff rate, river', b.pureRiver, t.river);
      check('river bluff share', b.riverBluffShare, t.riverShare);
      check('c-bet', b.cbet, t.cbet);
    }
  });
});

/** Pooled pure-bluff rate over all streets, with its opportunity count. */
function pooled(seats: SeatKind[], kind: SeatKind, seed: number) {
  const result = runSim({ hands: 20_000, players: seats.length, seats, seed, iterations: 150 });
  const s = result.byKind[kind];
  if (!s) throw new Error(`no hands for ${kind}`);
  const bluffs = s.pureBluffs.flop + s.pureBluffs.turn + s.pureBluffs.river;
  const chances = s.pureOpportunities.flop + s.pureOpportunities.turn + s.pureOpportunities.river;
  return { rate: bluffs / Math.max(1, chances), chances };
}

describe('bluffing adapts to fold equity (heads-up against scripted bots, 20,000 hands)', () => {
  it('a TAG bluffs at least 40% less against a calling station than against a folder', () => {
    const station = pooled(['tag', 'callBot'], 'tag', 31);
    const folder = pooled(['tag', 'folderBot'], 'tag', 32);
    expect(station.rate).toBeLessThanOrEqual(folder.rate * 0.6);
  });

  it('a maniac does not bluff significantly less against the station', () => {
    const station = pooled(['maniac', 'callBot'], 'maniac', 33);
    const folder = pooled(['maniac', 'folderBot'], 'maniac', 34);
    // One-sided two-proportion z-test at alpha = 0.01.
    const p =
      (station.rate * station.chances + folder.rate * folder.chances) /
      (station.chances + folder.chances);
    const se = Math.sqrt(p * (1 - p) * (1 / station.chances + 1 / folder.chances));
    expect((folder.rate - station.rate) / se).toBeLessThan(2.326);
  });
});

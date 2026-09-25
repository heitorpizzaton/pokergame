import type { Rng } from '../../core/rng/index.ts';

/** NPC styles (AGENTS.md §8.3). Labels live in i18n. */
export type StyleId = 'tag' | 'lag' | 'nit' | 'station' | 'maniac' | 'rec';

export const STYLE_IDS: readonly StyleId[] = ['tag', 'lag', 'nit', 'station', 'maniac', 'rec'];

/**
 * Style parameters. Preflop ranges are shares of all starting combos for a 6-handed table
 * (scaled by table size and position at runtime); postflop values are frequencies or equity
 * thresholds. Leaks are deliberate: stations over-call, maniacs over-bluff, nits over-fold.
 */
export interface StyleProfile {
  readonly id: StyleId;
  /** Raise-first-in range when folded to (average position). */
  readonly open: number;
  /** Extra range that limps instead of folding when unopened (passive styles). */
  readonly limp: number;
  /** Range that continues (calls) versus a single raise, excluding the 3-bet range. */
  readonly callRaise: number;
  /** Value 3-bet range versus a single raise. */
  readonly threeBet: number;
  /** Share of hands just outside the calling range that 3-bet as a bluff. */
  readonly threeBetBluff: number;
  /** Range that continues versus a 3-bet (4-bets included). */
  readonly callThreeBet: number;
  /** Value 4-bet range. */
  readonly fourBet: number;
  /** Open size in big blinds. */
  readonly openSize: number;
  /** Continuation-bet frequency as the preflop aggressor. */
  readonly cbet: number;
  /** Frequency of betting with nothing when checked to. */
  readonly bluff: number;
  /** Equity needed to bet for value (heads-up; raised for multiway pots). */
  readonly valueEquity: number;
  /** Equity needed to raise a bet for value. */
  readonly raiseEquity: number;
  /** Multiplier on pot odds when deciding to call (< 1 calls lighter). */
  readonly callFactor: number;
  /** Frequency of semi-bluff raises with draws when facing a bet. */
  readonly semiBluffRaise: number;
  /** Preferred bet sizes as pot fractions. */
  readonly sizes: readonly number[];
  /** General randomness in thresholds (a human's inconsistency). */
  readonly noise: number;
  /** How many hands a big loss tilts this player (0 = never). */
  readonly tiltHands: number;
  /** Chance of showing a hand won without a showdown. */
  readonly showOff: number;
}

export const STYLES: Readonly<Record<StyleId, StyleProfile>> = {
  tag: {
    id: 'tag',
    open: 0.245,
    limp: 0,
    callRaise: 0.085,
    threeBet: 0.045,
    threeBetBluff: 0.2,
    callThreeBet: 0.045,
    fourBet: 0.022,
    openSize: 2.5,
    cbet: 0.65,
    bluff: 0.18,
    valueEquity: 0.64,
    raiseEquity: 0.8,
    callFactor: 1.0,
    semiBluffRaise: 0.15,
    sizes: [0.33, 0.5, 0.66, 0.75],
    noise: 0.03,
    tiltHands: 1,
    showOff: 0.03,
  },
  lag: {
    id: 'lag',
    open: 0.33,
    limp: 0,
    callRaise: 0.1,
    threeBet: 0.075,
    threeBetBluff: 0.35,
    callThreeBet: 0.075,
    fourBet: 0.035,
    openSize: 2.5,
    cbet: 0.75,
    bluff: 0.3,
    valueEquity: 0.6,
    raiseEquity: 0.76,
    callFactor: 0.92,
    semiBluffRaise: 0.3,
    sizes: [0.5, 0.66, 0.75, 1.0, 1.25],
    noise: 0.04,
    tiltHands: 3,
    showOff: 0.08,
  },
  nit: {
    id: 'nit',
    open: 0.125,
    limp: 0,
    callRaise: 0.035,
    threeBet: 0.022,
    threeBetBluff: 0.03,
    callThreeBet: 0.025,
    fourBet: 0.013,
    openSize: 3,
    cbet: 0.5,
    bluff: 0.05,
    valueEquity: 0.7,
    raiseEquity: 0.86,
    callFactor: 1.2,
    semiBluffRaise: 0.05,
    sizes: [0.5, 0.66],
    noise: 0.02,
    tiltHands: 1,
    showOff: 0.1,
  },
  station: {
    id: 'station',
    open: 0.08,
    limp: 0.36,
    callRaise: 0.34,
    threeBet: 0.02,
    threeBetBluff: 0.02,
    callThreeBet: 0.1,
    fourBet: 0.012,
    openSize: 3,
    cbet: 0.35,
    bluff: 0.06,
    valueEquity: 0.66,
    raiseEquity: 0.88,
    callFactor: 0.6,
    semiBluffRaise: 0.03,
    sizes: [0.33, 0.5],
    noise: 0.06,
    tiltHands: 4,
    showOff: 0.05,
  },
  maniac: {
    id: 'maniac',
    open: 0.58,
    limp: 0.08,
    callRaise: 0.14,
    threeBet: 0.17,
    threeBetBluff: 0.6,
    callThreeBet: 0.2,
    fourBet: 0.08,
    openSize: 3.5,
    cbet: 0.9,
    bluff: 0.55,
    valueEquity: 0.52,
    raiseEquity: 0.66,
    callFactor: 0.8,
    semiBluffRaise: 0.55,
    sizes: [0.75, 1.0, 1.5],
    noise: 0.08,
    tiltHands: 6,
    showOff: 0.25,
  },
  rec: {
    id: 'rec',
    open: 0.09,
    limp: 0.31,
    callRaise: 0.21,
    threeBet: 0.022,
    threeBetBluff: 0.05,
    callThreeBet: 0.07,
    fourBet: 0.013,
    openSize: 3,
    cbet: 0.45,
    bluff: 0.1,
    valueEquity: 0.68,
    raiseEquity: 0.85,
    callFactor: 0.85,
    semiBluffRaise: 0.08,
    sizes: [0.33, 0.5, 1.0],
    noise: 0.07,
    tiltHands: 5,
    showOff: 0.12,
  },
};

/** Random-mix weights that feel like a real online table (AGENTS.md §8.3). */
const MIX_WEIGHTS: Readonly<Record<StyleId, number>> = {
  tag: 30,
  rec: 28,
  lag: 14,
  station: 13,
  nit: 11,
  maniac: 4,
};

/** Styles for `count` NPCs, drawn from the mix, with at most two maniacs per table. */
export function randomStyles(count: number, rng: Rng): StyleId[] {
  const styles: StyleId[] = [];
  for (let i = 0; i < count; i++) {
    const maniacs = styles.filter((s) => s === 'maniac').length;
    const pool = STYLE_IDS.filter((s) => s !== 'maniac' || maniacs < 2);
    const total = pool.reduce((sum, s) => sum + MIX_WEIGHTS[s], 0);
    let pick = rng.int(total);
    for (const s of pool) {
      if (pick < MIX_WEIGHTS[s]) {
        styles.push(s);
        break;
      }
      pick -= MIX_WEIGHTS[s];
    }
  }
  return styles;
}

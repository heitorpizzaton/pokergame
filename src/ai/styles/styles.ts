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
  /** Equity needed to bet for value (heads-up; raised for multiway pots). */
  readonly valueEquity: number;
  /** Equity needed to raise a bet for value. */
  readonly raiseEquity: number;
  /** How often a hand above `raiseEquity` actually raises a bet (the rest call). */
  readonly valueRaise: number;
  /** Multiplier on pot odds when deciding to call (< 1 calls lighter). */
  readonly callFactor: number;
  /** Preferred bet sizes as pot fractions. */
  readonly sizes: readonly number[];
  /** General randomness in thresholds (a human's inconsistency). */
  readonly noise: number;
  /** How many hands a big loss tilts this player (0 = never). */
  readonly tiltHands: number;
  /** Chance of showing a hand won without a showdown. */
  readonly showOff: number;
  /** Bluffing sub-model (AGENTS.md §18). */
  readonly bluffing: BluffingProfile;
}

/** Street-by-street base rates; the flop, turn and river keys match `Street`. */
export interface StreetRates {
  readonly flop: number;
  readonly turn: number;
  readonly river: number;
}

/**
 * Bluffing parameters (AGENTS.md §18.2–18.3). Bases are multiplied by the situation modifiers in
 * `postflop/bluff.ts`; the resulting long-run rates are measured by the simulator.
 */
export interface BluffingProfile {
  /** Base rate of betting a pure bluff at a bluff opportunity. */
  readonly pure: StreetRates;
  /** Base rate of betting a semi-bluff (a real draw or 30–55% equity vs. callers). */
  readonly semi: StreetRates;
  /** Base rate of continuation-betting a non-value hand. */
  readonly cbet: number;
  /** Base rate of raising a bet as a bluff (×1.6 with a semi-bluff). */
  readonly raise: number;
  /** Exponent on fold equity: 1 adapts fully, 0 ignores it (the maniac, on purpose). */
  readonly foldSensitivity: number;
  /** Multiplier when the hand has showdown value (good players check-call instead). */
  readonly showdownRespect: number;
  /** Multiplier for a few hands after a bluff was shown down and lost. */
  readonly failedBluffDamping: number;
  /** Multiplier while tilted (1.3–1.8, less for strong styles). */
  readonly tilt: number;
  /** Bluff sizes: the same as value bets (balanced), or a smaller / larger leak. */
  readonly sizing: 'balanced' | 'small' | 'large';
  /** Chance of checking a value hand when checked to (passive players check-call instead). */
  readonly passiveValue: number;
  /** Chance of slow-playing a value hand on a dry board. */
  readonly slowPlay: number;
  /**
   * Chance of betting a river hand with 30–55% equity vs. callers as thin value (the
   * recreational player's "sometimes spews"). Not a bluff, so the bluff modifiers do not apply.
   */
  readonly thinValue: number;
  /**
   * Leak (§18.4): chance of calling off a big bet to keep a failed bluff going when the
   * numbers say fold. Zero for every style except the maniac and the calling station.
   */
  readonly callOffLeak: number;
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
    valueEquity: 0.64,
    raiseEquity: 0.8,
    valueRaise: 0.75,
    callFactor: 1.0,
    sizes: [0.33, 0.5, 0.66, 0.75],
    noise: 0.03,
    tiltHands: 1,
    showOff: 0.03,
    bluffing: {
      pure: { flop: 0.59, turn: 0.41, river: 0.32 },
      semi: { flop: 0.55, turn: 0.45, river: 0.45 },
      cbet: 0.8,
      raise: 0.1,
      foldSensitivity: 1,
      showdownRespect: 0.5,
      failedBluffDamping: 0.6,
      tilt: 1.3,
      sizing: 'balanced',
      passiveValue: 0,
      slowPlay: 0.15,
      thinValue: 0,
      callOffLeak: 0,
    },
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
    valueEquity: 0.6,
    raiseEquity: 0.68,
    valueRaise: 0.75,
    callFactor: 0.92,
    sizes: [0.5, 0.66, 0.75, 1.0, 1.25],
    noise: 0.04,
    tiltHands: 3,
    showOff: 0.08,
    bluffing: {
      pure: { flop: 0.64, turn: 0.54, river: 0.42 },
      semi: { flop: 0.7, turn: 0.6, river: 0.9 },
      cbet: 0.85,
      raise: 0.2,
      foldSensitivity: 0.8,
      showdownRespect: 0.65,
      failedBluffDamping: 0.75,
      tilt: 1.5,
      sizing: 'balanced',
      passiveValue: 0,
      slowPlay: 0.15,
      thinValue: 0.6,
      callOffLeak: 0,
    },
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
    valueEquity: 0.7,
    raiseEquity: 0.86,
    valueRaise: 0.75,
    callFactor: 1.2,
    sizes: [0.5, 0.66],
    noise: 0.02,
    tiltHands: 1,
    showOff: 0.1,
    bluffing: {
      pure: { flop: 0.155, turn: 0.165, river: 0.08 },
      semi: { flop: 0.25, turn: 0.18, river: 0.25 },
      cbet: 0.37,
      raise: 0.02,
      foldSensitivity: 0.8,
      showdownRespect: 0.4,
      failedBluffDamping: 0.5,
      tilt: 1.3,
      sizing: 'balanced',
      passiveValue: 0,
      slowPlay: 0.15,
      thinValue: 0,
      callOffLeak: 0,
    },
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
    valueEquity: 0.66,
    raiseEquity: 0.88,
    valueRaise: 0.75,
    callFactor: 0.6,
    sizes: [0.33, 0.5],
    noise: 0.06,
    tiltHands: 4,
    showOff: 0.05,
    bluffing: {
      pure: { flop: 0.085, turn: 0.064, river: 0.03 },
      semi: { flop: 0.15, turn: 0.1, river: 0.1 },
      cbet: 0.1,
      raise: 0.01,
      foldSensitivity: 0.2,
      showdownRespect: 0.9,
      failedBluffDamping: 0.95,
      tilt: 1.6,
      sizing: 'small',
      passiveValue: 0.18,
      slowPlay: 0.15,
      thinValue: 0,
      callOffLeak: 0.15,
    },
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
    valueEquity: 0.52,
    raiseEquity: 0.66,
    valueRaise: 0.75,
    callFactor: 0.8,
    sizes: [0.75, 1.0, 1.5],
    noise: 0.08,
    tiltHands: 6,
    showOff: 0.25,
    bluffing: {
      pure: { flop: 0.475, turn: 0.52, river: 0.4 },
      semi: { flop: 0.85, turn: 0.8, river: 0.45 },
      cbet: 0.7,
      raise: 0.4,
      foldSensitivity: 0,
      showdownRespect: 1,
      failedBluffDamping: 1,
      tilt: 1.8,
      sizing: 'large',
      passiveValue: 0,
      slowPlay: 0.15,
      thinValue: 0,
      callOffLeak: 0.1,
    },
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
    valueEquity: 0.68,
    raiseEquity: 0.35,
    valueRaise: 0.95,
    callFactor: 1.15,
    sizes: [0.33, 0.5, 1.0],
    noise: 0.07,
    tiltHands: 5,
    showOff: 0.12,
    bluffing: {
      pure: { flop: 0.34, turn: 0.23, river: 0.185 },
      semi: { flop: 0.3, turn: 0.22, river: 0.9 },
      cbet: 0.22,
      raise: 0.03,
      foldSensitivity: 0.3,
      showdownRespect: 0.8,
      failedBluffDamping: 0.9,
      tilt: 1.6,
      sizing: 'small',
      passiveValue: 0,
      slowPlay: 0.03,
      thinValue: 0.95,
      callOffLeak: 0,
    },
  },
};

/** Random-mix weights that feel like a real online table (AGENTS.md §8.3). */
/** Strength of the random mix (AGENTS.md §31.3.2). */
export type OpponentLevel = 'beginner' | 'normal' | 'hard';
export const OPPONENT_LEVELS: readonly OpponentLevel[] = ['beginner', 'normal', 'hard'];

/**
 * Mix weights per level. "normal" is the realistic online table of §8.3. "beginner" has more
 * recreational players and calling stations; "hard" is mostly regulars and aggressive players.
 */
const MIX_WEIGHTS: Readonly<Record<OpponentLevel, Readonly<Record<StyleId, number>>>> = {
  beginner: { tag: 10, rec: 36, lag: 6, station: 30, nit: 13, maniac: 5 },
  normal: { tag: 30, rec: 28, lag: 14, station: 13, nit: 11, maniac: 4 },
  hard: { tag: 42, rec: 8, lag: 30, station: 4, nit: 12, maniac: 4 },
};
const MAX_MANIACS: Readonly<Record<OpponentLevel, number>> = { beginner: 2, normal: 2, hard: 1 };

/** Styles for `count` NPCs, drawn from the level's mix, with a cap on maniacs per table. */
export function randomStyles(count: number, rng: Rng, level: OpponentLevel = 'normal'): StyleId[] {
  const weights = MIX_WEIGHTS[level];
  const styles: StyleId[] = [];
  for (let i = 0; i < count; i++) {
    const maniacs = styles.filter((s) => s === 'maniac').length;
    const pool = STYLE_IDS.filter((s) => s !== 'maniac' || maniacs < MAX_MANIACS[level]);
    const total = pool.reduce((sum, s) => sum + weights[s], 0);
    let pick = rng.int(total);
    for (const s of pool) {
      if (pick < weights[s]) {
        styles.push(s);
        break;
      }
      pick -= weights[s];
    }
  }
  return styles;
}

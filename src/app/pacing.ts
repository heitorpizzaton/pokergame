/**
 * Table pacing (AGENTS.md §31.1.3): how long dealing, streets, showdowns and results take at each
 * speed. The controller waits for these times and the UI schedules its animations with the same
 * numbers, so the two never drift apart. `instant` (tests, "watch to the end") has no pauses.
 */
export type Speed = 'normal' | 'fast' | 'instant';

export interface Pacing {
  /** Gap between two hole cards of the deal. */
  readonly dealStaggerMs: number;
  /** Flight of one hole card from the dealer to its seat. */
  readonly dealFlightMs: number;
  /** The burn card is shown before each street's cards turn. */
  readonly burnMs: number;
  /** Gap between the three flop cards turning. */
  readonly flopStaggerMs: number;
  /** One board card turning over. */
  readonly flipMs: number;
  /** Breath after a street is dealt, before the next player acts. */
  readonly streetPauseMs: number;
  /** Between streets of an all-in runout (on top of the street's own reveal). */
  readonly runoutPauseMs: number;
  /** Between two hands turning face up at showdown. */
  readonly showdownStepMs: number;
  /** How long a hand's result stays before the next hand (tap to skip). */
  readonly resultMs: number;
  /** NPC thinking time range (AGENTS.md §8.4). */
  readonly thinkingMs: readonly [number, number];
  /** Auto-action delay while the user is away. */
  readonly awayActionMs: number;
}

export const PACING: Record<Speed, Pacing> = {
  normal: {
    dealStaggerMs: 150,
    dealFlightMs: 360,
    burnMs: 300,
    flopStaggerMs: 250,
    flipMs: 450,
    streetPauseMs: 600,
    runoutPauseMs: 900,
    showdownStepMs: 450,
    resultMs: 2600,
    thinkingMs: [350, 1200],
    awayActionMs: 500,
  },
  fast: {
    dealStaggerMs: 60,
    dealFlightMs: 200,
    burnMs: 120,
    flopStaggerMs: 110,
    flipMs: 250,
    streetPauseMs: 250,
    runoutPauseMs: 400,
    showdownStepMs: 200,
    resultMs: 1400,
    thinkingMs: [120, 400],
    awayActionMs: 250,
  },
  instant: {
    dealStaggerMs: 0,
    dealFlightMs: 0,
    burnMs: 0,
    flopStaggerMs: 0,
    flipMs: 0,
    streetPauseMs: 0,
    runoutPauseMs: 0,
    showdownStepMs: 0,
    resultMs: 0,
    thinkingMs: [0, 0],
    awayActionMs: 0,
  },
};

/** Time until the whole deal of `cards` hole cards has landed. */
export function dealDurationMs(pacing: Pacing, cards: number): number {
  if (cards === 0 || pacing.dealFlightMs === 0) return 0;
  return pacing.dealStaggerMs * (cards - 1) + pacing.dealFlightMs;
}

/**
 * When board card `index` (0–4) starts turning, measured from the moment its street appears:
 * after the burn, the flop's cards follow each other; the turn and river are single cards.
 */
export function flipDelayMs(pacing: Pacing, index: number): number {
  return pacing.burnMs + (index < 3 ? index * pacing.flopStaggerMs : 0);
}

/** Time for a street of `cards` new board cards to be fully revealed (burn + flips). */
export function streetRevealMs(pacing: Pacing, cards: number): number {
  if (cards === 0 || pacing.flipMs === 0) return 0;
  return pacing.burnMs + (cards - 1) * pacing.flopStaggerMs + pacing.flipMs;
}

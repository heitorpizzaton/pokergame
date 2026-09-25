import { type Card, orderedDeck, parseCards } from '../../src/core/cards/index.ts';
import { type EngineEvent, type GameState, PokerEngine } from '../../src/core/engine/index.ts';
import type { Rng } from '../../src/core/rng/index.ts';
import type { PlayerAction } from '../../src/core/view/index.ts';

/** An Rng that returns a fixed script of `int` results (validated against each bound). */
export class ScriptedRng implements Rng {
  #values: number[];

  constructor(values: number[] = []) {
    this.#values = [...values];
  }

  push(...values: number[]): void {
    this.#values.push(...values);
  }

  nextUint32(): number {
    throw new Error('ScriptedRng only scripts int()');
  }

  int(maxExclusive: number): number {
    const value = this.#values.shift();
    if (value === undefined) throw new Error('ScriptedRng script exhausted');
    if (value < 0 || value >= maxExclusive) {
      throw new Error(`Scripted value ${value} out of range [0, ${maxExclusive})`);
    }
    return value;
  }
}

/** The `int` results that make the engine's Fisher-Yates shuffle produce exactly `target`. */
export function shuffleScript(target: readonly Card[]): number[] {
  const deck = orderedDeck();
  const script: number[] = [];
  for (let i = deck.length - 1; i > 0; i--) {
    const j = deck.indexOf(target[i] as Card);
    if (j < 0 || j > i) throw new Error('Target is not a permutation of the deck');
    script.push(j);
    const tmp = deck[i] as Card;
    deck[i] = deck[j] as Card;
    deck[j] = tmp;
  }
  return script;
}

export interface DeckSpec {
  /** Seats in dealing order (starting left of the button). */
  readonly dealOrder: readonly number[];
  /** Hole cards per seat, e.g. `{ 0: 'AsKs' }`. Missing seats get unused cards. */
  readonly holes?: Readonly<Record<number, string>>;
  /** Up to five board cards, e.g. `'AhKhQh2c3d'`. Missing cards are filled. */
  readonly board?: string;
}

/** Builds a full deck that deals the requested hole cards and board (burns are filled). */
export function buildDeck(spec: DeckSpec): Card[] {
  const m = spec.dealOrder.length;
  const deck: (Card | undefined)[] = new Array<Card | undefined>(52).fill(undefined);
  const used = new Set<Card>();
  const place = (position: number, card: Card): void => {
    if (used.has(card)) throw new Error(`Card used twice: ${card}`);
    used.add(card);
    deck[position] = card;
  };
  spec.dealOrder.forEach((seat, k) => {
    const text = spec.holes?.[seat];
    if (!text) return;
    const [a, b] = parseCards(text);
    place(k, a as Card);
    place(m + k, b as Card);
  });
  const boardPositions = [2 * m + 1, 2 * m + 2, 2 * m + 3, 2 * m + 5, 2 * m + 7];
  parseCards(spec.board ?? '').forEach((card, i) => {
    place(boardPositions[i] as number, card);
  });
  const rest = orderedDeck().filter((c) => !used.has(c));
  for (let i = 0; i < 52; i++) deck[i] ??= rest.shift();
  return deck as Card[];
}

export interface TableSpec {
  readonly stacks: readonly number[];
  readonly smallBlind?: number;
  readonly bigBlind?: number;
  /** Button for the first hand. */
  readonly button: number;
  readonly holes?: Readonly<Record<number, string>>;
  readonly board?: string;
  readonly autoMuck?: boolean;
  /** Big blind of the previous hand (heads-up transition tests). */
  readonly lastBigBlind?: number | null;
}

/**
 * A table restored from a crafted snapshot, so seats can have different stacks, with a deck
 * rigged to deal `holes` and `board`. Stacks must sum to a multiple of the player count.
 */
export function riggedTable(spec: TableSpec): { engine: PokerEngine; rng: ScriptedRng } {
  const n = spec.stacks.length;
  const total = spec.stacks.reduce((a, b) => a + b, 0);
  if (total % n !== 0) throw new Error('Stacks must sum to a multiple of the player count');
  const smallBlind = spec.smallBlind ?? 50;
  const bigBlind = spec.bigBlind ?? 100;
  const active = spec.stacks
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => s > 0)
    .map(({ i }) => i);
  const previous = [...active].reverse().find((s) => s < spec.button) ?? active.at(-1) ?? 0;
  const snapshot: GameState = {
    config: {
      players: spec.stacks.map((_, i) => ({ name: `P${i}`, autoMuck: spec.autoMuck ?? true })),
      startingStack: total / n,
      smallBlind,
      bigBlind,
    },
    seats: spec.stacks.map((stack, i) => ({
      name: `P${i}`,
      stack,
      autoMuck: spec.autoMuck ?? true,
      eliminated: stack === 0,
      place: stack === 0 ? n - i : null,
    })),
    handNumber: 0,
    button: previous,
    lastBigBlind: spec.lastBigBlind ?? null,
    hand: null,
    shownHands: [],
    finished: false,
  };
  const rng = new ScriptedRng();
  const engine = PokerEngine.restore(snapshot, rng);
  const dealOrder = seatsLeftOf(spec.button, active, n);
  rng.push(
    ...shuffleScript(buildDeck({ dealOrder, holes: spec.holes ?? {}, board: spec.board ?? '' })),
  );
  return { engine, rng };
}

/** Active seats clockwise starting left of `button`, ending with the button. */
export function seatsLeftOf(button: number, active: readonly number[], n: number): number[] {
  const order: number[] = [];
  for (let i = 1; i <= n; i++) {
    const seat = (button + i) % n;
    if (active.includes(seat)) order.push(seat);
  }
  return order;
}

/** Plays a sequence of `[seat, action]` pairs and returns every event produced. */
export function play(
  engine: PokerEngine,
  steps: readonly (readonly [number, PlayerAction])[],
): EngineEvent[] {
  const events: EngineEvent[] = [];
  for (const [seat, action] of steps) {
    events.push(...engine.dispatch({ type: 'act', seat, action }));
  }
  return events;
}

export const fold = { type: 'fold' } as const;
export const check = { type: 'check' } as const;
export const call = { type: 'call' } as const;
export const allIn = { type: 'allIn' } as const;
export const bet = (to: number) => ({ type: 'bet', to }) as const;
export const raise = (to: number) => ({ type: 'raise', to }) as const;

export function stacks(engine: PokerEngine): number[] {
  return engine.state.seats.map((s) => s.stack);
}

export function totalChips(engine: PokerEngine): number {
  const hand = engine.state.hand;
  const inPlay =
    hand?.phase === 'betting'
      ? hand.players.reduce((sum, p) => sum + (p?.committedTotal ?? 0), 0)
      : 0;
  return engine.state.seats.reduce((sum, s) => sum + s.stack, 0) + inPlay;
}

export function eventsOfType<T extends EngineEvent['type']>(
  events: readonly EngineEvent[],
  type: T,
): Extract<EngineEvent, { type: T }>[] {
  return events.filter((e): e is Extract<EngineEvent, { type: T }> => e.type === type);
}

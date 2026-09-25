import { STYLES, type StyleId } from '../ai/index.ts';
import { decideSimple } from '../ai/simple/simple-npc.ts';
import {
  EngineError,
  type EngineEvent,
  type GameConfig,
  PokerEngine,
  redactEvent,
} from '../core/engine/index.ts';
import type { HandValue } from '../core/eval/index.ts';
import type { Rng } from '../core/rng/index.ts';
import type { ActionRecord, PlayerAction, PlayerView } from '../core/view/index.ts';
import type { NpcDriver } from './npc-driver.ts';
import { type SessionStats, SessionStatsTracker } from './session-stats.ts';

export type Speed = 'normal' | 'fast' | 'instant';
export type PreAction = 'checkFold' | 'callAny' | 'check';

export type TablePhase =
  'npcTurn' | 'userTurn' | 'runout' | 'handResult' | 'userOut' | 'watching' | 'gameOver';

export interface Scheduler {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
  now(): number;
}

export const browserScheduler: Scheduler = {
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimeout: (handle) => {
    globalThis.clearTimeout(handle as number);
  },
  now: () => Date.now(),
};

export interface HandResult {
  readonly winners: readonly {
    readonly seat: number;
    readonly amount: number;
    readonly hand: HandValue | null;
  }[];
  readonly showdown: boolean;
}

export interface TableSnapshot {
  readonly version: number;
  readonly phase: TablePhase;
  readonly userSeat: number;
  readonly view: PlayerView;
  /** Board cards to display: less than the view's board while an all-in runout is revealed. */
  readonly boardShown: number;
  /** Last action of each seat on the current street (for the seat's action chip). */
  readonly lastActions: Readonly<Record<number, ActionRecord>>;
  readonly result: HandResult | null;
  readonly stats: SessionStats;
  readonly paused: boolean;
  readonly speed: Speed;
  readonly preAction: PreAction | null;
  /** The user's finishing place once eliminated or once the game is over. */
  readonly userPlace: number | null;
  readonly playerCount: number;
  readonly winnerSeat: number | null;
  readonly endedAt: number | null;
}

export interface ControllerOptions {
  readonly config: GameConfig;
  /** Shuffles the deck (engine stream). */
  readonly deckRng: Rng;
  /** NPC decisions and timing (separate stream, AGENTS.md §6). */
  readonly npcRng: Rng;
  readonly scheduler?: Scheduler;
  readonly speed?: Speed;
  readonly userSeat?: number;
  /** NPC decisions; defaults to the simple rule-based heuristic. */
  readonly driver?: NpcDriver;
  /** Style of each seat (null for the user), for style-dependent behaviour like showing. */
  readonly styles?: readonly (StyleId | null)[];
}

const THINKING_MS: Record<Speed, readonly [number, number]> = {
  normal: [350, 1200],
  fast: [120, 400],
  instant: [0, 0],
};
const RUNOUT_STREET_MS: Record<Speed, number> = { normal: 1100, fast: 500, instant: 0 };
const RESULT_MS: Record<Speed, number> = { normal: 2600, fast: 1400, instant: 0 };
/** AGENTS.md §8.4: NPC thinking time is never above 1.5 s. */
const MAX_THINKING_MS = 1500;

/**
 * Drives a game for the UI: deals hands, runs NPC turns with human-like thinking time, paces
 * all-in runouts, applies pre-actions, and tracks session stats. It holds no poker rules of its
 * own (those live in the engine) and exposes an immutable snapshot for React
 * (`useSyncExternalStore`).
 */
export class GameController {
  readonly #engine: PokerEngine;
  readonly #npcRng: Rng;
  readonly #driver: NpcDriver;
  readonly #styles: readonly (StyleId | null)[];
  #decisionToken = 0;
  readonly #scheduler: Scheduler;
  readonly #userSeat: number;
  readonly #stats: SessionStatsTracker;
  readonly #listeners = new Set<() => void>();
  #speed: Speed;
  #paused = false;
  #suspended = false;
  #started = false;
  #timer: unknown = null;
  #phase: TablePhase = 'npcTurn';
  #boardShown = 0;
  #lastActions: Record<number, ActionRecord> = {};
  #result: HandResult | null = null;
  #preAction: { kind: PreAction; street: string | null } | null = null;
  #watching = false;
  #endedAt: number | null = null;
  #snapshot: TableSnapshot;
  #version = 0;

  constructor(options: ControllerOptions) {
    this.#engine = PokerEngine.create(options.config, options.deckRng);
    this.#npcRng = options.npcRng;
    this.#driver = options.driver ?? {
      decide: (_seat, view) => decideSimple(view, options.npcRng),
      observeHandEnd: () => undefined,
      dispose: () => undefined,
    };
    this.#styles = options.styles ?? [];
    this.#scheduler = options.scheduler ?? browserScheduler;
    this.#speed = options.speed ?? 'normal';
    this.#userSeat = options.userSeat ?? 0;
    this.#stats = new SessionStatsTracker(this.#userSeat, this.#scheduler.now());
    this.#snapshot = this.#buildSnapshot();
  }

  // ---- React bindings -----------------------------------------------------------------

  readonly subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  readonly getSnapshot = (): TableSnapshot => this.#snapshot;

  // ---- Commands -----------------------------------------------------------------------

  /** Starts the game, or resumes driving it after {@link suspend}. Idempotent. */
  start(): void {
    this.#suspended = false;
    if (this.#started) {
      this.#continue();
      return;
    }
    this.#started = true;
    this.#startHand();
  }

  /** The user's action. Returns false (and changes nothing) if the engine rejects it. */
  act(action: PlayerAction): boolean {
    if (this.#phase !== 'userTurn') return false;
    try {
      this.#dispatchAct(this.#userSeat, action);
    } catch (error) {
      if (error instanceof EngineError) return false;
      throw error;
    }
    this.#preAction = null;
    this.#continue();
    return true;
  }

  setPreAction(kind: PreAction | null): void {
    this.#preAction = kind ? { kind, street: this.#engine.state.hand?.street ?? null } : null;
    this.#publish();
  }

  pause(): void {
    this.#paused = true;
    this.#decisionToken++;
    this.#clearTimer();
    this.#publish();
  }

  resume(): void {
    if (!this.#paused) return;
    this.#paused = false;
    this.#publish();
    this.#continue();
  }

  setSpeed(speed: Speed): void {
    this.#speed = speed;
    this.#publish();
  }

  /** Skips the wait after a hand or during a runout ("toque para continuar"). */
  skipWait(): void {
    if (this.#phase !== 'handResult' && this.#phase !== 'runout') return;
    this.#clearTimer();
    if (this.#phase === 'runout') {
      this.#boardShown = this.#engine.state.hand?.board.length ?? this.#boardShown;
      this.#showResult();
    } else {
      this.#afterResult();
    }
  }

  /** After the user busts: let the NPCs finish the game at turbo speed (AGENTS.md §5.8). */
  watchToEnd(): void {
    if (this.#phase !== 'userOut') return;
    this.#watching = true;
    this.#speed = 'instant';
    this.#phase = 'watching';
    this.#publish();
    this.#continue();
  }

  /** While watching: finish the game immediately. */
  skipToEnd(): void {
    if (!this.#watching) return;
    this.#clearTimer();
    while (!this.#engine.isFinished) {
      if (!this.#engine.isHandInProgress) {
        this.#record(this.#engine.dispatch({ type: 'startHand' }));
        continue;
      }
      const seat = this.#engine.state.hand?.toAct;
      if (seat === null || seat === undefined) break;
      this.#dispatchAct(seat, decideSimple(this.#engine.viewFor(seat), this.#npcRng));
    }
    this.#finishGame();
  }

  /** Stops scheduling (when the table unmounts); {@link start} picks up where it left off. */
  suspend(): void {
    this.#suspended = true;
    this.#decisionToken++;
    this.#clearTimer();
  }

  // ---- Flow ---------------------------------------------------------------------------

  #startHand(): void {
    if (this.#engine.isFinished) {
      this.#finishGame();
      return;
    }
    this.#lastActions = {};
    this.#result = null;
    this.#preAction = null;
    this.#boardShown = 0;
    this.#absorb(this.#engine.dispatch({ type: 'startHand' }), 0, null);
    this.#continue();
  }

  /** Decides what happens next from the engine state. */
  #continue(): void {
    if (this.#suspended || this.#paused) {
      this.#publish();
      return;
    }
    this.#clearTimer();
    const hand = this.#engine.state.hand;
    if (!hand) return;

    if (hand.phase === 'complete') {
      const revealed = this.#boardShown < hand.board.length;
      if (revealed && this.#phase === 'runout') {
        this.#timer = this.#scheduler.setTimeout(() => {
          this.#boardShown = Math.min(hand.board.length, this.#nextBoardStep());
          if (this.#boardShown < hand.board.length) this.#continue();
          else this.#showResult();
        }, RUNOUT_STREET_MS[this.#speed]);
        this.#publish();
        return;
      }
      this.#boardShown = hand.board.length;
      this.#showResult();
      return;
    }

    this.#boardShown = hand.board.length;
    const seat = hand.toAct;
    if (seat === null) return;
    if (seat === this.#userSeat) {
      this.#phase = 'userTurn';
      const pre = this.#consumePreAction();
      if (pre) {
        this.#dispatchAct(seat, pre);
        this.#continue();
        return;
      }
      this.#publish();
      return;
    }

    this.#phase = this.#watching ? 'watching' : 'npcTurn';
    this.#publish();
    this.#runNpcTurn(seat);
  }

  /**
   * Asks the driver for a decision and plays it after a human-like thinking delay. If the
   * decision is not ready within the hard cap, a cheap heuristic decides instead (AGENTS.md
   * §8.4) and the late answer is ignored.
   */
  #runNpcTurn(seat: number): void {
    const view = this.#engine.viewFor(seat);
    const token = ++this.#decisionToken;
    const started = this.#scheduler.now();
    let decided: PlayerAction | null = null;
    let waiting = false;
    const finish = (): void => {
      if (token !== this.#decisionToken) return;
      this.#decisionToken++;
      this.#timer = null;
      if (this.#suspended || this.#paused) return;
      const action = decided ?? decideSimple(this.#engine.viewFor(seat), this.#npcRng);
      this.#dispatchAct(seat, action);
      this.#continue();
    };
    const answer = this.#driver.decide(seat, view);
    if (answer instanceof Promise) {
      answer.then(
        (action) => {
          if (token !== this.#decisionToken) return;
          decided = action;
          if (waiting) {
            this.#clearTimer();
            finish();
          }
        },
        () => undefined,
      );
    } else {
      decided = answer;
    }
    this.#timer = this.#scheduler.setTimeout(() => {
      if (decided) {
        finish();
        return;
      }
      waiting = true;
      const remaining = Math.max(0, MAX_THINKING_MS - (this.#scheduler.now() - started));
      this.#timer = this.#scheduler.setTimeout(finish, remaining);
    }, this.#thinkingMs(view));
  }

  #showResult(): void {
    this.#phase = this.#watching ? 'watching' : 'handResult';
    this.#publish();
    const delay = RESULT_MS[this.#speed];
    this.#timer = this.#scheduler.setTimeout(() => {
      this.#timer = null;
      this.#afterResult();
    }, delay);
  }

  #afterResult(): void {
    if (this.#suspended || this.#paused) return;
    const user = this.#engine.state.seats[this.#userSeat];
    if (this.#engine.isFinished) {
      this.#finishGame();
      return;
    }
    if (user?.eliminated && !this.#watching) {
      this.#phase = 'userOut';
      this.#endedAt ??= this.#scheduler.now();
      this.#publish();
      return;
    }
    this.#startHand();
  }

  #finishGame(): void {
    this.#endedAt ??= this.#scheduler.now();
    this.#boardShown = this.#engine.state.hand?.board.length ?? 0;
    const user = this.#engine.state.seats[this.#userSeat];
    this.#phase = user?.eliminated && !this.#watching ? 'userOut' : 'gameOver';
    this.#publish();
  }

  #dispatchAct(seat: number, action: PlayerAction): void {
    const boardBefore = this.#engine.state.hand?.board.length ?? 0;
    const streetBefore = this.#engine.state.hand?.street ?? null;
    this.#absorb(this.#engine.dispatch({ type: 'act', seat, action }), boardBefore, streetBefore);
  }

  /** Common bookkeeping after any engine command: stats, action chips, runout, result. */
  #absorb(events: readonly EngineEvent[], boardBefore: number, streetBefore: string | null): void {
    this.#record(events);
    const hand = this.#engine.state.hand;
    if (!hand) return;
    if (hand.street !== streetBefore) this.#lastActions = {};
    if (events.some((e) => e.type === 'HandsRevealed')) {
      // All-in: reveal the remaining streets one at a time.
      this.#phase = 'runout';
      this.#boardShown = boardBefore;
    }
    if (hand.phase === 'complete') {
      this.#result = resultFrom(events);
      this.#afterHandComplete();
    }
  }

  /** NPCs learn from the hand; a winner without showdown may show, depending on style. */
  #afterHandComplete(): void {
    const hand = this.#engine.state.hand;
    if (!hand) return;
    const npcSeats = hand.players
      .filter((p) => p !== null && p.seat !== this.#userSeat)
      .map((p) => (p as { seat: number }).seat);
    this.#driver.observeHandEnd(npcSeats.map((seat) => this.#engine.viewFor(seat)));
    const winners = this.#result?.winners ?? [];
    const winner = winners[0];
    if (this.#result?.showdown || winners.length !== 1 || !winner || winner.seat === this.#userSeat)
      return;
    const style = this.#styles[winner.seat];
    if (!style) return;
    if (this.#npcRng.int(1000) < STYLES[style].showOff * 1000) {
      this.#record(this.#engine.dispatch({ type: 'reveal', seat: winner.seat }));
    }
  }

  #record(events: readonly EngineEvent[]): void {
    const redacted = events.map((e) => redactEvent(e, this.#userSeat));
    for (const e of redacted) {
      if (e.type === 'ActionTaken') this.#lastActions[e.action.seat] = e.action;
      if (e.type === 'StreetDealt') this.#lastActions = {};
    }
    const view = this.#engine.viewFor(this.#userSeat);
    this.#stats.record(redacted, view.holeCards, view.board);
  }

  #consumePreAction(): PlayerAction | null {
    const pre = this.#preAction;
    const legal = this.#engine.legalActions(this.#userSeat);
    if (!pre || !legal) return null;
    this.#preAction = null;
    if (pre.street !== this.#engine.state.hand?.street) return null; // situation changed
    switch (pre.kind) {
      case 'checkFold':
        return legal.canCheck ? { type: 'check' } : { type: 'fold' };
      case 'callAny':
        return legal.canCheck ? { type: 'check' } : { type: 'call' };
      case 'check':
        return legal.canCheck ? { type: 'check' } : null;
    }
  }

  #nextBoardStep(): number {
    return this.#boardShown < 3 ? 3 : this.#boardShown + 1;
  }

  #thinkingMs(view: PlayerView): number {
    const [min, max] = THINKING_MS[this.#speed];
    if (max === 0) return 0;
    const streetWeight = { preflop: 0.1, flop: 0.35, turn: 0.55, river: 0.75 }[
      view.street ?? 'preflop'
    ];
    const facing = view.legal && !view.legal.canCheck ? 0.2 : 0;
    const jitter = (this.#npcRng.int(1000) / 1000) * 0.25;
    const difficulty = Math.min(1, streetWeight + facing + jitter);
    return Math.min(MAX_THINKING_MS, Math.round(min + (max - min) * difficulty));
  }

  #clearTimer(): void {
    if (this.#timer !== null) this.#scheduler.clearTimeout(this.#timer);
    this.#timer = null;
  }

  #buildSnapshot(): TableSnapshot {
    const state = this.#engine.state;
    const winner = state.seats.findIndex((s) => s.place === 1);
    return {
      version: this.#version,
      phase: this.#phase,
      userSeat: this.#userSeat,
      view: this.#engine.viewFor(this.#userSeat),
      boardShown: this.#boardShown,
      lastActions: { ...this.#lastActions },
      result: this.#result,
      stats: this.#stats.snapshot(),
      paused: this.#paused,
      speed: this.#speed,
      preAction: this.#preAction?.kind ?? null,
      userPlace: state.seats[this.#userSeat]?.place ?? null,
      playerCount: state.seats.length,
      winnerSeat: winner >= 0 ? winner : null,
      endedAt: this.#endedAt,
    };
  }

  #publish(): void {
    this.#version++;
    this.#snapshot = this.#buildSnapshot();
    for (const listener of this.#listeners) listener();
  }
}

function resultFrom(events: readonly EngineEvent[]): HandResult {
  const totals = new Map<number, { amount: number; hand: HandValue | null }>();
  let showdown = false;
  for (const e of events) {
    if (e.type === 'Showdown') showdown = true;
    if (e.type !== 'PotAwarded') continue;
    for (const w of e.winners) {
      const current = totals.get(w.seat) ?? { amount: 0, hand: null };
      totals.set(w.seat, { amount: current.amount + w.amount, hand: current.hand ?? e.value });
    }
  }
  return {
    winners: [...totals.entries()].map(([seat, t]) => ({ seat, amount: t.amount, hand: t.hand })),
    showdown,
  };
}

import { STYLES, type StyleId } from '../ai/index.ts';
import { decideSimple } from '../ai/simple/simple-npc.ts';
import type { Card } from '../core/cards/index.ts';
import {
  EngineError,
  type EngineEvent,
  type GameConfig,
  type GameState,
  PokerEngine,
  redactEvent,
  timeoutAction,
} from '../core/engine/index.ts';
import type { HandValue } from '../core/eval/index.ts';
import type { Rng } from '../core/rng/index.ts';
import type { ActionRecord, PlayerAction, PlayerView } from '../core/view/index.ts';
import type { NpcDriver } from './npc-driver.ts';
import { type SavedStats, type SessionStats, SessionStatsTracker } from './session-stats.ts';

export type Speed = 'normal' | 'fast' | 'instant';
export type PreAction = 'checkFold' | 'callAny' | 'check';

export type TablePhase =
  | 'dealing'
  | 'npcTurn'
  | 'userTurn'
  | 'runout'
  | 'handResult'
  | 'userOut'
  | 'watching'
  | 'gameOver';

/**
 * Moments the UI turns into sound, haptics and animation cues (AGENTS.md §11.4–11.5). They come
 * from engine events, so the UI never infers poker state itself.
 */
export type TableEffect =
  | { readonly kind: 'deal'; readonly cards: number }
  | { readonly kind: 'flip'; readonly cards: number }
  | { readonly kind: 'bet'; readonly seat: number }
  | { readonly kind: 'allIn'; readonly seat: number }
  | { readonly kind: 'check'; readonly seat: number }
  | { readonly kind: 'fold'; readonly seat: number }
  | { readonly kind: 'collect' }
  | { readonly kind: 'win'; readonly seats: readonly number[]; readonly user: boolean }
  | { readonly kind: 'yourTurn' };

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
  /** The five cards of the main pot's winning hand (highlighted), or null without showdown. */
  readonly bestFive: readonly Card[] | null;
}

/** The user's clock for the current turn (AGENTS.md §9). Times use the scheduler's clock. */
export interface UserClock {
  readonly startedAt: number;
  readonly actionMs: number;
  readonly bankMs: number;
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
  /** Running clock for the user's turn, or null (no timer, or not the user's turn). */
  readonly userClock: UserClock | null;
  /** Time bank left, in milliseconds. */
  readonly timeBankMs: number;
  /** Marked away after a timeout: auto check/fold until "Voltar" (AGENTS.md §9). */
  readonly away: boolean;
  /** Rabbit hunt state for the finished hand (AGENTS.md §10.1). */
  readonly rabbit: 'available' | readonly Card[] | null;
  /** NPC styles by seat (null for the user). */
  readonly styles: readonly (StyleId | null)[];
  /** Seats in the order hole cards were dealt this hand, one entry per card (§5.3). */
  readonly dealOrder: readonly number[];
  /** Bets gathered into the pot at the last street end (animated once per `id`). */
  readonly collected: CollectedBets | null;
}

export interface CollectedBets {
  readonly id: number;
  readonly bets: readonly { readonly seat: number; readonly amount: number }[];
}

/** Everything needed to resume a game at a hand boundary (never a deck in progress). */
export interface SavedGame {
  readonly version: 1;
  readonly state: GameState;
  readonly stats: SavedStats;
  readonly styles: readonly (StyleId | null)[];
  readonly userSeat: number;
  readonly timeBankMs: number;
  readonly userHands: number;
  readonly startedAt: number;
}

export interface TimerSettings {
  /** Per-action timer in ms, or null when the timer is off. */
  readonly actionMs: number | null;
  /** Initial time bank in ms (AGENTS.md §9: 30 s). */
  readonly bankMs: number;
}

export interface CompletedHand {
  readonly handNumber: number;
  readonly startedAt: number;
  readonly endedAt: number;
  readonly config: GameConfig;
  readonly userSeat: number;
  readonly userHole: readonly Card[] | null;
  readonly names: readonly string[];
  /** Events of the hand as the user saw them (other players' hidden cards redacted). */
  readonly events: readonly { readonly at: number; readonly event: EngineEvent }[];
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
  readonly timer?: TimerSettings;
  readonly rabbitHunt?: boolean;
  /** Resume a saved game instead of starting a new one. */
  readonly restore?: SavedGame;
  /** Called between hands with a save of the game (autosave, AGENTS.md §5.8). */
  readonly onSave?: (save: SavedGame) => void;
  /** Called when the game ends or the user busts (the autosave is discarded). */
  readonly onGameOver?: () => void;
  /** Called with each finished hand (hand history, AGENTS.md §10.2). */
  readonly onHandComplete?: (hand: CompletedHand) => void;
}

const THINKING_MS: Record<Speed, readonly [number, number]> = {
  normal: [350, 1200],
  fast: [120, 400],
  instant: [0, 0],
};
const RUNOUT_STREET_MS: Record<Speed, number> = { normal: 1100, fast: 500, instant: 0 };
const RESULT_MS: Record<Speed, number> = { normal: 2600, fast: 1400, instant: 0 };
const AWAY_ACTION_MS: Record<Speed, number> = { normal: 500, fast: 250, instant: 0 };
/** Time for the deal animation: per hole card, plus the last card's flight (AGENTS.md §11.4). */
const DEAL_CARD_MS: Record<Speed, number> = { normal: 70, fast: 35, instant: 0 };
const DEAL_FLIGHT_MS: Record<Speed, number> = { normal: 300, fast: 180, instant: 0 };
/** AGENTS.md §8.4: NPC thinking time is never above 1.5 s. */
const MAX_THINKING_MS = 1500;
/** AGENTS.md §9: +5 s every 10 hands, up to 60 s. */
const BANK_REFILL_MS = 5_000;
const BANK_REFILL_EVERY = 10;
const BANK_MAX_MS = 60_000;

/**
 * Drives a game for the UI: deals hands, runs NPC turns with human-like thinking time, paces
 * all-in runouts, applies pre-actions, runs the user's timer and time bank, and tracks session
 * stats. It holds no poker rules of its own (those live in the engine) and exposes an immutable
 * snapshot for React (`useSyncExternalStore`).
 */
export class GameController {
  readonly #engine: PokerEngine;
  readonly #npcRng: Rng;
  readonly #driver: NpcDriver;
  readonly #styles: readonly (StyleId | null)[];
  readonly #scheduler: Scheduler;
  readonly #userSeat: number;
  readonly #stats: SessionStatsTracker;
  readonly #listeners = new Set<() => void>();
  readonly #effectListeners = new Set<(effect: TableEffect) => void>();
  readonly #options: ControllerOptions;
  readonly #startedAt: number;
  #decisionToken = 0;
  #speed: Speed;
  #paused = false;
  #pausedAt = 0;
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
  #timerSettings: TimerSettings;
  #timeBankMs: number;
  #userHands: number;
  #userClock: UserClock | null = null;
  #away = false;
  #rabbitEnabled: boolean;
  #rabbit: 'available' | readonly Card[] | null = null;
  #handLog: { at: number; event: EngineEvent }[] = [];
  #handStartedAt = 0;
  #dealOrder: number[] = [];
  #collected: CollectedBets | null = null;
  #collectId = 0;
  #announcedTurn: string | null = null;
  #gameOverNotified = false;
  #snapshot: TableSnapshot;
  #version = 0;

  constructor(options: ControllerOptions) {
    this.#options = options;
    this.#scheduler = options.scheduler ?? browserScheduler;
    const saved = options.restore;
    this.#engine = saved
      ? PokerEngine.restore(saved.state, options.deckRng)
      : PokerEngine.create(options.config, options.deckRng);
    this.#npcRng = options.npcRng;
    this.#driver = options.driver ?? {
      decide: (_seat, view) => decideSimple(view, options.npcRng),
      observeHandEnd: () => undefined,
      dispose: () => undefined,
    };
    this.#styles = saved?.styles ?? options.styles ?? [];
    this.#speed = options.speed ?? 'normal';
    this.#userSeat = saved?.userSeat ?? options.userSeat ?? 0;
    this.#startedAt = saved?.startedAt ?? this.#scheduler.now();
    this.#stats = new SessionStatsTracker(this.#userSeat, this.#startedAt, saved?.stats);
    this.#timerSettings = options.timer ?? { actionMs: null, bankMs: 30_000 };
    this.#timeBankMs = saved?.timeBankMs ?? this.#timerSettings.bankMs;
    this.#userHands = saved?.userHands ?? 0;
    this.#rabbitEnabled = options.rabbitHunt ?? false;
    this.#snapshot = this.#buildSnapshot();
  }

  // ---- React bindings -----------------------------------------------------------------

  readonly subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  readonly getSnapshot = (): TableSnapshot => this.#snapshot;

  /** Sound, haptics and animation cues, in the order they happen. */
  readonly subscribeEffects = (listener: (effect: TableEffect) => void): (() => void) => {
    this.#effectListeners.add(listener);
    return () => this.#effectListeners.delete(listener);
  };

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
    this.#stopUserClock();
    this.#preAction = null;
    this.#continue();
    return true;
  }

  setPreAction(kind: PreAction | null): void {
    this.#preAction = kind ? { kind, street: this.#engine.state.hand?.street ?? null } : null;
    this.#publish();
  }

  /** "Voltar": the user is back after timing out. */
  setAway(away: boolean): void {
    this.#away = away;
    this.#publish();
    if (!away) this.#continue();
  }

  pause(): void {
    if (this.#paused) return;
    this.#paused = true;
    this.#pausedAt = this.#scheduler.now();
    this.#decisionToken++;
    this.#clearTimer();
    this.#publish();
  }

  resume(): void {
    if (!this.#paused) return;
    this.#paused = false;
    if (this.#userClock) {
      // The clock does not run while paused.
      const pausedFor = this.#scheduler.now() - this.#pausedAt;
      this.#userClock = { ...this.#userClock, startedAt: this.#userClock.startedAt + pausedFor };
    }
    this.#publish();
    this.#continue();
  }

  setSpeed(speed: Speed): void {
    this.#speed = speed;
    this.#publish();
  }

  setTimer(timer: TimerSettings): void {
    this.#timerSettings = timer;
  }

  setRabbitHunt(enabled: boolean): void {
    this.#rabbitEnabled = enabled;
  }

  setAutoMuck(autoMuck: boolean): void {
    this.#engine.setAutoMuck(this.#userSeat, autoMuck);
  }

  /** Reveals the cards that would have come (AGENTS.md §10.1); keeps the result on screen. */
  revealRabbit(): void {
    if (this.#rabbit !== 'available' || this.#phase !== 'handResult') return;
    this.#rabbit = this.#engine.rabbitHunt();
    this.#clearTimer();
    this.#showResult();
  }

  /** Skips the deal animation, a runout or the wait after a hand ("toque para continuar"). */
  skipWait(): void {
    if (this.#phase === 'dealing') {
      this.#clearTimer();
      this.#continue();
      return;
    }
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

  dispose(): void {
    this.suspend();
    this.#driver.dispose();
    this.#listeners.clear();
    this.#effectListeners.clear();
  }

  // ---- Flow ---------------------------------------------------------------------------

  #startHand(): void {
    if (this.#engine.isFinished) {
      this.#finishGame();
      return;
    }
    this.#options.onSave?.(this.#save());
    this.#lastActions = {};
    this.#result = null;
    this.#preAction = null;
    this.#rabbit = null;
    this.#boardShown = 0;
    this.#handLog = [];
    this.#dealOrder = [];
    this.#collected = null;
    this.#handStartedAt = this.#scheduler.now();
    this.#absorb(this.#engine.dispatch({ type: 'startHand' }), 0, null);
    const hand = this.#engine.state.hand;
    if (hand?.players[this.#userSeat]) {
      this.#userHands++;
      if (this.#userHands % BANK_REFILL_EVERY === 0) {
        this.#timeBankMs = Math.min(BANK_MAX_MS, this.#timeBankMs + BANK_REFILL_MS);
      }
    }
    // Let the deal animation finish before anyone acts.
    const dealMs = DEAL_CARD_MS[this.#speed] * this.#dealOrder.length + DEAL_FLIGHT_MS[this.#speed];
    if (dealMs === 0 || this.#engine.state.hand?.phase === 'complete') {
      this.#continue();
      return;
    }
    this.#phase = 'dealing';
    this.#publish();
    this.#timer = this.#scheduler.setTimeout(() => {
      this.#timer = null;
      this.#continue();
    }, dealMs);
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
          const before = this.#boardShown;
          this.#boardShown = Math.min(hand.board.length, this.#nextBoardStep());
          this.#emit({ kind: 'flip', cards: this.#boardShown - before });
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
      const turn = `${hand.number}:${hand.actions.length}`;
      if (this.#announcedTurn !== turn && !this.#away) {
        this.#announcedTurn = turn;
        this.#emit({ kind: 'yourTurn' });
      }
      this.#startUserTurn();
      return;
    }

    this.#phase = this.#watching ? 'watching' : 'npcTurn';
    this.#publish();
    this.#runNpcTurn(seat);
  }

  /** Starts (or resumes after a pause) the user's clock, or auto-acts while away. */
  #startUserTurn(): void {
    if (this.#away) {
      this.#publish();
      this.#timer = this.#scheduler.setTimeout(() => {
        this.#timer = null;
        this.#timeOut(false);
      }, AWAY_ACTION_MS[this.#speed]);
      return;
    }
    const actionMs = this.#timerSettings.actionMs;
    if (actionMs === null) {
      this.#publish();
      return;
    }
    this.#userClock ??= {
      startedAt: this.#scheduler.now(),
      actionMs,
      bankMs: this.#timeBankMs,
    };
    const clock = this.#userClock;
    const remaining = clock.startedAt + clock.actionMs + clock.bankMs - this.#scheduler.now();
    this.#publish();
    this.#timer = this.#scheduler.setTimeout(
      () => {
        this.#timer = null;
        this.#timeOut(true);
      },
      Math.max(0, remaining),
    );
  }

  /** Timer and bank ran out (or the user is away): check if possible, otherwise fold. */
  #timeOut(expired: boolean): void {
    if (this.#suspended || this.#paused || this.#phase !== 'userTurn') return;
    const legal = this.#engine.legalActions(this.#userSeat);
    if (!legal) return;
    if (expired) {
      this.#timeBankMs = 0;
      this.#away = true;
    }
    this.#userClock = null;
    this.#dispatchAct(this.#userSeat, timeoutAction(legal));
    this.#continue();
  }

  #stopUserClock(): void {
    const clock = this.#userClock;
    if (!clock) return;
    const elapsed = this.#scheduler.now() - clock.startedAt;
    const bankUsed = Math.max(0, elapsed - clock.actionMs);
    this.#timeBankMs = Math.max(0, clock.bankMs - bankUsed);
    this.#userClock = null;
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
      this.#notifyGameOver();
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
    this.#notifyGameOver();
    this.#publish();
  }

  #notifyGameOver(): void {
    if (this.#gameOverNotified) return;
    this.#gameOverNotified = true;
    this.#options.onGameOver?.();
  }

  #dispatchAct(seat: number, action: PlayerAction): void {
    const before = this.#engine.state.hand;
    const boardBefore = before?.board.length ?? 0;
    const streetBefore = before?.street ?? null;
    const committed = new Map<number, number>();
    for (const p of before?.players ?? []) if (p) committed.set(p.seat, p.committed);
    const events = this.#engine.dispatch({ type: 'act', seat, action });
    for (const e of events) {
      // `to` is the actor's street total after the action.
      if (e.type === 'ActionTaken' && e.action.kind !== 'fold' && e.action.kind !== 'check') {
        committed.set(e.action.seat, e.action.to);
      }
    }
    this.#absorb(events, boardBefore, streetBefore);
    const after = this.#engine.state.hand;
    if (after && (after.street !== streetBefore || after.phase === 'complete')) {
      const bets = [...committed].flatMap(([s, amount]) =>
        amount > 0 ? [{ seat: s, amount }] : [],
      );
      if (bets.length > 0) this.#collected = { id: ++this.#collectId, bets };
    }
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
    const canShow =
      !this.#result?.showdown && winners.length === 1 && winner && winner.seat !== this.#userSeat;
    const style = winner ? this.#styles[winner.seat] : null;
    if (canShow && style && this.#npcRng.int(1000) < STYLES[style].showOff * 1000) {
      this.#record(this.#engine.dispatch({ type: 'reveal', seat: winner.seat }));
    }
    this.#rabbit = this.#rabbitEnabled && this.#engine.rabbitHunt() ? 'available' : null;
    const view = this.#engine.viewFor(this.#userSeat);
    this.#options.onHandComplete?.({
      handNumber: hand.number,
      startedAt: this.#handStartedAt,
      endedAt: this.#scheduler.now(),
      config: this.#engine.state.config,
      userSeat: this.#userSeat,
      userHole: view.holeCards,
      names: this.#engine.state.seats.map((s) => s.name),
      events: [...this.#handLog],
    });
  }

  #record(events: readonly EngineEvent[]): void {
    const redacted = events.map((e) => redactEvent(e, this.#userSeat));
    const now = this.#scheduler.now();
    let dealt = 0;
    for (const e of redacted) {
      this.#handLog.push({ at: now, event: e });
      if (e.type === 'ActionTaken') this.#lastActions[e.action.seat] = e.action;
      if (e.type === 'StreetDealt') this.#lastActions = {};
      if (e.type === 'HoleCardDealt') {
        this.#dealOrder.push(e.seat);
        dealt++;
      }
      this.#effectFor(e);
    }
    if (dealt > 0) this.#emit({ kind: 'deal', cards: dealt });
    const view = this.#engine.viewFor(this.#userSeat);
    this.#stats.record(redacted, view.holeCards, view.board);
  }

  #effectFor(e: EngineEvent): void {
    switch (e.type) {
      case 'ActionTaken': {
        const { seat, kind, allIn } = e.action;
        if (kind === 'fold' || kind === 'check') this.#emit({ kind, seat });
        else this.#emit({ kind: allIn ? 'allIn' : 'bet', seat });
        break;
      }
      case 'StreetDealt':
        // During an all-in runout the board is revealed later, one street at a time.
        if (this.#phase !== 'runout') this.#emit({ kind: 'flip', cards: e.cards.length });
        break;
      case 'PotsUpdated':
        this.#emit({ kind: 'collect' });
        break;
      case 'PotAwarded': {
        const seats = e.winners.map((w) => w.seat);
        this.#emit({ kind: 'win', seats, user: seats.includes(this.#userSeat) });
        break;
      }
      default:
        break;
    }
  }

  #emit(effect: TableEffect): void {
    for (const listener of this.#effectListeners) listener(effect);
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

  #save(): SavedGame {
    return {
      version: 1,
      state: this.#engine.snapshot(),
      stats: this.#stats.save(),
      styles: this.#styles,
      userSeat: this.#userSeat,
      timeBankMs: this.#timeBankMs,
      userHands: this.#userHands,
      startedAt: this.#startedAt,
    };
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
      userClock: this.#phase === 'userTurn' ? this.#userClock : null,
      timeBankMs: this.#timeBankMs,
      away: this.#away,
      rabbit: this.#rabbit,
      styles: this.#styles,
      dealOrder: [...this.#dealOrder],
      collected: this.#collected,
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
  let bestFive: readonly Card[] | null = null;
  for (const e of events) {
    if (e.type === 'Showdown') showdown = true;
    if (e.type !== 'PotAwarded') continue;
    if (e.potIndex === 0) bestFive = e.bestFive;
    for (const w of e.winners) {
      const current = totals.get(w.seat) ?? { amount: 0, hand: null };
      totals.set(w.seat, { amount: current.amount + w.amount, hand: current.hand ?? e.value });
    }
  }
  return {
    winners: [...totals.entries()].map(([seat, t]) => ({ seat, amount: t.amount, hand: t.hand })),
    showdown,
    bestFive,
  };
}

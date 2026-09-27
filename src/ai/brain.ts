import type { Rng } from '../core/rng/index.ts';
import type { PlayerAction, PlayerView } from '../core/view/index.ts';
import { OpponentModel } from './model/opponent-model.ts';
import { estimateRange } from './model/range.ts';
import { callingRange, cleanDrawOuts } from './postflop/classify.ts';
import { decidePostflop, type DecisionInfo } from './postflop/decide.ts';
import { equityVsRanges } from './postflop/equity.ts';
import { decidePreflop } from './ranges/preflop.ts';
import { sanitize } from './sanity.ts';
import { STYLES, type StyleId, type StyleProfile } from './styles/styles.ts';
import { analyse } from './view-analysis.ts';

/** Hands of more careful bluffing after a bluff was shown down and lost (§18.3). */
const FAILED_BLUFF_HANDS = 3;

export interface BrainOptions {
  /** Monte Carlo samples for postflop equity (fewer in the headless simulator). */
  readonly iterations?: number;
  /** Computation budget per decision, in milliseconds. */
  readonly budgetMs?: number;
  readonly now?: () => number;
}

/**
 * One NPC (AGENTS.md §8). It sees only PlayerViews: `decide` for its own turns and
 * `observeHandEnd` after every hand (for opponent modelling and tilt). It never receives the
 * deck or hidden cards.
 */
export class NpcBrain {
  readonly seat: number;
  readonly style: StyleProfile;
  readonly #rng: Rng;
  readonly #model = new OpponentModel();
  readonly #iterations: number;
  readonly #budgetMs: number;
  readonly #now: () => number;
  readonly #personal: number;
  #tiltRemaining = 0;
  #failedBluffRemaining = 0;
  #bluffedHand = -1;
  #handStartStack = new Map<number, number>();

  constructor(seat: number, style: StyleId, rng: Rng, options: BrainOptions = {}) {
    this.seat = seat;
    this.style = STYLES[style];
    this.#rng = rng;
    this.#iterations = options.iterations ?? 1500;
    this.#budgetMs = options.budgetMs ?? 250;
    this.#now = options.now ?? (() => performance.now());
    this.#personal = 0.8 + (0.4 * rng.int(1_000_001)) / 1_000_000;
  }

  get tilted(): boolean {
    return this.#tiltRemaining > 0;
  }

  /** Persistent bluffing multiplier of this NPC, drawn once in [0.8, 1.2] (§18.3). */
  get personal(): number {
    return this.#personal;
  }

  decide(view: PlayerView): PlayerAction {
    return this.decideWithInfo(view).action;
  }

  /** The decision plus what the NPC saw, for the simulator statistics (§18.5). */
  decideWithInfo(view: PlayerView): { action: PlayerAction; info: DecisionInfo | null } {
    const legal = view.legal;
    if (!legal) throw new Error('decide() needs the player to act');
    const spot = analyse(view);
    if (!this.#handStartStack.has(view.handNumber)) {
      this.#handStartStack.set(view.handNumber, spot.me.stack + spot.me.committedTotal);
    }
    const random = () => this.#rng.int(1_000_000) / 1_000_000;
    const looseness = this.tilted ? 1.3 : 1;

    if (spot.street === 'preflop') {
      const action = decidePreflop({ spot, style: this.style, looseness, random });
      return { action: sanitize(action, legal), info: null };
    }

    const deadline = this.#now() + this.#budgetMs;
    const live = spot.opponents;
    const ranges = live.map((o) =>
      estimateRange(o.seat, view.actions, view.board, spot.hole, this.#model.estimate(o.seat)),
    );
    // Half the samples against the whole ranges, half against the calling ranges (§18.1).
    const samples = Math.max(50, Math.round(this.#iterations / 2));
    const equity = equityVsRanges(
      spot.hole,
      view.board,
      ranges,
      this.#rng,
      samples,
      deadline,
      this.#now,
    );
    const callers = ranges.map((r) => callingRange(r, view.board, spot.hole));
    const equityVsCallers = equityVsRanges(
      spot.hole,
      view.board,
      callers,
      this.#rng,
      samples,
      deadline,
      this.#now,
    );
    const active = live.filter((o) => o.status === 'active');
    const foldEquity =
      active.length === 0
        ? 0
        : active.reduce((sum, o) => sum + this.#model.estimate(o.seat).foldToBet, 0) /
          active.length;
    const { action, info } = decidePostflop({
      spot,
      style: this.style,
      equity,
      equityVsCallers,
      cleanOuts: cleanDrawOuts(spot.hole, view.board),
      draw: hasStrongDraw(spot.hole, view.board),
      tilted: this.tilted,
      personal: this.#personal,
      foldEquity,
      recentFailedBluff: this.#failedBluffRemaining > 0,
      bluffedThisHand: this.#bluffedHand === view.handNumber,
      random,
    });
    if (info.bluffed && info.betClass === 'pureBluff') this.#bluffedHand = view.handNumber;
    return { action: sanitize(action, legal), info };
  }

  /** Learns from the completed hand's public record and updates tilt. */
  observeHandEnd(view: PlayerView): void {
    this.#model.observeHand(view);
    if (this.#tiltRemaining > 0) this.#tiltRemaining--;
    if (this.#failedBluffRemaining > 0) this.#failedBluffRemaining--;
    const start = this.#handStartStack.get(view.handNumber);
    this.#handStartStack.delete(view.handNumber);
    const me = view.seats[this.seat];
    if (start === undefined || !me) return;
    const lost = start - me.stack;
    if (this.style.tiltHands > 0 && lost >= start * 0.5 && lost >= 25 * view.bigBlind) {
      this.#tiltRemaining = this.style.tiltHands;
    }
    // A bluff that was shown down and lost makes careful players bluff less for a few hands.
    const shown = view.shownHands.some(
      (h) => h.handNumber === view.handNumber && h.seat === this.seat,
    );
    if (this.#bluffedHand === view.handNumber && shown && lost > 0) {
      this.#failedBluffRemaining = FAILED_BLUFF_HANDS;
    }
  }

  /** Whether to show a hand won without a showdown (occasional, by style). */
  wantsToShow(): boolean {
    return this.#rng.int(1000) < this.style.showOff * 1000;
  }
}

function hasStrongDraw(hole: readonly number[], board: readonly number[]): boolean {
  if (board.length >= 5) return false;
  const cards = [...hole, ...board];
  for (let suit = 0; suit < 4; suit++) {
    const suited = cards.filter((c) => (c & 3) === suit);
    if (suited.length === 4 && hole.some((c) => (c & 3) === suit)) return true;
  }
  const ranks = new Set(cards.map((c) => c >> 2));
  for (let low = 0; low <= 8; low++) {
    let run = 0;
    for (let r = low; r < low + 4; r++) if (ranks.has(r)) run++;
    const usesHole = hole.some((c) => c >> 2 >= low && c >> 2 < low + 4);
    if (run === 4 && usesHole && low >= 1 && low + 3 <= 11) return true;
  }
  return false;
}

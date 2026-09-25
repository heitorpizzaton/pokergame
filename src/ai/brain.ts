import type { Rng } from '../core/rng/index.ts';
import type { PlayerAction, PlayerView } from '../core/view/index.ts';
import { OpponentModel } from './model/opponent-model.ts';
import { estimateRange } from './model/range.ts';
import { decidePostflop } from './postflop/decide.ts';
import { equityVsRanges } from './postflop/equity.ts';
import { decidePreflop } from './ranges/preflop.ts';
import { sanitize } from './sanity.ts';
import { STYLES, type StyleId, type StyleProfile } from './styles/styles.ts';
import { analyse } from './view-analysis.ts';

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
  #tiltRemaining = 0;
  #handStartStack = new Map<number, number>();

  constructor(seat: number, style: StyleId, rng: Rng, options: BrainOptions = {}) {
    this.seat = seat;
    this.style = STYLES[style];
    this.#rng = rng;
    this.#iterations = options.iterations ?? 1500;
    this.#budgetMs = options.budgetMs ?? 250;
    this.#now = options.now ?? (() => performance.now());
  }

  get tilted(): boolean {
    return this.#tiltRemaining > 0;
  }

  decide(view: PlayerView): PlayerAction {
    const legal = view.legal;
    if (!legal) throw new Error('decide() needs the player to act');
    const spot = analyse(view);
    if (!this.#handStartStack.has(view.handNumber)) {
      this.#handStartStack.set(view.handNumber, spot.me.stack + spot.me.committedTotal);
    }
    const random = () => this.#rng.int(1_000_000) / 1_000_000;
    const looseness = this.tilted ? 1.3 : 1;

    if (spot.street === 'preflop') {
      return sanitize(decidePreflop({ spot, style: this.style, looseness, random }), legal);
    }

    const deadline = this.#now() + this.#budgetMs;
    const ranges = spot.opponents.map((o) =>
      estimateRange(o.seat, view.actions, view.board, spot.hole, this.#model.estimate(o.seat)),
    );
    const equity = equityVsRanges(
      spot.hole,
      view.board,
      ranges,
      this.#rng,
      this.#iterations,
      deadline,
      this.#now,
    );
    const draw = hasStrongDraw(spot.hole, view.board);
    const action = decidePostflop({
      spot,
      style: this.style,
      equity,
      draw,
      aggression: this.tilted ? 1.35 : 1,
      random,
    });
    return sanitize(action, legal);
  }

  /** Learns from the completed hand's public record and updates tilt. */
  observeHandEnd(view: PlayerView): void {
    this.#model.observeHand(view);
    if (this.#tiltRemaining > 0) this.#tiltRemaining--;
    const start = this.#handStartStack.get(view.handNumber);
    this.#handStartStack.delete(view.handNumber);
    const me = view.seats[this.seat];
    if (start === undefined || !me) return;
    const lost = start - me.stack;
    if (this.style.tiltHands > 0 && lost >= start * 0.5 && lost >= 25 * view.bigBlind) {
      this.#tiltRemaining = this.style.tiltHands;
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

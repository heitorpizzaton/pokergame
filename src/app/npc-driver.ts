import { type BrainOptions, NpcBrain, type StyleId } from '../ai/index.ts';
import type { Rng } from '../core/rng/index.ts';
import type { PlayerAction, PlayerView } from '../core/view/index.ts';

/**
 * How the controller asks NPCs for decisions. `decide` may answer synchronously (in-process
 * brains, used by tests and as a fallback) or asynchronously (the AI worker).
 */
export interface NpcDriver {
  decide(seat: number, view: PlayerView): PlayerAction | Promise<PlayerAction>;
  /** Called once per hand with every NPC's end-of-hand view (opponent modelling, tilt). */
  observeHandEnd(views: readonly PlayerView[]): void;
  dispose(): void;
}

export interface NpcSeat {
  readonly seat: number;
  readonly style: StyleId;
}

/** In-process brains (tests, Node, and browsers without module workers). */
export class LocalNpcDriver implements NpcDriver {
  readonly #brains = new Map<number, NpcBrain>();

  constructor(
    seats: readonly NpcSeat[],
    rngFor: (seat: number) => Rng,
    options: BrainOptions = {},
  ) {
    for (const { seat, style } of seats) {
      this.#brains.set(seat, new NpcBrain(seat, style, rngFor(seat), options));
    }
  }

  decide(seat: number, view: PlayerView): PlayerAction {
    const brain = this.#brains.get(seat);
    if (!brain) throw new Error(`No NPC in seat ${seat}`);
    return brain.decide(view);
  }

  observeHandEnd(views: readonly PlayerView[]): void {
    for (const view of views) this.#brains.get(view.seat)?.observeHandEnd(view);
  }

  dispose(): void {
    this.#brains.clear();
  }
}

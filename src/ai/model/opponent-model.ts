import type { PlayerView } from '../../core/view/index.ts';

/** Observed tendencies of one opponent in this game (AGENTS.md §8.2.7). */
export interface TendencyEstimate {
  readonly vpip: number;
  readonly pfr: number;
  readonly threeBet: number;
  /** Aggression factor: (bets + raises) / calls, postflop. */
  readonly aggression: number;
  readonly foldToCbet: number;
  readonly wentToShowdown: number;
  readonly hands: number;
}

class Counters {
  hands = 0;
  vpip = 0;
  pfr = 0;
  threeBetOpportunities = 0;
  threeBets = 0;
  aggressive = 0;
  passive = 0;
  cbetsFaced = 0;
  cbetFolds = 0;
  sawFlop = 0;
  showdowns = 0;
}

/** Bayesian-smoothed estimate: the prior counts as `weight` observed hands. */
function smooth(count: number, total: number, prior: number, weight: number): number {
  return (count + prior * weight) / (total + weight);
}

/**
 * Tracks every player's public actions across hands (including the user's). Fed with the
 * PlayerView at the end of each hand, so it never sees hidden cards.
 */
export class OpponentModel {
  readonly #counters = new Map<number, Counters>();
  #lastHand = -1;

  observeHand(view: PlayerView): void {
    if (view.handNumber === this.#lastHand) return;
    this.#lastHand = view.handNumber;
    const dealt = view.seats.filter((s) => s.status !== 'eliminated' && s.status !== 'sittingOut');
    let raisesSoFar = 0;
    let preflopAggressor: number | null = null;
    const perSeat = new Map<number, { vpip: boolean; pfr: boolean }>();
    for (const s of dealt) {
      this.#get(s.seat).hands++;
      perSeat.set(s.seat, { vpip: false, pfr: false });
    }
    for (const a of view.actions.filter((x) => x.street === 'preflop')) {
      const c = this.#get(a.seat);
      const flags = perSeat.get(a.seat);
      if (raisesSoFar === 1 && a.seat !== preflopAggressor) c.threeBetOpportunities++;
      if (a.kind === 'bet' || a.kind === 'raise') {
        if (raisesSoFar === 1) c.threeBets++;
        raisesSoFar++;
        preflopAggressor = a.seat;
        if (flags) flags.pfr = true;
      }
      if (flags && (a.kind === 'call' || a.kind === 'bet' || a.kind === 'raise')) flags.vpip = true;
    }
    for (const [seat, flags] of perSeat) {
      const c = this.#get(seat);
      if (flags.vpip) c.vpip++;
      if (flags.pfr) c.pfr++;
    }
    const flop = view.actions.filter((a) => a.street === 'flop');
    const flopSeats = new Set(flop.map((a) => a.seat));
    for (const seat of flopSeats) this.#get(seat).sawFlop++;
    const cbetIndex = flop.findIndex(
      (a) => a.seat === preflopAggressor && (a.kind === 'bet' || a.kind === 'raise'),
    );
    if (cbetIndex >= 0) {
      const responded = new Set<number>();
      for (const a of flop.slice(cbetIndex + 1)) {
        if (responded.has(a.seat) || a.seat === preflopAggressor) continue;
        responded.add(a.seat);
        const c = this.#get(a.seat);
        c.cbetsFaced++;
        if (a.kind === 'fold') c.cbetFolds++;
      }
    }
    for (const a of view.actions.filter((x) => x.street !== 'preflop')) {
      const c = this.#get(a.seat);
      if (a.kind === 'bet' || a.kind === 'raise') c.aggressive++;
      else if (a.kind === 'call') c.passive++;
    }
    for (const h of view.shownHands.filter((h) => h.handNumber === view.handNumber)) {
      this.#get(h.seat).showdowns++;
    }
  }

  estimate(seat: number): TendencyEstimate {
    const c = this.#get(seat);
    return {
      vpip: smooth(c.vpip, c.hands, 0.28, 12),
      pfr: smooth(c.pfr, c.hands, 0.18, 12),
      threeBet: smooth(c.threeBets, c.threeBetOpportunities, 0.06, 10),
      aggression: (c.aggressive + 2 * 1.5) / (c.passive + 2),
      foldToCbet: smooth(c.cbetFolds, c.cbetsFaced, 0.45, 8),
      wentToShowdown: smooth(c.showdowns, c.sawFlop, 0.28, 8),
      hands: c.hands,
    };
  }

  #get(seat: number): Counters {
    let c = this.#counters.get(seat);
    if (!c) {
      c = new Counters();
      this.#counters.set(seat, c);
    }
    return c;
  }
}

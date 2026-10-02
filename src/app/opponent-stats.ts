import type { Card } from '../core/cards/index.ts';
import type { PlayerView } from '../core/view/index.ts';

/** What the table has seen of one player in this game (AGENTS.md §31.2.2). Public info only. */
export interface OpponentRecord {
  hands: number;
  vpip: number;
  pfr: number;
  /** Postflop bets and raises. */
  aggressive: number;
  /** Postflop calls. */
  passive: number;
  sawFlop: number;
  showdowns: number;
  /** The last hands this player showed, newest first. */
  shown: { handNumber: number; cards: Card[] }[];
}

export interface OpponentSummary {
  readonly hands: number;
  /** Rates in [0, 1], or null before there is anything to measure. */
  readonly vpip: number | null;
  readonly pfr: number | null;
  /** (bets + raises) / calls after the flop, or null without postflop actions. */
  readonly aggression: number | null;
  readonly wentToShowdown: number | null;
  readonly shown: readonly { readonly handNumber: number; readonly cards: readonly Card[] }[];
}

const SHOWN_KEPT = 5;

const empty = (): OpponentRecord => ({
  hands: 0,
  vpip: 0,
  pfr: 0,
  aggressive: 0,
  passive: 0,
  sawFlop: 0,
  showdowns: 0,
  shown: [],
});

/**
 * Counts public actions and shown hands from the user's view at the end of each hand, so it
 * can never see a card the user could not see.
 */
export class OpponentStatsTracker {
  readonly #records = new Map<number, OpponentRecord>();
  #lastHand = -1;

  constructor(saved?: Readonly<Record<number, OpponentRecord>>) {
    for (const [seat, record] of Object.entries(saved ?? {})) {
      this.#records.set(Number(seat), { ...record, shown: [...record.shown] });
    }
  }

  observe(view: PlayerView): void {
    if (view.handNumber === this.#lastHand) return;
    this.#lastHand = view.handNumber;
    const shownNow = view.shownHands.filter((h) => h.handNumber === view.handNumber);
    const acted = new Set(view.actions.map((a) => a.seat));
    for (const seat of view.seats) {
      const dealt =
        seat.status !== 'eliminated' ||
        acted.has(seat.seat) ||
        shownNow.some((h) => h.seat === seat.seat);
      if (!dealt) continue;
      const r = this.#get(seat.seat);
      r.hands++;
      const mine = view.actions.filter((a) => a.seat === seat.seat);
      const pre = mine.filter((a) => a.street === 'preflop');
      if (pre.some((a) => a.kind === 'call' || a.kind === 'bet' || a.kind === 'raise')) r.vpip++;
      if (pre.some((a) => a.kind === 'bet' || a.kind === 'raise')) r.pfr++;
      const post = mine.filter((a) => a.street !== 'preflop');
      r.aggressive += post.filter((a) => a.kind === 'bet' || a.kind === 'raise').length;
      r.passive += post.filter((a) => a.kind === 'call').length;
      const foldedPreflop = pre.some((a) => a.kind === 'fold');
      if (view.board.length >= 3 && !foldedPreflop) r.sawFlop++;
      const shown = shownNow.find((h) => h.seat === seat.seat);
      if (shown) {
        r.showdowns++;
        r.shown = [{ handNumber: shown.handNumber, cards: [...shown.cards] }, ...r.shown].slice(
          0,
          SHOWN_KEPT,
        );
      }
    }
  }

  summary(seat: number): OpponentSummary {
    const r = this.#records.get(seat) ?? empty();
    const rate = (n: number, d: number) => (d > 0 ? n / d : null);
    return {
      hands: r.hands,
      vpip: rate(r.vpip, r.hands),
      pfr: rate(r.pfr, r.hands),
      aggression: r.aggressive + r.passive > 0 ? r.aggressive / Math.max(1, r.passive) : null,
      wentToShowdown: rate(r.showdowns, r.sawFlop),
      shown: r.shown,
    };
  }

  save(): Record<number, OpponentRecord> {
    return Object.fromEntries(
      [...this.#records].map(([seat, r]) => [seat, { ...r, shown: [...r.shown] }]),
    );
  }

  #get(seat: number): OpponentRecord {
    let r = this.#records.get(seat);
    if (!r) {
      r = empty();
      this.#records.set(seat, r);
    }
    return r;
  }
}

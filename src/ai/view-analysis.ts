import type { Card } from '../core/cards/index.ts';
import type { ActionRecord, PlayerView, PublicSeat, Street } from '../core/view/index.ts';

/** Facts about the current spot derived from a PlayerView (public information only). */
export interface Spot {
  readonly view: PlayerView;
  readonly me: PublicSeat;
  readonly hole: readonly Card[];
  readonly street: Street;
  readonly bb: number;
  /** Chips in the middle, current bets included. */
  readonly pot: number;
  readonly toCall: number;
  /** Effective stack in chips: mine versus the largest live opponent stack (both incl. bets). */
  readonly effective: number;
  readonly opponents: readonly PublicSeat[];
  readonly preflopRaises: number;
  readonly preflopLimpers: number;
  readonly preflopAggressor: number | null;
  /** True when every live opponent acts before me on postflop streets. */
  readonly inPosition: boolean;
  readonly streetActions: readonly ActionRecord[];
}

export function analyse(view: PlayerView): Spot {
  const me = view.seats[view.seat];
  const hole = view.holeCards;
  if (!me || hole?.length !== 2 || view.street === null) throw new Error('No decision to make');
  const pot =
    view.pots.reduce((s, p) => s + p.amount, 0) + view.seats.reduce((s, x) => s + x.committed, 0);
  const opponents = view.seats.filter(
    (s) => s.seat !== view.seat && (s.status === 'active' || s.status === 'allIn'),
  );
  const mine = me.stack + me.committed;
  const biggest = Math.max(0, ...opponents.map((o) => o.stack + o.committed));
  const preflop = view.actions.filter((a) => a.street === 'preflop');
  let raises = 0;
  let limpers = 0;
  let aggressor: number | null = null;
  for (const a of preflop) {
    if (a.kind === 'bet' || a.kind === 'raise') {
      raises++;
      aggressor = a.seat;
    } else if (a.kind === 'call' && raises === 0) {
      limpers++;
    }
  }
  const n = view.seats.length;
  const distance = (seat: number) => (seat - view.button + n) % n || n;
  const myDistance = distance(view.seat);
  const inPosition = opponents
    .filter((o) => o.status === 'active')
    .every((o) => distance(o.seat) < myDistance);
  return {
    view,
    me,
    hole,
    street: view.street,
    bb: view.bigBlind,
    pot,
    toCall: view.legal?.callAmount ?? 0,
    effective: Math.min(mine, biggest),
    opponents,
    preflopRaises: raises,
    preflopLimpers: limpers,
    preflopAggressor: aggressor,
    inPosition,
    streetActions: view.actions.filter((a) => a.street === view.street),
  };
}

/** Board cards visible on a given street. */
export function boardAt(board: readonly Card[], street: Street): readonly Card[] {
  const length = street === 'preflop' ? 0 : street === 'flop' ? 3 : street === 'turn' ? 4 : 5;
  return board.slice(0, length);
}

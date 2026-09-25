import type { Card } from '../core/cards/index.ts';
import type { ActionRecord, Street } from '../core/view/index.ts';
import type { HandRecord } from './record.ts';

export type ReplayStep =
  | { readonly kind: 'start' }
  | { readonly kind: 'action'; readonly action: ActionRecord }
  | { readonly kind: 'street'; readonly street: Street; readonly cards: readonly Card[] }
  | { readonly kind: 'showdown' }
  | { readonly kind: 'result' };

export interface ReplaySeat {
  readonly seat: number;
  readonly name: string;
  readonly stack: number;
  readonly committed: number;
  readonly folded: boolean;
  readonly cards: readonly Card[] | null;
  readonly lastAction: ActionRecord | null;
}

/** The table at one step of the replay (AGENTS.md §10.2). */
export interface ReplayFrame {
  readonly step: ReplayStep;
  readonly street: Street;
  readonly board: readonly Card[];
  readonly pot: number;
  readonly seats: readonly ReplaySeat[];
  readonly winners: readonly number[];
}

const FOLLOWING: Readonly<Record<Street, Street>> = {
  preflop: 'flop',
  flop: 'turn',
  turn: 'river',
  river: 'river',
};

/** Builds every frame of a hand for step forward/back, auto-play and street jumps. */
export function replayFrames(record: HandRecord): ReplayFrame[] {
  const frames: ReplayFrame[] = [];
  const stacks = new Map(record.seats.map((s) => [s.seat, s.stack]));
  const committed = new Map<number, number>();
  const folded = new Set<number>();
  const last = new Map<number, ActionRecord>();
  let street = 'preflop' as Street;
  let boardCount = 0;
  let collected = 0;
  let revealed = false;

  const shownCards = (seat: number): readonly Card[] | null => {
    if (seat === record.userSeat) return record.userHole;
    return revealed ? (record.shown.find((s) => s.seat === seat)?.cards ?? null) : null;
  };
  const snap = (step: ReplayStep, winners: readonly number[] = []): void => {
    frames.push({
      step,
      street,
      board: record.board.slice(0, boardCount),
      pot: collected + [...committed.values()].reduce((a, b) => a + b, 0),
      seats: record.seats.map((s) => ({
        seat: s.seat,
        name: s.name,
        stack: stacks.get(s.seat) ?? 0,
        committed: committed.get(s.seat) ?? 0,
        folded: folded.has(s.seat),
        cards: folded.has(s.seat) && s.seat !== record.userSeat ? null : shownCards(s.seat),
        lastAction: last.get(s.seat) ?? null,
      })),
      winners,
    });
  };
  const put = (seat: number, amount: number): void => {
    stacks.set(seat, (stacks.get(seat) ?? 0) - amount);
    committed.set(seat, (committed.get(seat) ?? 0) + amount);
  };
  const nextStreet = (to: Street): void => {
    collected += [...committed.values()].reduce((a, b) => a + b, 0);
    committed.clear();
    last.clear();
    street = to;
    boardCount = to === 'flop' ? 3 : to === 'turn' ? 4 : 5;
    snap({ kind: 'street', street: to, cards: record.board.slice(0, boardCount) });
  };

  for (const b of record.blinds) put(b.seat, b.amount);
  snap({ kind: 'start' });
  for (const a of record.actions) {
    while (a.street !== street) nextStreet(FOLLOWING[street]);
    put(a.seat, a.amount);
    if (a.kind === 'fold') folded.add(a.seat);
    last.set(a.seat, a);
    snap({ kind: 'action', action: a });
  }
  for (const u of record.uncalled) {
    stacks.set(u.seat, (stacks.get(u.seat) ?? 0) + u.amount);
    committed.set(u.seat, (committed.get(u.seat) ?? 0) - u.amount);
  }
  while (boardCount < record.board.length) {
    nextStreet(boardCount < 3 ? 'flop' : boardCount < 4 ? 'turn' : 'river');
  }
  if (record.shown.length > 0) {
    revealed = true;
    snap({ kind: 'showdown' });
  }
  record.finalStacks.forEach((stack, seat) => {
    if (stacks.has(seat)) stacks.set(seat, stack);
  });
  collected = 0;
  committed.clear();
  const winners = [...new Set(record.awards.flatMap((a) => a.winners.map((w) => w.seat)))];
  snap({ kind: 'result' }, winners);
  return frames;
}

/** Index of the first frame of `street` (for street jumps), or -1. */
export function streetStart(frames: readonly ReplayFrame[], street: Street): number {
  if (street === 'preflop') return 0;
  return frames.findIndex((f) => f.step.kind === 'street' && f.step.street === street);
}

import type { CompletedHand, FairnessProof } from '../app/game-controller.ts';
import type { Card } from '../core/cards/index.ts';
import { positionLabelsFromButton } from '../core/engine/index.ts';
import type { HandValue } from '../core/eval/index.ts';
import type { ActionKind, PositionLabel, PublicPot, Street } from '../core/view/index.ts';

/**
 * One recorded hand (AGENTS.md §10.2). Built only from what the user saw: NPC hole cards appear
 * only if they were shown publicly.
 */
export interface HandRecord {
  readonly id: string;
  readonly sessionId: string;
  readonly handNumber: number;
  readonly startedAt: number;
  readonly endedAt: number;
  readonly smallBlind: number;
  readonly bigBlind: number;
  readonly button: number;
  readonly userSeat: number;
  readonly userHole: readonly Card[] | null;
  readonly seats: readonly {
    readonly seat: number;
    readonly name: string;
    readonly stack: number;
    readonly position: PositionLabel | null;
  }[];
  readonly blinds: readonly {
    readonly seat: number;
    readonly blind: 'small' | 'big';
    readonly amount: number;
  }[];
  readonly actions: readonly {
    readonly seat: number;
    readonly street: Street;
    readonly kind: ActionKind;
    readonly amount: number;
    readonly to: number;
    readonly allIn: boolean;
    /** Milliseconds since the hand started. */
    readonly at: number;
  }[];
  /** Board cards per street, in order. */
  readonly board: readonly Card[];
  readonly shown: readonly { readonly seat: number; readonly cards: readonly Card[] }[];
  readonly mucked: readonly number[];
  readonly uncalled: readonly { readonly seat: number; readonly amount: number }[];
  readonly pots: readonly PublicPot[];
  readonly awards: readonly {
    readonly potIndex: number;
    readonly amount: number;
    readonly winners: readonly { readonly seat: number; readonly amount: number }[];
    readonly value: HandValue | null;
  }[];
  readonly finalStacks: readonly number[];
  /** The user's net result for the hand, in chips. */
  readonly userNet: number;
  readonly potTotal: number;
  /** Deck commitment and reveal (records saved before Phase 8 have none). */
  readonly fairness?: FairnessProof;
}

export function buildHandRecord(hand: CompletedHand, sessionId: string): HandRecord {
  let button = 0;
  let dealt: readonly number[] = [];
  let startStacks: readonly number[] = [];
  let finalStacks: readonly number[] = [];
  const blinds: HandRecord['blinds'][number][] = [];
  const actions: HandRecord['actions'][number][] = [];
  const board: Card[] = [];
  const shown = new Map<number, readonly Card[]>();
  const mucked: number[] = [];
  const uncalled: HandRecord['uncalled'][number][] = [];
  let pots: readonly PublicPot[] = [];
  const awards: HandRecord['awards'][number][] = [];

  for (const { at, event: e } of hand.events) {
    switch (e.type) {
      case 'HandStarted':
        button = e.button;
        dealt = e.seats;
        startStacks = e.stacks;
        break;
      case 'BlindPosted':
        blinds.push({ seat: e.seat, blind: e.blind, amount: e.amount });
        break;
      case 'ActionTaken':
        actions.push({ ...e.action, at: at - hand.startedAt });
        break;
      case 'StreetDealt':
        board.push(...e.cards);
        break;
      case 'HandsRevealed':
        for (const h of e.hands) shown.set(h.seat, h.cards);
        break;
      case 'Showdown':
      case 'CardsShown':
        shown.set(e.seat, e.cards);
        break;
      case 'Mucked':
        mucked.push(e.seat);
        break;
      case 'UncalledBetReturned':
        uncalled.push({ seat: e.seat, amount: e.amount });
        break;
      case 'PotsUpdated':
        pots = e.pots;
        break;
      case 'PotAwarded':
        awards.push({ potIndex: e.potIndex, amount: e.amount, winners: e.winners, value: e.value });
        break;
      case 'HandEnded':
        finalStacks = e.stacks;
        break;
      default:
        break;
    }
  }

  // Positions by offset from the button among the seats dealt in.
  const n = hand.names.length;
  const order: number[] = [];
  for (let i = 0; i < n; i++) {
    const seat = (button + i) % n;
    if (dealt.includes(seat)) order.push(seat);
  }
  const labels = order.length >= 2 ? positionLabelsFromButton(order.length) : [];
  const positionOf = new Map(order.map((seat, i) => [seat, labels[i] ?? null]));

  return {
    id: `${sessionId}-${String(hand.handNumber).padStart(5, '0')}`,
    sessionId,
    handNumber: hand.handNumber,
    startedAt: hand.startedAt,
    endedAt: hand.endedAt,
    smallBlind: hand.config.smallBlind,
    bigBlind: hand.config.bigBlind,
    button,
    userSeat: hand.userSeat,
    userHole: hand.userHole ? [...hand.userHole] : null,
    seats: dealt.map((seat) => ({
      seat,
      name: hand.names[seat] ?? '',
      stack: startStacks[seat] ?? 0,
      position: positionOf.get(seat) ?? null,
    })),
    blinds,
    actions,
    board,
    shown: [...shown.entries()].map(([seat, cards]) => ({ seat, cards: [...cards] })),
    mucked,
    uncalled,
    pots,
    awards,
    finalStacks,
    userNet: (finalStacks[hand.userSeat] ?? 0) - (startStacks[hand.userSeat] ?? 0),
    potTotal: awards.reduce((sum, a) => sum + a.amount, 0),
    ...(hand.fairness ? { fairness: hand.fairness } : {}),
  };
}

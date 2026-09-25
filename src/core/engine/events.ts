import type { Card } from '../cards/index.ts';
import type { HandValue } from '../eval/index.ts';
import type { ActionRecord, PublicPot, Street } from '../view/index.ts';

/**
 * Events are the engine's only side effect (AGENTS.md §4.1). The UI animates from them and the
 * history records them. `HoleCardDealt.card` is private to its seat: use {@link redactEvent}
 * before showing an event to anyone else.
 */
export type EngineEvent =
  | {
      readonly type: 'HandStarted';
      readonly handNumber: number;
      readonly button: number;
      readonly smallBlindSeat: number;
      readonly bigBlindSeat: number;
      readonly seats: readonly number[];
      readonly stacks: readonly number[];
    }
  | {
      readonly type: 'BlindPosted';
      readonly seat: number;
      readonly blind: 'small' | 'big';
      readonly amount: number;
      readonly allIn: boolean;
    }
  | {
      readonly type: 'HoleCardDealt';
      readonly seat: number;
      readonly round: 0 | 1;
      readonly card: Card | null;
    }
  | { readonly type: 'CardBurned'; readonly street: Street }
  | { readonly type: 'StreetDealt'; readonly street: Street; readonly cards: readonly Card[] }
  | { readonly type: 'TurnStarted'; readonly seat: number }
  | { readonly type: 'ActionTaken'; readonly action: ActionRecord }
  | { readonly type: 'UncalledBetReturned'; readonly seat: number; readonly amount: number }
  | { readonly type: 'PotsUpdated'; readonly pots: readonly PublicPot[] }
  | {
      readonly type: 'HandsRevealed';
      readonly hands: readonly { readonly seat: number; readonly cards: readonly Card[] }[];
    }
  | {
      readonly type: 'Showdown';
      readonly seat: number;
      readonly cards: readonly Card[];
      readonly value: HandValue;
    }
  | { readonly type: 'Mucked'; readonly seat: number }
  | {
      readonly type: 'PotAwarded';
      readonly potIndex: number;
      readonly amount: number;
      readonly winners: readonly { readonly seat: number; readonly amount: number }[];
      /** Winning hand value, or null when the pot was won without a showdown. */
      readonly value: HandValue | null;
      /** The five cards that make the winning hand (first winner), or null without showdown. */
      readonly bestFive: readonly Card[] | null;
    }
  | { readonly type: 'CardsShown'; readonly seat: number; readonly cards: readonly Card[] }
  | { readonly type: 'PlayerEliminated'; readonly seat: number; readonly place: number }
  | {
      readonly type: 'HandEnded';
      readonly handNumber: number;
      readonly stacks: readonly number[];
    }
  | { readonly type: 'GameEnded'; readonly winner: number };

/** Hides other players' hole cards from an event before it reaches `viewerSeat`. */
export function redactEvent(event: EngineEvent, viewerSeat: number | null): EngineEvent {
  if (event.type === 'HoleCardDealt' && event.seat !== viewerSeat) {
    return { ...event, card: null };
  }
  return event;
}

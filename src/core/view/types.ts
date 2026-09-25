import type { Card } from '../cards/index.ts';

/**
 * Public contract between the engine and its consumers (UI, AI). It lives outside
 * `src/core/engine` so that `src/ai` can import it without reaching engine internals
 * (AGENTS.md §8.1, ADR-003). Everything here is plain data and JSON-serializable.
 */

export type Street = 'preflop' | 'flop' | 'turn' | 'river';

export type PositionLabel = 'BTN' | 'SB' | 'BB' | 'UTG' | 'UTG+1' | 'MP' | 'LJ' | 'HJ' | 'CO';

/** An action a player asks the engine to take. Bet and raise amounts are "to" street totals. */
export type PlayerAction =
  | { readonly type: 'fold' }
  | { readonly type: 'check' }
  | { readonly type: 'call' }
  | { readonly type: 'bet'; readonly to: number }
  | { readonly type: 'raise'; readonly to: number }
  | { readonly type: 'allIn' };

/** What the engine recorded after validating an action. */
export type ActionKind = 'fold' | 'check' | 'call' | 'bet' | 'raise';

export interface ActionRecord {
  readonly seat: number;
  readonly street: Street;
  readonly kind: ActionKind;
  /** Chips put in by this action. */
  readonly amount: number;
  /** The player's total commitment on this street after the action. */
  readonly to: number;
  readonly allIn: boolean;
}

/** Legal options for the player to act. Amounts are street totals ("to"). */
export interface LegalActions {
  readonly seat: number;
  readonly canFold: boolean;
  readonly canCheck: boolean;
  /** Chips needed to call (0 when checking is possible). A call for less is all-in. */
  readonly callAmount: number;
  readonly canBet: boolean;
  readonly canRaise: boolean;
  /** Smallest legal bet/raise target, or null when neither is possible. */
  readonly minTo: number | null;
  /** Largest legal bet/raise target (the all-in total), or null when neither is possible. */
  readonly maxTo: number | null;
  /** The player's all-in total for the street (`committed + stack`). */
  readonly allInTo: number;
}

export type SeatStatus = 'active' | 'folded' | 'allIn' | 'sittingOut' | 'eliminated';

export interface PublicSeat {
  readonly seat: number;
  readonly name: string;
  readonly stack: number;
  readonly status: SeatStatus;
  /** Chips put in on the current street. */
  readonly committed: number;
  /** Chips put in during the whole hand. */
  readonly committedTotal: number;
  readonly position: PositionLabel | null;
  /** Hole cards that are public (shown at showdown, all-in runout or voluntarily). */
  readonly shownCards: readonly Card[] | null;
  readonly hasCards: boolean;
}

export interface PublicPot {
  readonly amount: number;
  readonly eligibleSeats: readonly number[];
}

export interface ShownHand {
  readonly handNumber: number;
  readonly seat: number;
  readonly cards: readonly Card[];
}

/**
 * Everything a player in `seat` is entitled to know (AGENTS.md §8.1): their own hole cards,
 * the board, all public actions, stacks, pots, blinds, button, and every card shown publicly
 * earlier in this game. Never the deck, never other players' hidden cards.
 */
export interface PlayerView {
  readonly seat: number;
  readonly handNumber: number;
  readonly street: Street | null;
  readonly holeCards: readonly Card[] | null;
  readonly board: readonly Card[];
  readonly button: number;
  readonly smallBlindSeat: number;
  readonly bigBlindSeat: number;
  readonly smallBlind: number;
  readonly bigBlind: number;
  readonly seats: readonly PublicSeat[];
  readonly playersDealt: number;
  readonly pots: readonly PublicPot[];
  readonly currentBet: number;
  readonly minRaise: number;
  readonly toAct: number | null;
  /** Present only when it is this player's turn. */
  readonly legal: LegalActions | null;
  readonly actions: readonly ActionRecord[];
  readonly shownHands: readonly ShownHand[];
}

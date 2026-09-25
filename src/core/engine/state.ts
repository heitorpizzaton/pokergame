import type { Card } from '../cards/index.ts';
import type { ActionRecord, PublicPot, ShownHand, Street } from '../view/index.ts';

export interface PlayerConfig {
  readonly name: string;
  /** Muck losing hands at showdown instead of showing them (docs/RULES.md §7). */
  readonly autoMuck?: boolean;
}

export interface GameConfig {
  readonly players: readonly PlayerConfig[];
  readonly startingStack: number;
  readonly smallBlind: number;
  readonly bigBlind: number;
}

export interface SeatState {
  readonly name: string;
  stack: number;
  autoMuck: boolean;
  eliminated: boolean;
  /** Finishing place (1 = winner), set when eliminated or when the game ends. */
  place: number | null;
}

export interface HandPlayer {
  readonly seat: number;
  readonly holeCards: Card[];
  readonly startStack: number;
  folded: boolean;
  allIn: boolean;
  /** Chips put in on the current street. */
  committed: number;
  /** Chips put in during the whole hand. */
  committedTotal: number;
  /** Has taken a voluntary action on this street (posting a blind does not count). */
  hasActed: boolean;
  /** The current bet right after this player's last action on this street. */
  lastActedBet: number;
  /** Hole cards are public (showdown, all-in runout or voluntary show). */
  shown: boolean;
}

export type HandPhase = 'betting' | 'complete';

export interface HandState {
  readonly number: number;
  readonly button: number;
  readonly smallBlindSeat: number;
  readonly bigBlindSeat: number;
  /** Private: the shuffled deck. Never leaves the engine except through dealt cards. */
  readonly deck: Card[];
  deckPosition: number;
  /** Indexed by seat; null for seats not dealt in. */
  readonly players: (HandPlayer | null)[];
  readonly board: Card[];
  street: Street;
  phase: HandPhase;
  currentBet: number;
  minRaise: number;
  toAct: number | null;
  riverAggressor: number | null;
  wentToShowdown: boolean;
  readonly actions: ActionRecord[];
  pots: PublicPot[];
}

export interface GameState {
  readonly config: GameConfig;
  readonly seats: SeatState[];
  handNumber: number;
  /** Button of the most recent hand, or null before the first hand. */
  button: number | null;
  /** Big blind of the most recent hand (heads-up transition rule). */
  lastBigBlind: number | null;
  hand: HandState | null;
  /** Every hand shown publicly during this game (available to all players). */
  readonly shownHands: ShownHand[];
  finished: boolean;
}

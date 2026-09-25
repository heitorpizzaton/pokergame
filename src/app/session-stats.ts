import type { Card } from '../core/cards/index.ts';
import type { EngineEvent } from '../core/engine/index.ts';
import { evaluate, type HandValue } from '../core/eval/index.ts';

/** The user's session statistics for the Summary screen (AGENTS.md §5.8). */
export interface SessionStats {
  readonly handsPlayed: number;
  readonly handsWon: number;
  readonly biggestPotWon: number;
  readonly bestHand: HandValue | null;
  /** Share of hands where the user voluntarily put chips in preflop. */
  readonly vpip: number;
  /** Share of hands where the user raised preflop. */
  readonly pfr: number;
  readonly startedAt: number;
}

export interface SavedStats {
  readonly handsPlayed: number;
  readonly handsWon: number;
  readonly biggestPotWon: number;
  readonly bestHand: HandValue | null;
  readonly vpipHands: number;
  readonly pfrHands: number;
}

/**
 * Accumulates the user's statistics from engine events. The user's own hole cards and the board
 * are passed in at hand end (they are public to the user), so the tracker never needs hidden
 * information.
 */
export class SessionStatsTracker {
  readonly #seat: number;
  readonly #startedAt: number;
  #handsPlayed = 0;
  #handsWon = 0;
  #biggestPotWon = 0;
  #bestHand: HandValue | null = null;
  #vpipHands = 0;
  #pfrHands = 0;
  #inHand = false;
  #vpip = false;
  #pfr = false;
  #won = 0;
  #folded = false;

  constructor(userSeat: number, startedAt: number, saved?: SavedStats) {
    this.#seat = userSeat;
    this.#startedAt = startedAt;
    if (saved) {
      this.#handsPlayed = saved.handsPlayed;
      this.#handsWon = saved.handsWon;
      this.#biggestPotWon = saved.biggestPotWon;
      this.#bestHand = saved.bestHand;
      this.#vpipHands = saved.vpipHands;
      this.#pfrHands = saved.pfrHands;
    }
  }

  /** Raw counters for autosave. */
  save(): SavedStats {
    return {
      handsPlayed: this.#handsPlayed,
      handsWon: this.#handsWon,
      biggestPotWon: this.#biggestPotWon,
      bestHand: this.#bestHand,
      vpipHands: this.#vpipHands,
      pfrHands: this.#pfrHands,
    };
  }

  /** Feeds events; `userHole` and `board` are the user's cards at the time (for best hand). */
  record(
    events: readonly EngineEvent[],
    userHole: readonly Card[] | null,
    board: readonly Card[],
  ): void {
    for (const e of events) {
      switch (e.type) {
        case 'HandStarted':
          this.#inHand = e.seats.includes(this.#seat);
          this.#vpip = false;
          this.#pfr = false;
          this.#won = 0;
          this.#folded = false;
          if (this.#inHand) this.#handsPlayed++;
          break;
        case 'ActionTaken':
          if (e.action.seat !== this.#seat) break;
          if (e.action.kind === 'fold') this.#folded = true;
          if (e.action.street === 'preflop') {
            if (e.action.kind === 'call' || e.action.kind === 'bet' || e.action.kind === 'raise') {
              this.#vpip = true;
            }
            if (e.action.kind === 'bet' || e.action.kind === 'raise') this.#pfr = true;
          }
          break;
        case 'PotAwarded':
          for (const w of e.winners) if (w.seat === this.#seat) this.#won += w.amount;
          break;
        case 'HandEnded':
          if (!this.#inHand) break;
          if (this.#vpip) this.#vpipHands++;
          if (this.#pfr) this.#pfrHands++;
          if (this.#won > 0) {
            this.#handsWon++;
            this.#biggestPotWon = Math.max(this.#biggestPotWon, this.#won);
          }
          if (!this.#folded && userHole?.length === 2 && board.length === 5) {
            const value = evaluate([...userHole, ...board]);
            if (this.#bestHand === null || value > this.#bestHand) this.#bestHand = value;
          }
          this.#inHand = false;
          break;
        default:
          break;
      }
    }
  }

  snapshot(): SessionStats {
    const hands = Math.max(1, this.#handsPlayed);
    return {
      handsPlayed: this.#handsPlayed,
      handsWon: this.#handsWon,
      biggestPotWon: this.#biggestPotWon,
      bestHand: this.#bestHand,
      vpip: this.#handsPlayed === 0 ? 0 : this.#vpipHands / hands,
      pfr: this.#handsPlayed === 0 ? 0 : this.#pfrHands / hands,
      startedAt: this.#startedAt,
    };
  }
}

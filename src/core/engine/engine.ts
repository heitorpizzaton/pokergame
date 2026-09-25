import { type Card, shuffledDeck } from '../cards/index.ts';
import { bestFive, evaluate, type HandValue } from '../eval/index.ts';
import type { Rng } from '../rng/index.ts';
import type {
  ActionKind,
  LegalActions,
  PlayerAction,
  PlayerView,
  PositionLabel,
  PublicSeat,
  Street,
} from '../view/index.ts';
import { EngineError } from './errors.ts';
import type { EngineEvent } from './events.ts';
import { positionLabelsFromButton } from './positions.ts';
import { buildPots, splitPot } from './pots.ts';
import type { GameConfig, GameState, HandPlayer, HandState, SeatState } from './state.ts';

export type EngineCommand =
  | { readonly type: 'startHand' }
  | { readonly type: 'act'; readonly seat: number; readonly action: PlayerAction }
  | { readonly type: 'reveal'; readonly seat: number };

const NEXT_STREET: Readonly<Record<Street, Street | null>> = {
  preflop: 'flop',
  flop: 'turn',
  turn: 'river',
  river: null,
};

const STREET_CARDS: Readonly<Record<Street, number>> = { preflop: 0, flop: 3, turn: 1, river: 1 };

/**
 * No-Limit Texas Hold'em freezeout table (docs/RULES.md). A deterministic state machine: given
 * the same RNG sequence and the same commands it produces the same states and events. Its only
 * side effect is the list of events each {@link dispatch} returns.
 */
export class PokerEngine {
  readonly #state: GameState;
  readonly #rng: Rng;

  private constructor(state: GameState, rng: Rng) {
    this.#state = state;
    this.#rng = rng;
  }

  /** Creates a new game. `rng` shuffles every deck and picks the initial button. */
  static create(config: GameConfig, rng: Rng): PokerEngine {
    validateConfig(config);
    const seats: SeatState[] = config.players.map((p) => ({
      name: p.name,
      stack: config.startingStack,
      autoMuck: p.autoMuck ?? true,
      eliminated: false,
      place: null,
    }));
    const state: GameState = {
      config: structuredClone(config),
      seats,
      handNumber: 0,
      button: null,
      lastBigBlind: null,
      hand: null,
      shownHands: [],
      finished: false,
    };
    return new PokerEngine(state, rng);
  }

  /**
   * Restores a game saved with {@link snapshot}. Snapshots are always taken between hands, so
   * no deck is ever stored (AGENTS.md §5.8).
   */
  static restore(snapshot: GameState, rng: Rng): PokerEngine {
    if (snapshot.hand !== null) {
      throw new EngineError('InvalidSnapshot', 'Snapshots must be taken between hands');
    }
    validateConfig(snapshot.config);
    const total = snapshot.seats.reduce((sum, s) => sum + s.stack, 0);
    const expected = snapshot.config.startingStack * snapshot.config.players.length;
    if (total !== expected || snapshot.seats.length !== snapshot.config.players.length) {
      throw new EngineError('InvalidSnapshot', 'Snapshot chip total does not match the config');
    }
    return new PokerEngine(structuredClone(snapshot), rng);
  }

  /** The full internal state, including the private deck. For tests and the engine owner only. */
  get state(): Readonly<GameState> {
    return this.#state;
  }

  get isHandInProgress(): boolean {
    return this.#state.hand?.phase === 'betting';
  }

  get isFinished(): boolean {
    return this.#state.finished;
  }

  /** JSON-serializable save taken between hands (the completed hand, and its deck, are dropped). */
  snapshot(): GameState {
    if (this.isHandInProgress) {
      throw new EngineError('HandInProgress', 'Cannot snapshot during a hand');
    }
    return structuredClone({ ...this.#state, hand: null });
  }

  dispatch(command: EngineCommand): EngineEvent[] {
    const events: EngineEvent[] = [];
    switch (command.type) {
      case 'startHand':
        this.#startHand(events);
        break;
      case 'act':
        this.#act(command.seat, command.action, events);
        break;
      case 'reveal':
        this.#reveal(command.seat, events);
        break;
    }
    return events;
  }

  /** Legal options for `seat`, or null when it is not that seat's turn. */
  legalActions(seat: number): LegalActions | null {
    const hand = this.#state.hand;
    if (hand?.phase !== 'betting' || hand.toAct !== seat) return null;
    const p = this.#player(seat);
    const target = this.#targetFor(p);
    const toCall = Math.max(0, target - p.committed);
    const stack = this.#seat(seat).stack;
    const allInTo = p.committed + stack;
    const othersCanRespond = this.#othersCanAct(p.seat);
    const raiseRights = !p.hasActed || hand.currentBet - p.lastActedBet >= hand.minRaise;

    let canBet = false;
    let canRaise = false;
    let minTo: number | null = null;
    let maxTo: number | null = null;
    if (hand.currentBet === 0) {
      canBet = stack > 0 && othersCanRespond;
      if (canBet) {
        minTo = Math.min(this.#state.config.bigBlind, allInTo);
        maxTo = allInTo;
      }
    } else {
      canRaise = raiseRights && othersCanRespond && allInTo > hand.currentBet && toCall < stack;
      if (canRaise) {
        minTo = Math.min(hand.currentBet + hand.minRaise, allInTo);
        maxTo = allInTo;
      }
    }
    return {
      seat,
      canFold: toCall > 0,
      canCheck: toCall === 0,
      callAmount: Math.min(toCall, stack),
      canBet,
      canRaise,
      minTo,
      maxTo,
      allInTo,
    };
  }

  /** What `seat` is entitled to know (AGENTS.md §8.1). */
  viewFor(seat: number): PlayerView {
    const state = this.#state;
    const hand = state.hand;
    const config = state.config;
    const labels = hand ? this.#positionsBySeat(hand) : new Map<number, never>();
    const seats: PublicSeat[] = state.seats.map((s, i) => {
      const p = hand?.players[i] ?? null;
      return {
        seat: i,
        name: s.name,
        stack: s.stack,
        status: s.eliminated
          ? 'eliminated'
          : p === null
            ? 'sittingOut'
            : p.folded
              ? 'folded'
              : p.allIn
                ? 'allIn'
                : 'active',
        committed: p?.committed ?? 0,
        committedTotal: p?.committedTotal ?? 0,
        position: labels.get(i) ?? null,
        shownCards: p?.shown ? [...p.holeCards] : null,
        hasCards: p !== null && !p.folded,
      };
    });
    const own = hand?.players[seat] ?? null;
    return {
      seat,
      handNumber: state.handNumber,
      street: hand?.street ?? null,
      holeCards: own ? [...own.holeCards] : null,
      board: hand ? [...hand.board] : [],
      button: hand?.button ?? state.button ?? 0,
      smallBlindSeat: hand?.smallBlindSeat ?? -1,
      bigBlindSeat: hand?.bigBlindSeat ?? -1,
      smallBlind: config.smallBlind,
      bigBlind: config.bigBlind,
      seats,
      playersDealt: hand ? hand.players.filter((p) => p !== null).length : 0,
      pots: hand ? hand.pots.map((p) => ({ ...p, eligibleSeats: [...p.eligibleSeats] })) : [],
      currentBet: hand?.currentBet ?? 0,
      minRaise: hand?.minRaise ?? config.bigBlind,
      toAct: hand?.phase === 'betting' ? hand.toAct : null,
      legal: this.legalActions(seat),
      actions: hand ? hand.actions.map((a) => ({ ...a })) : [],
      shownHands: state.shownHands.map((h) => ({ ...h, cards: [...h.cards] })),
    };
  }

  /**
   * The community cards that would have been dealt had the hand continued, taken from the
   * actual remaining deck with burns respected (AGENTS.md §10.1). Available only after a hand
   * that ended before the river without a showdown.
   */
  rabbitHunt(): Card[] | null {
    const hand = this.#state.hand;
    if (hand?.phase !== 'complete' || hand.wentToShowdown || hand.board.length >= 5) return null;
    const cards: Card[] = [];
    let position = hand.deckPosition;
    for (let street = NEXT_STREET[hand.street]; street !== null; street = NEXT_STREET[street]) {
      position++; // burn
      for (let i = 0; i < STREET_CARDS[street]; i++) cards.push(hand.deck[position++] as Card);
    }
    return cards;
  }

  // ---------------------------------------------------------------------------------------
  // Hand lifecycle

  #startHand(events: EngineEvent[]): void {
    const state = this.#state;
    if (state.finished) throw new EngineError('GameOver', 'The game is over');
    if (this.isHandInProgress) throw new EngineError('HandInProgress', 'A hand is in progress');
    const active = (s: number): boolean => !(state.seats[s] as SeatState).eliminated;

    let button =
      state.button === null ? this.#randomActiveSeat() : this.#nextSeat(state.button, active);
    let smallBlindSeat: number;
    let bigBlindSeat: number;
    const activeCount = state.seats.filter((s) => !s.eliminated).length;
    if (activeCount === 2) {
      let other = this.#nextSeat(button, active);
      // Transition to heads-up: never make the same player post the big blind twice in a row
      // when it can be avoided (docs/RULES.md §2).
      if (other === state.lastBigBlind) [button, other] = [other, button];
      smallBlindSeat = button;
      bigBlindSeat = other;
    } else {
      smallBlindSeat = this.#nextSeat(button, active);
      bigBlindSeat = this.#nextSeat(smallBlindSeat, active);
    }

    state.handNumber++;
    state.button = button;
    state.lastBigBlind = bigBlindSeat;

    const deck = shuffledDeck(this.#rng);
    const players: (HandPlayer | null)[] = state.seats.map((s, seat) =>
      s.eliminated
        ? null
        : {
            seat,
            holeCards: [],
            startStack: s.stack,
            folded: false,
            allIn: false,
            committed: 0,
            committedTotal: 0,
            hasActed: false,
            lastActedBet: 0,
            shown: false,
          },
    );
    const hand: HandState = {
      number: state.handNumber,
      button,
      smallBlindSeat,
      bigBlindSeat,
      deck,
      deckPosition: 0,
      players,
      board: [],
      street: 'preflop',
      phase: 'betting',
      currentBet: state.config.bigBlind,
      minRaise: state.config.bigBlind,
      toAct: null,
      riverAggressor: null,
      wentToShowdown: false,
      actions: [],
      pots: [],
    };
    state.hand = hand;

    events.push({
      type: 'HandStarted',
      handNumber: hand.number,
      button,
      smallBlindSeat,
      bigBlindSeat,
      seats: players.filter((p) => p !== null).map((p) => p.seat),
      stacks: state.seats.map((s) => s.stack),
    });
    this.#postBlind(smallBlindSeat, 'small', state.config.smallBlind, events);
    this.#postBlind(bigBlindSeat, 'big', state.config.bigBlind, events);

    // Deal one card at a time starting left of the button, two rounds (docs/RULES.md §4).
    const order = this.#seatsFrom(this.#nextSeat(button, active), active);
    for (const round of [0, 1] as const) {
      for (const seat of order) {
        const card = deck[hand.deckPosition++] as Card;
        this.#player(seat).holeCards.push(card);
        events.push({ type: 'HoleCardDealt', seat, round, card });
      }
    }

    this.#advance(this.#nextSeat(bigBlindSeat, active), events);
  }

  #postBlind(seat: number, blind: 'small' | 'big', size: number, events: EngineEvent[]): void {
    const p = this.#player(seat);
    const seatState = this.#seat(seat);
    const amount = Math.min(size, seatState.stack);
    this.#commit(p, amount);
    events.push({ type: 'BlindPosted', seat, blind, amount, allIn: p.allIn });
  }

  #act(seat: number, action: PlayerAction, events: EngineEvent[]): void {
    const hand = this.#state.hand;
    if (hand?.phase !== 'betting') throw new EngineError('NoHandInProgress', 'No hand in progress');
    if (hand.toAct !== seat) throw new EngineError('NotYourTurn', `It is not seat ${seat}'s turn`);
    const legal = this.legalActions(seat);
    if (!legal) throw new EngineError('NotYourTurn', `It is not seat ${seat}'s turn`);
    const p = this.#player(seat);

    let kind: ActionKind;
    let to: number;
    switch (action.type) {
      case 'fold':
        if (!legal.canFold) {
          throw new EngineError('FoldWhenCheckAvailable', 'Cannot fold when checking is free');
        }
        kind = 'fold';
        to = p.committed;
        break;
      case 'check':
        if (!legal.canCheck) throw new EngineError('IllegalAction', 'Cannot check facing a bet');
        kind = 'check';
        to = p.committed;
        break;
      case 'call':
        if (legal.canCheck)
          throw new EngineError('IllegalAction', 'Nothing to call; check instead');
        kind = 'call';
        to = p.committed + legal.callAmount;
        break;
      case 'bet':
      case 'raise': {
        const allowed = action.type === 'bet' ? legal.canBet : legal.canRaise;
        if (!allowed || legal.minTo === null || legal.maxTo === null) {
          throw new EngineError('IllegalAction', `Cannot ${action.type} now`);
        }
        if (
          !Number.isSafeInteger(action.to) ||
          action.to < legal.minTo ||
          action.to > legal.maxTo
        ) {
          throw new EngineError(
            'InvalidAmount',
            `${action.type} must be an integer from ${legal.minTo} to ${legal.maxTo}`,
          );
        }
        kind = action.type;
        to = action.to;
        break;
      }
      case 'allIn': {
        if (this.#seat(seat).stack === 0) throw new EngineError('IllegalAction', 'No chips left');
        if (legal.allInTo <= p.committed + legal.callAmount && !legal.canCheck) {
          kind = 'call';
          to = legal.allInTo;
        } else if (legal.canBet) {
          kind = 'bet';
          to = legal.allInTo;
        } else if (legal.canRaise) {
          kind = 'raise';
          to = legal.allInTo;
        } else {
          throw new EngineError(
            'IllegalAction',
            'Going all-in would be a raise that is not allowed',
          );
        }
        break;
      }
    }

    const before = p.committed;
    if (kind === 'fold') {
      p.folded = true;
    } else if (to > before) {
      this.#commit(p, to - before);
    }
    if (kind === 'bet' || kind === 'raise') {
      const increase = to - hand.currentBet;
      if (increase >= hand.minRaise) hand.minRaise = increase;
      hand.currentBet = to;
      if (hand.street === 'river') hand.riverAggressor = seat;
    }
    p.hasActed = true;
    p.lastActedBet = hand.currentBet;

    const record = {
      seat,
      street: hand.street,
      kind,
      amount: p.committed - before,
      to: p.committed,
      allIn: p.allIn,
    };
    hand.actions.push(record);
    events.push({ type: 'ActionTaken', action: record });

    this.#advance(
      this.#nextSeat(seat, () => true),
      events,
    );
  }

  /**
   * Moves the hand forward after blinds or an action: finds the next player to act, or closes
   * the betting round and deals, runs out, shows down or awards as needed.
   */
  #advance(searchFrom: number, events: EngineEvent[]): void {
    const hand = this.#hand();
    for (;;) {
      if (this.#liveCount() === 1) {
        this.#returnUncalled(events);
        this.#collect(events);
        this.#award(events);
        return;
      }
      const next = this.#findNextToAct(searchFrom);
      if (next !== null) {
        hand.toAct = next;
        events.push({ type: 'TurnStarted', seat: next });
        return;
      }
      // Betting round complete.
      hand.toAct = null;
      this.#returnUncalled(events);
      this.#collect(events);
      const nextStreet = NEXT_STREET[hand.street];
      if (this.#actorCount() <= 1) {
        this.#revealForRunout(events);
        while (hand.board.length < 5) {
          const street = NEXT_STREET[hand.street];
          if (street === null) break;
          this.#dealStreet(street, events);
        }
        this.#showdown(events);
        return;
      }
      if (nextStreet === null) {
        this.#showdown(events);
        return;
      }
      this.#dealStreet(nextStreet, events);
      searchFrom = this.#nextSeat(hand.button, () => true);
    }
  }

  #dealStreet(street: Street, events: EngineEvent[]): void {
    const hand = this.#hand();
    hand.deckPosition++; // burn
    events.push({ type: 'CardBurned', street });
    const cards: Card[] = [];
    for (let i = 0; i < STREET_CARDS[street]; i++) {
      cards.push(hand.deck[hand.deckPosition++] as Card);
    }
    hand.board.push(...cards);
    hand.street = street;
    hand.currentBet = 0;
    hand.minRaise = this.#state.config.bigBlind;
    for (const p of hand.players) {
      if (!p) continue;
      p.committed = 0;
      p.hasActed = false;
      p.lastActedBet = 0;
    }
    events.push({ type: 'StreetDealt', street, cards });
  }

  /** Returns the part of the top bet on this street that no one else matched. */
  #returnUncalled(events: EngineEvent[]): void {
    const hand = this.#hand();
    const players = hand.players.filter((p) => p !== null);
    let top: HandPlayer | null = null;
    let second = 0;
    for (const p of players) {
      if (!top || p.committed > top.committed) {
        if (top) second = Math.max(second, top.committed);
        top = p;
      } else {
        second = Math.max(second, p.committed);
      }
    }
    if (!top || top.committed <= second) return;
    const excess = top.committed - second;
    top.committed -= excess;
    top.committedTotal -= excess;
    this.#seat(top.seat).stack += excess;
    top.allIn = false;
    hand.currentBet = Math.min(hand.currentBet, top.committed);
    events.push({ type: 'UncalledBetReturned', seat: top.seat, amount: excess });
  }

  #collect(events: EngineEvent[]): void {
    const hand = this.#hand();
    hand.pots = buildPots(
      hand.players
        .filter((p) => p !== null)
        .map((p) => ({ seat: p.seat, amount: p.committedTotal, folded: p.folded })),
    );
    events.push({ type: 'PotsUpdated', pots: hand.pots });
  }

  #revealForRunout(events: EngineEvent[]): void {
    const hand = this.#hand();
    const hands: { seat: number; cards: Card[] }[] = [];
    for (const seat of this.#seatsFrom(
      this.#nextSeat(hand.button, () => true),
      () => true,
    )) {
      const p = hand.players[seat];
      if (!p || p.folded || p.shown) continue;
      p.shown = true;
      hands.push({ seat, cards: [...p.holeCards] });
      this.#state.shownHands.push({ handNumber: hand.number, seat, cards: [...p.holeCards] });
    }
    if (hands.length > 0) events.push({ type: 'HandsRevealed', hands });
  }

  #showdown(events: EngineEvent[]): void {
    const hand = this.#hand();
    hand.wentToShowdown = true;
    const live = hand.players.filter((p): p is HandPlayer => p !== null && !p.folded);
    const values = new Map<number, HandValue>();
    for (const p of live) values.set(p.seat, evaluate([...p.holeCards, ...hand.board]));

    // Show order (docs/RULES.md §7).
    const first =
      hand.riverAggressor !== null && !this.#player(hand.riverAggressor).folded
        ? hand.riverAggressor
        : this.#nextSeat(hand.button, (s) => {
            const p = hand.players[s];
            return p !== null && p !== undefined && !p.folded;
          });
    const order = this.#seatsFrom(first, (s) => {
      const p = hand.players[s];
      return p !== null && p !== undefined && !p.folded;
    });

    // Best value shown so far, per pot.
    const bestShown = hand.pots.map(() => -1);
    for (const seat of order) {
      const p = this.#player(seat);
      const value = values.get(seat) as HandValue;
      let canWinSomething = false;
      hand.pots.forEach((pot, i) => {
        if (pot.eligibleSeats.includes(seat) && value >= (bestShown[i] as number)) {
          canWinSomething = true;
        }
      });
      const mustShow = p.shown || canWinSomething || !this.#seat(seat).autoMuck;
      if (mustShow) {
        hand.pots.forEach((pot, i) => {
          if (pot.eligibleSeats.includes(seat) && value > (bestShown[i] as number)) {
            bestShown[i] = value;
          }
        });
        if (!p.shown) {
          p.shown = true;
          this.#state.shownHands.push({
            handNumber: hand.number,
            seat,
            cards: [...p.holeCards],
          });
        }
        events.push({ type: 'Showdown', seat, cards: [...p.holeCards], value });
      } else {
        events.push({ type: 'Mucked', seat });
      }
    }
    this.#award(events, values);
  }

  #award(events: EngineEvent[], values?: ReadonlyMap<number, HandValue>): void {
    const hand = this.#hand();
    const state = this.#state;
    hand.pots.forEach((pot, potIndex) => {
      let winners: number[];
      let best: HandValue | null = null;
      if (values && pot.eligibleSeats.length > 1) {
        for (const seat of pot.eligibleSeats) {
          const v = values.get(seat) as HandValue;
          if (best === null || v > best) best = v;
        }
        winners = pot.eligibleSeats.filter((s) => values.get(s) === best);
      } else {
        winners = [...pot.eligibleSeats];
        if (values && winners.length === 1) best = values.get(winners[0] as number) ?? null;
      }
      const shares = splitPot(pot.amount, winners, hand.button, state.seats.length);
      for (const share of shares) this.#seat(share.seat).stack += share.amount;
      const firstWinner = this.#player(winners[0] as number);
      events.push({
        type: 'PotAwarded',
        potIndex,
        amount: pot.amount,
        winners: shares,
        value: best,
        bestFive:
          best === null ? null : [...bestFive([...firstWinner.holeCards, ...hand.board]).cards],
      });
    });
    this.#finishHand(events);
  }

  #finishHand(events: EngineEvent[]): void {
    const state = this.#state;
    const hand = this.#hand();
    hand.phase = 'complete';
    hand.toAct = null;

    const busted = hand.players
      .filter((p) => p !== null && this.#seat(p.seat).stack === 0)
      .map((p) => p as HandPlayer);
    const remainingBefore = state.seats.filter((s) => !s.eliminated).length;
    // Bigger starting stack finishes higher; equal starting stacks share the better place.
    busted.sort((a, b) => b.startStack - a.startStack);
    const placeBase = remainingBefore - busted.length + 1;
    busted.forEach((p, i) => {
      const tiedWith = busted.findIndex((q) => q.startStack === p.startStack);
      const place = placeBase + (tiedWith >= 0 ? tiedWith : i);
      const seat = this.#seat(p.seat);
      seat.eliminated = true;
      seat.place = place;
      events.push({ type: 'PlayerEliminated', seat: p.seat, place });
    });

    events.push({
      type: 'HandEnded',
      handNumber: hand.number,
      stacks: state.seats.map((s) => s.stack),
    });

    const remaining = state.seats.map((s, i) => ({ s, i })).filter(({ s }) => !s.eliminated);
    if (remaining.length === 1) {
      const winner = remaining[0] as { s: SeatState; i: number };
      winner.s.place = 1;
      state.finished = true;
      events.push({ type: 'GameEnded', winner: winner.i });
    }
  }

  #reveal(seat: number, events: EngineEvent[]): void {
    const hand = this.#state.hand;
    if (hand?.phase !== 'complete') {
      throw new EngineError('IllegalAction', 'Cards can be shown only after the hand ends');
    }
    const p = hand.players[seat];
    if (!p) throw new EngineError('IllegalAction', `Seat ${seat} was not dealt in`);
    if (p.shown) return;
    p.shown = true;
    this.#state.shownHands.push({ handNumber: hand.number, seat, cards: [...p.holeCards] });
    events.push({ type: 'CardsShown', seat, cards: [...p.holeCards] });
  }

  // ---------------------------------------------------------------------------------------
  // Helpers

  #commit(p: HandPlayer, amount: number): void {
    const seat = this.#seat(p.seat);
    seat.stack -= amount;
    p.committed += amount;
    p.committedTotal += amount;
    if (seat.stack === 0) p.allIn = true;
  }

  /** Amount `p` must reach on this street before the round can close. */
  #targetFor(p: HandPlayer): number {
    const hand = this.#hand();
    if (this.#othersCanAct(p.seat)) return hand.currentBet;
    // Only all-in opponents remain: match the largest of their commitments, not the nominal bet.
    let max = 0;
    for (const q of hand.players) {
      if (q && q.seat !== p.seat && !q.folded) max = Math.max(max, q.committed);
    }
    return Math.min(hand.currentBet, max);
  }

  #needsToAct(p: HandPlayer): boolean {
    if (p.folded || p.allIn) return false;
    if (p.committed < this.#targetFor(p)) return true;
    return !p.hasActed && this.#othersCanAct(p.seat);
  }

  #othersCanAct(seat: number): boolean {
    return this.#hand().players.some((q) => q && q.seat !== seat && !q.folded && !q.allIn);
  }

  #findNextToAct(from: number): number | null {
    const hand = this.#hand();
    const n = hand.players.length;
    for (let i = 0; i < n; i++) {
      const p = hand.players[(from + i) % n];
      if (p && this.#needsToAct(p)) return p.seat;
    }
    return null;
  }

  #liveCount(): number {
    return this.#hand().players.filter((p) => p && !p.folded).length;
  }

  #actorCount(): number {
    return this.#hand().players.filter((p) => p && !p.folded && !p.allIn).length;
  }

  #positionsBySeat(hand: HandState): Map<number, PositionLabel> {
    const dealt = (s: number): boolean => hand.players[s] !== null;
    const order = this.#seatsFrom(hand.button, dealt);
    const labels = positionLabelsFromButton(order.length);
    return new Map(order.map((seat, i) => [seat, labels[i] ?? 'BTN']));
  }

  #randomActiveSeat(): number {
    const active = this.#state.seats.map((s, i) => ({ s, i })).filter(({ s }) => !s.eliminated);
    return (active[this.#rng.int(active.length)] as { i: number }).i;
  }

  /** Next seat clockwise after `from` that satisfies `predicate`. */
  #nextSeat(from: number, predicate: (seat: number) => boolean): number {
    const n = this.#state.seats.length;
    for (let i = 1; i <= n; i++) {
      const seat = (from + i) % n;
      if (predicate(seat)) return seat;
    }
    throw new Error('No seat satisfies the predicate');
  }

  /** Seats satisfying `predicate`, clockwise, starting at `start` (included if it matches). */
  #seatsFrom(start: number, predicate: (seat: number) => boolean): number[] {
    const n = this.#state.seats.length;
    const seats: number[] = [];
    for (let i = 0; i < n; i++) {
      const seat = (start + i) % n;
      if (predicate(seat)) seats.push(seat);
    }
    return seats;
  }

  #hand(): HandState {
    const hand = this.#state.hand;
    if (!hand) throw new EngineError('NoHandInProgress', 'No hand in progress');
    return hand;
  }

  #player(seat: number): HandPlayer {
    const p = this.#hand().players[seat];
    if (!p) throw new EngineError('IllegalAction', `Seat ${seat} is not in the hand`);
    return p;
  }

  #seat(seat: number): SeatState {
    const s = this.#state.seats[seat];
    if (!s) throw new EngineError('IllegalAction', `No seat ${seat}`);
    return s;
  }
}

function validateConfig(config: GameConfig): void {
  const { players, startingStack, smallBlind, bigBlind } = config;
  const fail = (message: string): never => {
    throw new EngineError('InvalidConfig', message);
  };
  if (players.length < 2 || players.length > 9) fail('The table needs 2 to 9 players');
  for (const value of [startingStack, smallBlind, bigBlind]) {
    if (!Number.isSafeInteger(value)) fail('Chip amounts must be integers');
  }
  if (smallBlind < 1) fail('The small blind must be at least 1');
  if (bigBlind <= smallBlind) fail('The big blind must be larger than the small blind');
  if (startingStack < 10 * bigBlind) fail('The starting stack must be at least 10 big blinds');
}

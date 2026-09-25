import { describe, expect, it } from 'vitest';
import { orderedDeck } from '../../src/core/cards/index.ts';
import { EngineError, type EngineEvent, timeoutAction } from '../../src/core/engine/index.ts';
import {
  allIn,
  call,
  check,
  eventsOfType,
  fold,
  play,
  raise,
  bet,
  riggedTable,
  shuffleScript,
  stacks,
} from '../support/engine-harness.ts';

/**
 * Mandatory scenario tests (AGENTS.md §13.1). Blinds are 50/100 unless stated otherwise.
 * Every expected chip amount is worked out by hand in the comments.
 */

describe('BB option after limps', () => {
  // 4 players, button 0 → SB 1, BB 2, UTG 3.
  const setup = () => riggedTable({ stacks: [1000, 1000, 1000, 1000], button: 0 });

  it('lets the big blind check or raise when everyone limps', () => {
    const { engine } = setup();
    engine.dispatch({ type: 'startHand' });
    play(engine, [
      [3, call],
      [0, call],
      [1, call], // SB completes to 100
    ]);
    const legal = engine.legalActions(2);
    expect(legal).toMatchObject({ canCheck: true, canFold: false, canRaise: true, minTo: 200 });
    const events = play(engine, [[2, check]]);
    expect(eventsOfType(events, 'StreetDealt')[0]?.street).toBe('flop');
  });

  it('reopens the action for the limpers when the big blind raises', () => {
    const { engine } = setup();
    engine.dispatch({ type: 'startHand' });
    play(engine, [
      [3, call],
      [0, call],
      [1, call],
      [2, raise(300)],
    ]);
    expect(engine.state.hand?.toAct).toBe(3);
    expect(engine.legalActions(3)).toMatchObject({ callAmount: 200, canRaise: true, minTo: 500 });
  });
});

describe('short all-in does not reopen the betting', () => {
  // 3 players, button 0 (acts first preflop), SB 1, BB 2 with only 250 chips.
  it('lets players who already acted only call or fold', () => {
    const { engine } = riggedTable({ stacks: [2125, 2125, 250], button: 0 });
    engine.dispatch({ type: 'startHand' });
    play(engine, [
      [0, raise(200)], // full raise: minRaise = 100
      [1, call],
      [2, allIn], // to 250: +50, short of a full raise
    ]);
    const legal = engine.legalActions(0);
    expect(legal).toMatchObject({ canFold: true, callAmount: 50, canRaise: false, minTo: null });
    expect(() => play(engine, [[0, raise(400)]])).toThrow(EngineError);
    expect(() => play(engine, [[0, allIn]])).toThrow(EngineError);
    play(engine, [[0, call]]);
    expect(engine.legalActions(1)).toMatchObject({ callAmount: 50, canRaise: false });
    const events = play(engine, [[1, call]]);
    expect(eventsOfType(events, 'StreetDealt')[0]?.street).toBe('flop');
  });
});

describe('cumulative short all-ins reopen the betting', () => {
  // 4 players, button 0 → SB 1, BB 2, UTG 3.
  it('lets the original raiser re-raise once the increase reaches a full raise', () => {
    const { engine } = riggedTable({ stacks: [250, 300, 1000, 2450], button: 0 });
    engine.dispatch({ type: 'startHand' });
    play(engine, [
      [3, raise(200)], // full raise to 200, minRaise = 100
      [0, allIn], // BTN to 250: +50 (short)
    ]);
    // SB has not acted yet, so it may still raise.
    expect(engine.legalActions(1)).toMatchObject({ canRaise: true });
    play(engine, [
      [1, allIn], // SB to 300: +50 (short), 100 above what UTG last faced
      [2, call], // BB stays in with chips behind, so a re-raise can still be answered
    ]);
    expect(engine.legalActions(3)).toMatchObject({
      callAmount: 100,
      canRaise: true,
      minTo: 400,
    });
  });
});

describe('side pots', () => {
  // Blinds 25/50 so that the smaller average stacks still satisfy the 10 BB minimum.
  it('builds main and side pot for a 3-way all-in with different stacks', () => {
    // Button 0 acts first; contributions 300 / 700 / 700.
    const { engine } = riggedTable({
      stacks: [300, 700, 1100],
      smallBlind: 25,
      bigBlind: 50,
      button: 0,
      holes: { 0: 'AsAh', 1: 'KsKh', 2: 'QsQh' },
      board: '2c7d9hJc3d',
    });
    engine.dispatch({ type: 'startHand' });
    const events = play(engine, [
      [0, allIn],
      [1, allIn],
      [2, call],
    ]);
    const awards = eventsOfType(events, 'PotAwarded');
    expect(awards.map((a) => [a.amount, a.winners])).toEqual([
      [900, [{ seat: 0, amount: 900 }]], // main: 300 × 3
      [800, [{ seat: 1, amount: 800 }]], // side: 400 × 2
    ]);
    expect(stacks(engine)).toEqual([900, 800, 400]);
    expect(engine.state.hand?.board).toHaveLength(5);
  });

  it('ranks players eliminated in the same hand by starting stack', () => {
    const { engine } = riggedTable({
      stacks: [300, 700, 1100],
      smallBlind: 25,
      bigBlind: 50,
      button: 0,
      holes: { 0: 'KsKh', 1: 'QsQh', 2: 'AsAh' },
      board: '2c7d9hJc3d',
    });
    engine.dispatch({ type: 'startHand' });
    const events = play(engine, [
      [0, allIn],
      [1, allIn],
      [2, call],
    ]);
    expect(stacks(engine)).toEqual([0, 0, 2100]);
    expect(eventsOfType(events, 'PlayerEliminated')).toEqual([
      { type: 'PlayerEliminated', seat: 1, place: 2 },
      { type: 'PlayerEliminated', seat: 0, place: 3 },
    ]);
    expect(eventsOfType(events, 'GameEnded')).toEqual([{ type: 'GameEnded', winner: 2 }]);
    expect(engine.isFinished).toBe(true);
    expect(() => engine.dispatch({ type: 'startHand' })).toThrow(EngineError);
  });

  it('builds three layers for a 4-way all-in and returns the uncalled excess', () => {
    // Button 0 → SB 1, BB 2, UTG 3. Contributions 200 / 500 / 900 / 1600: the top 700 of
    // seat 3 is uncalled. Pots: 800 (all), 900 (1,2,3), 800 (2,3).
    const { engine } = riggedTable({
      stacks: [200, 500, 900, 1600],
      smallBlind: 25,
      bigBlind: 50,
      button: 0,
      holes: { 0: 'AsAh', 1: 'KsKh', 2: 'QsQh', 3: 'JsJh' },
      board: '2c7d9h4c3d',
    });
    engine.dispatch({ type: 'startHand' });
    const events = play(engine, [
      [3, allIn],
      [0, allIn],
      [1, allIn],
      [2, allIn],
    ]);
    expect(eventsOfType(events, 'UncalledBetReturned')).toEqual([
      { type: 'UncalledBetReturned', seat: 3, amount: 700 },
    ]);
    const pots = eventsOfType(events, 'PotsUpdated').at(-1)?.pots;
    expect(pots).toEqual([
      { amount: 800, eligibleSeats: [0, 1, 2, 3] },
      { amount: 900, eligibleSeats: [1, 2, 3] },
      { amount: 800, eligibleSeats: [2, 3] },
    ]);
    expect(stacks(engine)).toEqual([800, 900, 800, 700]);
  });
});

describe('odd chips', () => {
  it('gives the odd chip of a split pot to the first winner left of the button', () => {
    // Blinds 25/50, button 0. BTN raises to 100, SB folds (25 dead), BB calls: pot 225.
    // The board is a royal flush, so BTN and BB split: 112 and 113. The first seat left of the
    // button is the folded SB (1), so the odd chip goes to the BB (2).
    const { engine } = riggedTable({
      stacks: [1000, 1000, 1000],
      smallBlind: 25,
      bigBlind: 50,
      button: 0,
      board: 'AsKsQsJsTs',
    });
    engine.dispatch({ type: 'startHand' });
    const events = play(engine, [
      [0, raise(100)],
      [1, fold],
      [2, call],
      [2, check],
      [0, check],
      [2, check],
      [0, check],
      [2, check],
      [0, check],
    ]);
    const award = eventsOfType(events, 'PotAwarded')[0];
    expect(award?.amount).toBe(225);
    expect(award?.winners).toEqual([
      { seat: 2, amount: 113 },
      { seat: 0, amount: 112 },
    ]);
    expect(stacks(engine)).toEqual([1012, 975, 1013]);
  });
});

describe('uncalled bets', () => {
  it('returns an uncalled river bet to the bettor', () => {
    // Heads-up, button 0 = SB. Preflop: SB calls, BB checks. BB acts first postflop.
    const { engine } = riggedTable({ stacks: [1000, 1000], button: 0 });
    engine.dispatch({ type: 'startHand' });
    play(engine, [
      [0, call],
      [1, check],
      [1, check],
      [0, check],
      [1, check],
      [0, check],
    ]);
    const events = play(engine, [
      [1, bet(500)],
      [0, fold],
    ]);
    expect(eventsOfType(events, 'UncalledBetReturned')).toEqual([
      { type: 'UncalledBetReturned', seat: 1, amount: 500 },
    ]);
    expect(eventsOfType(events, 'PotAwarded')[0]).toMatchObject({ amount: 200, value: null });
    expect(stacks(engine)).toEqual([900, 1100]);
  });

  it('returns the part of an all-in that the caller could not cover', () => {
    const { engine } = riggedTable({
      stacks: [1700, 300],
      button: 0,
      holes: { 0: 'AsAh', 1: 'KsKh' },
      board: '2c7d9h4c3d',
    });
    engine.dispatch({ type: 'startHand' });
    const events = play(engine, [
      [0, allIn], // to 1700
      [1, call], // all-in for 300
    ]);
    expect(eventsOfType(events, 'UncalledBetReturned')).toEqual([
      { type: 'UncalledBetReturned', seat: 0, amount: 1400 },
    ]);
    expect(stacks(engine)).toEqual([2000, 0]);
  });
});

describe('blinds larger than a stack', () => {
  it('puts a short big blind all-in and still makes others call the full big blind', () => {
    // Button 0, SB 1, BB 2 with 60 chips.
    const { engine } = riggedTable({ stacks: [1470, 1470, 60], button: 0 });
    const start = engine.dispatch({ type: 'startHand' });
    expect(eventsOfType(start, 'BlindPosted')).toEqual([
      { type: 'BlindPosted', seat: 1, blind: 'small', amount: 50, allIn: false },
      { type: 'BlindPosted', seat: 2, blind: 'big', amount: 60, allIn: true },
    ]);
    expect(engine.legalActions(0)).toMatchObject({ callAmount: 100, minTo: 200 });
    const events = play(engine, [
      [0, call],
      [1, call],
    ]);
    expect(eventsOfType(events, 'PotsUpdated').at(-1)?.pots).toEqual([
      { amount: 180, eligibleSeats: [0, 1, 2] },
      { amount: 80, eligibleSeats: [0, 1] },
    ]);
    expect(eventsOfType(events, 'StreetDealt')[0]?.street).toBe('flop');
    expect(engine.state.hand?.toAct).toBe(1);
  });

  it('runs the board out when the small blind is all-in heads-up', () => {
    const { engine } = riggedTable({
      stacks: [30, 1970],
      button: 0,
      holes: { 0: 'AsAh', 1: 'KsKh' },
      board: '2c7d9h4c3d',
    });
    const events = engine.dispatch({ type: 'startHand' });
    expect(eventsOfType(events, 'BlindPosted')[0]).toMatchObject({ amount: 30, allIn: true });
    expect(eventsOfType(events, 'UncalledBetReturned')).toEqual([
      { type: 'UncalledBetReturned', seat: 1, amount: 70 },
    ]);
    expect(eventsOfType(events, 'HandsRevealed')).toHaveLength(1);
    expect(eventsOfType(events, 'StreetDealt').map((e) => e.street)).toEqual([
      'flop',
      'turn',
      'river',
    ]);
    expect(stacks(engine)).toEqual([60, 1940]);
  });
});

describe('everyone folds to the big blind', () => {
  it('awards the blinds to the big blind and returns its uncalled half', () => {
    const { engine } = riggedTable({ stacks: [1000, 1000, 1000, 1000], button: 0 });
    engine.dispatch({ type: 'startHand' });
    const events = play(engine, [
      [3, fold],
      [0, fold],
      [1, fold],
    ]);
    expect(eventsOfType(events, 'UncalledBetReturned')).toEqual([
      { type: 'UncalledBetReturned', seat: 2, amount: 50 },
    ]);
    expect(eventsOfType(events, 'PotAwarded')).toEqual([
      {
        type: 'PotAwarded',
        potIndex: 0,
        amount: 100,
        winners: [{ seat: 2, amount: 100 }],
        value: null,
        bestFive: null,
      },
    ]);
    expect(stacks(engine)).toEqual([1000, 950, 1050, 1000]);
  });
});

describe('heads-up transition', () => {
  it('moves the button so the previous big blind does not post it again (button busts)', () => {
    // Hand 1: button 0, SB 1, BB 2. Seat 0 busts. Without the rule, seat 1 would get the
    // button and seat 2 would post the big blind twice in a row.
    const { engine, rng } = riggedTable({
      stacks: [300, 1350, 1350],
      button: 0,
      holes: { 0: '7c2d', 2: 'AsAh' },
      board: '3c8d9hJcKd',
    });
    engine.dispatch({ type: 'startHand' });
    play(engine, [
      [0, allIn],
      [1, fold],
      [2, call],
    ]);
    expect(engine.state.seats[0]?.eliminated).toBe(true);
    rng.push(...shuffleScript(orderedDeck()));
    const started = eventsOfType(engine.dispatch({ type: 'startHand' }), 'HandStarted')[0];
    expect(started).toMatchObject({ button: 2, smallBlindSeat: 2, bigBlindSeat: 1 });
  });

  it('keeps the normal button move when it already avoids a double big blind (SB busts)', () => {
    const { engine, rng } = riggedTable({
      stacks: [1350, 300, 1350],
      button: 0,
      holes: { 1: '7c2d', 2: 'AsAh' },
      board: '3c8d9hJcKd',
    });
    engine.dispatch({ type: 'startHand' });
    play(engine, [
      [0, fold],
      [1, allIn],
      [2, call],
    ]);
    expect(engine.state.seats[1]?.eliminated).toBe(true);
    rng.push(...shuffleScript(orderedDeck()));
    const started = eventsOfType(engine.dispatch({ type: 'startHand' }), 'HandStarted')[0];
    expect(started).toMatchObject({ button: 2, smallBlindSeat: 2, bigBlindSeat: 0 });
  });
});

function showdownOrder(events: readonly EngineEvent[]): [string, number][] {
  return events.flatMap((e): [string, number][] =>
    e.type === 'Showdown' || e.type === 'Mucked' ? [[e.type, e.seat]] : [],
  );
}

describe('showdown order', () => {
  // 3 players, button 0, SB 1, BB 2. Seat 0 has AA, seat 1 KK, seat 2 QQ.
  const setup = (autoMuck = true) =>
    riggedTable({
      stacks: [1000, 1000, 1000],
      button: 0,
      holes: { 0: 'AsAh', 1: 'KsKh', 2: 'QsQh' },
      board: '2c7d9hJc3d',
      autoMuck,
    });
  const toRiver = [
    [0, call],
    [1, call],
    [2, check],
    [1, check],
    [2, check],
    [0, check],
    [1, check],
    [2, check],
    [0, check],
  ] as const;

  it('starts with the last river aggressor', () => {
    const { engine } = setup();
    engine.dispatch({ type: 'startHand' });
    play(engine, toRiver);
    const events = play(engine, [
      [1, check],
      [2, bet(100)],
      [0, call],
      [1, call],
    ]);
    const order = showdownOrder(events);
    expect(order).toEqual([
      ['Showdown', 2], // aggressor shows first (QQ)
      ['Showdown', 0], // AA beats it and must show
      ['Mucked', 1], // KK cannot win: mucked
    ]);
  });

  it('starts left of the button when the river is checked through', () => {
    const { engine } = setup();
    engine.dispatch({ type: 'startHand' });
    play(engine, toRiver);
    const events = play(engine, [
      [1, check],
      [2, check],
      [0, check],
    ]);
    const order = showdownOrder(events);
    expect(order).toEqual([
      ['Showdown', 1], // first left of the button (KK)
      ['Mucked', 2], // QQ cannot win: mucked
      ['Showdown', 0], // AA wins
    ]);
  });

  it('shows every hand when players do not auto-muck', () => {
    const { engine } = setup(false);
    engine.dispatch({ type: 'startHand' });
    play(engine, toRiver);
    const events = play(engine, [
      [1, check],
      [2, check],
      [0, check],
    ]);
    expect(eventsOfType(events, 'Showdown').map((e) => e.seat)).toEqual([1, 2, 0]);
    expect(eventsOfType(events, 'Mucked')).toEqual([]);
  });
});

describe('the user timing out', () => {
  it('checks when possible and folds otherwise', () => {
    const { engine } = riggedTable({ stacks: [1000, 1000, 1000, 1000], button: 0 });
    engine.dispatch({ type: 'startHand' });
    const facingBet = engine.legalActions(3);
    expect(facingBet && timeoutAction(facingBet)).toEqual({ type: 'fold' });
    play(engine, [
      [3, call],
      [0, call],
      [1, call],
    ]);
    const option = engine.legalActions(2);
    expect(option && timeoutAction(option)).toEqual({ type: 'check' });
  });
});

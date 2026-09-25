import { describe, expect, it } from 'vitest';
import { formatCards, parseCards } from '../../src/core/cards/index.ts';
import {
  EngineError,
  type EngineEvent,
  PokerEngine,
  positionLabelsFromButton,
  positionLabelsInActionOrder,
  redactEvent,
} from '../../src/core/engine/index.ts';
import { SeededRng } from '../../src/core/rng/seeded-rng.ts';
import {
  bet,
  call,
  check,
  eventsOfType,
  fold,
  play,
  raise,
  riggedTable,
  seatsLeftOf,
} from '../support/engine-harness.ts';

const config = (players: number, stack = 1000) => ({
  players: Array.from({ length: players }, (_, i) => ({ name: `P${i}` })),
  startingStack: stack,
  smallBlind: 50,
  bigBlind: 100,
});

function expectEngineError(fn: () => unknown, code: string): void {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(EngineError);
    expect((error as EngineError).code).toBe(code);
    return;
  }
  throw new Error(`Expected EngineError ${code}`);
}

describe('position labels (docs/RULES.md §3)', () => {
  it.each([
    [2, ['BTN', 'BB']],
    [3, ['BTN', 'SB', 'BB']],
    [4, ['UTG', 'BTN', 'SB', 'BB']],
    [5, ['UTG', 'CO', 'BTN', 'SB', 'BB']],
    [6, ['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB']],
    [7, ['UTG', 'LJ', 'HJ', 'CO', 'BTN', 'SB', 'BB']],
    [8, ['UTG', 'UTG+1', 'LJ', 'HJ', 'CO', 'BTN', 'SB', 'BB']],
    [9, ['UTG', 'UTG+1', 'MP', 'LJ', 'HJ', 'CO', 'BTN', 'SB', 'BB']],
  ])('%i players: %j in preflop order', (n, labels) => {
    expect(positionLabelsInActionOrder(n)).toEqual(labels);
    expect(new Set(positionLabelsFromButton(n)).size).toBe(n);
  });

  it('rejects impossible table sizes', () => {
    expect(() => positionLabelsFromButton(1)).toThrow(RangeError);
    expect(() => positionLabelsFromButton(10)).toThrow(RangeError);
  });
});

describe('button, blinds, dealing and action order for 2 to 9 players', () => {
  for (let n = 2; n <= 9; n++) {
    it(`${n} players`, () => {
      const button = n - 1;
      const { engine } = riggedTable({ stacks: new Array<number>(n).fill(1000), button });
      const events = engine.dispatch({ type: 'startHand' });
      const started = eventsOfType(events, 'HandStarted')[0];
      const sb = n === 2 ? button : 0;
      const bb = n === 2 ? 0 : 1;
      expect(started).toMatchObject({ button, smallBlindSeat: sb, bigBlindSeat: bb });

      // Dealing: one card at a time starting left of the button, two rounds.
      const all = Array.from({ length: n }, (_, i) => i);
      const order = seatsLeftOf(button, all, n);
      expect(eventsOfType(events, 'HoleCardDealt').map((e) => e.seat)).toEqual([
        ...order,
        ...order,
      ]);

      // Preflop: first to act is left of the big blind (the button heads-up).
      const firstPreflop = n === 2 ? button : (bb + 1) % n;
      expect(engine.state.hand?.toAct).toBe(firstPreflop);

      // Everyone calls, the big blind checks: postflop starts left of the button.
      let seat = firstPreflop;
      for (let i = 0; i < n; i++) {
        const legal = engine.legalActions(seat);
        play(engine, [[seat, legal?.canCheck ? check : call]]);
        seat = engine.state.hand?.toAct ?? -1;
        if (engine.state.hand?.street === 'flop') break;
      }
      expect(engine.state.hand?.street).toBe('flop');
      expect(engine.state.hand?.toAct).toBe(n === 2 ? bb : 0);

      // Position labels in the view follow the table.
      const view = engine.viewFor(0);
      expect(view.seats[button]?.position).toBe('BTN');
      expect(view.seats[bb]?.position).toBe('BB');
    });
  }

  it('picks the initial button uniformly with the injected RNG', () => {
    const counts = [0, 0, 0, 0];
    const rng = new SeededRng(99);
    for (let i = 0; i < 4000; i++) {
      const engine = PokerEngine.create(config(4), rng);
      const started = eventsOfType(engine.dispatch({ type: 'startHand' }), 'HandStarted')[0];
      const button = started?.button ?? 0;
      counts[button] = (counts[button] ?? 0) + 1;
    }
    for (const c of counts) expect(c).toBeGreaterThan(850);
  });

  it('moves the button one occupied seat clockwise each hand, skipping eliminated seats', () => {
    const { engine, rng } = riggedTable({ stacks: [1500, 0, 1500, 1500, 1500], button: 0 });
    const seed = new SeededRng(1);
    const buttons: number[] = [];
    for (let h = 0; h < 5; h++) {
      if (h > 0) rng.push(...Array.from({ length: 51 }, (_, k) => seed.int(52 - k)));
      const events = engine.dispatch({ type: 'startHand' });
      buttons.push(eventsOfType(events, 'HandStarted')[0]?.button ?? -1);
      // Fold around to the big blind.
      while (engine.isHandInProgress) {
        const seat = engine.state.hand?.toAct ?? -1;
        play(engine, [[seat, engine.legalActions(seat)?.canCheck ? check : fold]]);
      }
    }
    expect(buttons).toEqual([0, 2, 3, 4, 0]);
  });
});

describe('action validation', () => {
  const start = () => {
    const { engine } = riggedTable({ stacks: [1000, 1000, 1000], button: 0 });
    engine.dispatch({ type: 'startHand' });
    return engine;
  };

  it('rejects actions out of turn', () => {
    expectEngineError(() => play(start(), [[1, call]]), 'NotYourTurn');
  });

  it('rejects folding when checking is free', () => {
    const engine = start();
    play(engine, [
      [0, call],
      [1, call],
    ]);
    expectEngineError(() => play(engine, [[2, fold]]), 'FoldWhenCheckAvailable');
  });

  it('rejects checking facing a bet and calling with nothing to call', () => {
    const engine = start();
    expectEngineError(() => play(engine, [[0, check]]), 'IllegalAction');
    play(engine, [
      [0, call],
      [1, call],
    ]);
    expectEngineError(() => play(engine, [[2, call]]), 'IllegalAction');
  });

  it('enforces bet and raise sizes', () => {
    const engine = start();
    expectEngineError(() => play(engine, [[0, bet(300)]]), 'IllegalAction'); // must raise
    expectEngineError(() => play(engine, [[0, raise(150)]]), 'InvalidAmount'); // below min
    expectEngineError(() => play(engine, [[0, raise(1001)]]), 'InvalidAmount'); // above stack
    expectEngineError(() => play(engine, [[0, raise(250.5)]]), 'InvalidAmount'); // not integer
    play(engine, [[0, raise(300)]]); // +200: next minimum is 500
    expect(engine.legalActions(1)).toMatchObject({ minTo: 500, maxTo: 1000, callAmount: 250 });
  });

  it('requires postflop bets of at least one big blind', () => {
    const engine = start();
    play(engine, [
      [0, call],
      [1, call],
      [2, check],
    ]);
    expect(engine.legalActions(1)).toMatchObject({ canBet: true, minTo: 100 });
    expectEngineError(() => play(engine, [[1, bet(99)]]), 'InvalidAmount');
  });

  it('rejects commands when no hand is running and leaves state untouched on errors', () => {
    const engine = PokerEngine.create(config(3), new SeededRng(5));
    expectEngineError(() => play(engine, [[0, call]]), 'NoHandInProgress');
    engine.dispatch({ type: 'startHand' });
    expectEngineError(() => engine.dispatch({ type: 'startHand' }), 'HandInProgress');
    const before = JSON.stringify(engine.state);
    const seat = engine.state.hand?.toAct ?? 0;
    expectEngineError(() => play(engine, [[seat, raise(5)]]), 'InvalidAmount');
    expect(JSON.stringify(engine.state)).toBe(before);
  });

  it('validates the game configuration', () => {
    const rng = new SeededRng(1);
    expectEngineError(() => PokerEngine.create(config(1), rng), 'InvalidConfig');
    expectEngineError(() => PokerEngine.create(config(10), rng), 'InvalidConfig');
    expectEngineError(() => PokerEngine.create(config(3, 999), rng), 'InvalidConfig'); // < 10 BB
    expectEngineError(
      () => PokerEngine.create({ ...config(3), smallBlind: 100 }, rng),
      'InvalidConfig',
    );
    expectEngineError(
      () => PokerEngine.create({ ...config(3), smallBlind: 0 }, rng),
      'InvalidConfig',
    );
    expectEngineError(
      () => PokerEngine.create({ ...config(3), bigBlind: 100.5 }, rng),
      'InvalidConfig',
    );
  });
});

describe('information boundary in views and events', () => {
  it('shows a player only their own hole cards', () => {
    const { engine } = riggedTable({
      stacks: [1000, 1000, 1000],
      button: 0,
      holes: { 0: 'AsAh', 1: 'KsKh', 2: 'QsQh' },
    });
    engine.dispatch({ type: 'startHand' });
    const view = engine.viewFor(1);
    expect(formatCards(view.holeCards ?? [])).toBe('Ks Kh');
    expect(view.seats.every((s) => s.shownCards === null)).toBe(true);
    expect(JSON.stringify(view)).not.toContain('"deck"');
    expect(view.legal).toBeNull(); // seat 0 acts first
    expect(engine.viewFor(0).legal).not.toBeNull();
  });

  it('redacts other players’ hole cards from events', () => {
    const { engine } = riggedTable({ stacks: [1000, 1000], button: 0 });
    const events = engine.dispatch({ type: 'startHand' });
    const redacted = events.map((e) => redactEvent(e, 0));
    const dealt = eventsOfType(redacted, 'HoleCardDealt');
    expect(dealt.filter((e) => e.seat === 0).every((e) => e.card !== null)).toBe(true);
    expect(dealt.filter((e) => e.seat === 1).every((e) => e.card === null)).toBe(true);
  });

  it('records publicly shown hands for the rest of the game', () => {
    const { engine } = riggedTable({
      stacks: [1000, 1000, 1000],
      button: 0,
      holes: { 0: 'AsAh', 1: 'KsKh', 2: 'QsQh' },
      board: '2c7d9hJc3d',
    });
    engine.dispatch({ type: 'startHand' });
    play(engine, [
      [0, call],
      [1, call],
      [2, check],
      ...[1, 2, 0, 1, 2, 0, 1, 2, 0].map((seat) => [seat, check] as const),
    ]);
    // KK shows first, QQ mucks, AA shows.
    const shown = engine.viewFor(2).shownHands.map((h) => [h.seat, formatCards(h.cards)]);
    expect(shown).toEqual([
      [1, 'Ks Kh'],
      [0, 'As Ah'],
    ]);
  });

  it('lets a player show voluntarily after the hand', () => {
    const { engine } = riggedTable({ stacks: [1000, 1000], button: 0, holes: { 1: 'AsAh' } });
    engine.dispatch({ type: 'startHand' });
    play(engine, [[0, raise(300)]]);
    play(engine, [[1, raise(900)]]);
    play(engine, [[0, fold]]);
    const events = engine.dispatch({ type: 'reveal', seat: 1 });
    expect(eventsOfType(events, 'CardsShown')[0]?.cards).toEqual(parseCards('AsAh'));
    expect(engine.viewFor(0).seats[1]?.shownCards).toEqual(parseCards('AsAh'));
  });
});

describe('rabbit hunt (AGENTS.md §10.1)', () => {
  it('reveals the board that would have come, respecting burns', () => {
    const { engine } = riggedTable({ stacks: [1000, 1000, 1000], button: 0, board: 'AhKh7c2d9s' });
    engine.dispatch({ type: 'startHand' });
    expect(engine.rabbitHunt()).toBeNull(); // hand still running
    play(engine, [
      [0, call],
      [1, call],
      [2, check],
      [1, bet(100)],
      [2, fold],
      [0, fold],
    ]);
    expect(formatCards(engine.state.hand?.board ?? [])).toBe('Ah Kh 7c');
    expect(formatCards(engine.rabbitHunt() ?? [])).toBe('2d 9s');
  });

  it('is unavailable after a showdown', () => {
    const { engine } = riggedTable({ stacks: [1000, 1000], button: 0 });
    engine.dispatch({ type: 'startHand' });
    play(engine, [
      [0, call],
      [1, check],
      ...[1, 0, 1, 0, 1, 0].map((seat) => [seat, check] as const),
    ]);
    expect(engine.state.hand?.wentToShowdown).toBe(true);
    expect(engine.rabbitHunt()).toBeNull();
  });
});

describe('serialization', () => {
  function playOut(engine: PokerEngine): EngineEvent[] {
    const events: EngineEvent[] = [];
    while (engine.isHandInProgress) {
      const seat = engine.state.hand?.toAct ?? -1;
      const legal = engine.legalActions(seat);
      events.push(...play(engine, [[seat, legal?.canCheck ? check : call]]));
    }
    return events;
  }

  it('snapshots between hands as JSON without any deck and restores exactly', () => {
    const engine = PokerEngine.create(config(4), new SeededRng(7));
    engine.dispatch({ type: 'startHand' });
    expectEngineError(() => engine.snapshot(), 'HandInProgress');
    playOut(engine);
    const snapshot = engine.snapshot();
    const json = JSON.stringify(snapshot);
    expect(snapshot.hand).toBeNull();
    expect(json).not.toContain('deck');

    const restoredA = PokerEngine.restore(JSON.parse(json) as typeof snapshot, new SeededRng(8));
    const restoredB = PokerEngine.restore(JSON.parse(json) as typeof snapshot, new SeededRng(8));
    const a = [...restoredA.dispatch({ type: 'startHand' }), ...playOut(restoredA)];
    const b = [...restoredB.dispatch({ type: 'startHand' }), ...playOut(restoredB)];
    expect(a).toEqual(b);
    expect(restoredA.state.handNumber).toBe(2);
  });

  it('rejects tampered snapshots', () => {
    const engine = PokerEngine.create(config(3), new SeededRng(7));
    const snapshot = engine.snapshot();
    (snapshot.seats[0] as { stack: number }).stack += 1;
    expectEngineError(() => PokerEngine.restore(snapshot, new SeededRng(1)), 'InvalidSnapshot');
  });

  it('is deterministic for a given RNG seed', () => {
    const run = () => {
      const engine = PokerEngine.create(config(6), new SeededRng(2026));
      const events: EngineEvent[] = [];
      for (let h = 0; h < 5; h++) {
        events.push(...engine.dispatch({ type: 'startHand' }), ...playOut(engine));
      }
      return events;
    };
    expect(run()).toEqual(run());
  });
});

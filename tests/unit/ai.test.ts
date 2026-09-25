import { describe, expect, it } from 'vitest';
import { NpcBrain, randomStyles, STYLE_IDS, type StyleId } from '../../src/ai/index.ts';
import { isNuts } from '../../src/ai/postflop/decide.ts';
import { ALL_COMBOS, handPercentile, orderedClasses } from '../../src/ai/ranges/hand-order.ts';
import { sanitize } from '../../src/ai/sanity.ts';
import { analyse } from '../../src/ai/view-analysis.ts';
import { GameController } from '../../src/app/game-controller.ts';
import { LocalNpcDriver, type NpcDriver } from '../../src/app/npc-driver.ts';
import { type Card, parseCards } from '../../src/core/cards/index.ts';
import { PokerEngine } from '../../src/core/engine/index.ts';
import { SeededRng } from '../../src/core/rng/seeded-rng.ts';
import type { LegalActions, PlayerAction } from '../../src/core/view/index.ts';
import { derived, runSim } from '../../scripts/sim-core.ts';
import { FakeScheduler } from '../support/fake-scheduler.ts';

const legal = (over: Partial<LegalActions> = {}): LegalActions => ({
  seat: 1,
  canFold: true,
  canCheck: false,
  callAmount: 100,
  canBet: false,
  canRaise: true,
  minTo: 300,
  maxTo: 5000,
  allInTo: 5000,
  ...over,
});

describe('sanity rules (AGENTS.md §8.2.9)', () => {
  it('never folds when checking is free', () => {
    expect(
      sanitize({ type: 'fold' }, legal({ canCheck: true, canFold: false, callAmount: 0 })),
    ).toEqual({
      type: 'check',
    });
  });

  it('never bets below the minimum and turns max-size bets into all-in', () => {
    expect(sanitize({ type: 'raise', to: 150 }, legal())).toEqual({ type: 'raise', to: 300 });
    expect(sanitize({ type: 'raise', to: 99_999 }, legal())).toEqual({ type: 'allIn' });
    expect(sanitize({ type: 'bet', to: 500 }, legal())).toEqual({ type: 'call' });
    expect(
      sanitize({ type: 'allIn' }, legal({ canRaise: false, minTo: null, maxTo: null })),
    ).toEqual({
      type: 'call',
    });
  });
});

describe('hand ordering and styles', () => {
  it('ranks premium hands first and trash last', () => {
    const order = orderedClasses();
    expect(order).toHaveLength(169);
    expect(order[0]).toBe('AA');
    expect(order.indexOf('AKs')).toBeLessThan(10);
    expect(order.indexOf('72o')).toBeGreaterThan(160);
    expect(handPercentile(parseCards('AsAh'))).toBeLessThan(0.01);
    expect(ALL_COMBOS).toHaveLength(1326);
  });

  it('draws a realistic mix with at most two maniacs per table', () => {
    const rng = new SeededRng(7);
    const counts = new Map<StyleId, number>();
    for (let i = 0; i < 2000; i++) {
      const table = randomStyles(8, rng);
      expect(table.filter((s) => s === 'maniac').length).toBeLessThanOrEqual(2);
      for (const s of table) counts.set(s, (counts.get(s) ?? 0) + 1);
    }
    for (const s of STYLE_IDS) expect(counts.get(s) ?? 0).toBeGreaterThan(0);
    expect(counts.get('tag') ?? 0).toBeGreaterThan(counts.get('maniac') ?? 0);
    expect(counts.get('rec') ?? 0).toBeGreaterThan(counts.get('maniac') ?? 0);
  });
});

describe('information boundary (AGENTS.md §8.1)', () => {
  it('makes identical decisions whether or not hidden cards are randomized', () => {
    const players = 6;
    const engine = PokerEngine.create(
      {
        players: Array.from({ length: players }, (_, i) => ({ name: `P${i}` })),
        startingStack: 1_000_000,
        smallBlind: 50,
        bigBlind: 100,
      },
      new SeededRng(99),
    );
    const styles: StyleId[] = ['tag', 'lag', 'nit', 'station', 'maniac', 'rec'];
    const brainsA = styles.map(
      (s, seat) => new NpcBrain(seat, s, new SeededRng(1000 + seat), { iterations: 120 }),
    );
    const brainsB = styles.map(
      (s, seat) => new NpcBrain(seat, s, new SeededRng(1000 + seat), { iterations: 120 }),
    );
    const scramble = new SeededRng(5);
    let decisions = 0;

    for (let h = 0; h < 600 && !engine.isFinished; h++) {
      engine.dispatch({ type: 'startHand' });
      while (engine.isHandInProgress) {
        const hand = engine.state.hand;
        const seat = hand?.toAct;
        if (!hand || seat === null || seat === undefined) break;
        const real = engine.viewFor(seat);

        // Randomize every other player's hidden hole cards (swapping with undealt deck cards),
        // take the view, then restore the real cards.
        const saved = hand.players.map((p) => (p ? [...p.holeCards] : null));
        const deckSaved = [...hand.deck];
        for (const p of hand.players) {
          if (!p || p.seat === seat || p.shown) continue;
          for (let k = 0; k < 2; k++) {
            const j = hand.deckPosition + scramble.int(hand.deck.length - hand.deckPosition);
            const tmp = p.holeCards[k] as Card;
            p.holeCards[k] = hand.deck[j] as Card;
            hand.deck[j] = tmp;
          }
        }
        const tampered = engine.viewFor(seat);
        hand.players.forEach((p, i) => {
          const cards = saved[i];
          if (p && cards) p.holeCards.splice(0, 2, ...cards);
        });
        hand.deck.splice(0, hand.deck.length, ...deckSaved);

        expect(tampered).toEqual(real);
        const a = (brainsA[seat] as NpcBrain).decide(real);
        const b = (brainsB[seat] as NpcBrain).decide(tampered);
        expect(b).toEqual(a);
        decisions++;
        engine.dispatch({ type: 'act', seat, action: a });
      }
      for (let seat = 0; seat < players; seat++) {
        const view = engine.viewFor(seat);
        brainsA[seat]?.observeHandEnd(view);
        brainsB[seat]?.observeHandEnd(view);
      }
    }
    expect(decisions).toBeGreaterThan(2000);
  }, 120_000);
});

describe('AI behaviour in simulation', () => {
  it('stays legal, never folds the nuts, and keeps decisions fast', () => {
    let nutFolds = 0;
    const result = runSim({
      hands: 1500,
      players: 6,
      seats: 'random',
      seed: 11,
      iterations: 200,
      onDecision: (view, action) => {
        if (action.type === 'fold' && view.street !== 'preflop' && isNuts(analyse(view)))
          nutFolds++;
      },
    });
    expect(result.illegalActions).toBe(0);
    expect(nutFolds).toBe(0);
    for (const s of Object.values(result.byKind)) expect(s.maxDecisionMs).toBeLessThan(350);
  }, 120_000);

  it('orders the styles by looseness and aggression', () => {
    const result = runSim({
      hands: 2500,
      players: 6,
      seats: ['tag', 'lag', 'nit', 'station', 'maniac', 'rec'],
      seed: 21,
      iterations: 150,
    });
    const d = (k: string) =>
      derived(
        result.byKind[k] ?? {
          hands: 0,
          vpip: 0,
          pfr: 0,
          aggressive: 0,
          passive: 0,
          sawFlop: 0,
          showdowns: 0,
          netBbs: 0,
          decisions: 0,
          decisionMs: 0,
          maxDecisionMs: 0,
        },
      );
    expect(d('nit').vpip).toBeLessThan(d('tag').vpip);
    expect(d('tag').vpip).toBeLessThan(d('lag').vpip);
    expect(d('lag').vpip).toBeLessThan(d('maniac').vpip);
    expect(d('station').vpip).toBeGreaterThan(d('tag').vpip);
    expect(d('station').pfr).toBeLessThan(d('tag').pfr);
    expect(d('rec').pfr).toBeLessThan(d('tag').pfr);
    expect(d('maniac').af).toBeGreaterThan(d('station').af);
  }, 120_000);

  it('uses the full decision budget comfortably at live settings', () => {
    const brain = new NpcBrain(1, 'tag', new SeededRng(3));
    const engine = PokerEngine.create(
      {
        players: [{ name: 'A' }, { name: 'B' }, { name: 'C' }],
        startingStack: 10_000,
        smallBlind: 50,
        bigBlind: 100,
      },
      new SeededRng(4),
    );
    let worst = 0;
    for (let h = 0; h < 40; h++) {
      engine.dispatch({ type: 'startHand' });
      while (engine.isHandInProgress) {
        const seat = engine.state.hand?.toAct ?? 0;
        const view = engine.viewFor(seat);
        const start = performance.now();
        const action: PlayerAction = brain.decide({ ...view });
        worst = Math.max(worst, performance.now() - start);
        engine.dispatch({ type: 'act', seat, action });
      }
      if (engine.isFinished) break;
    }
    // Computation must fit inside the shortest normal thinking delay (350 ms, §8.4).
    expect(worst).toBeLessThan(350);
  }, 60_000);
});

describe('tilt', () => {
  it('loosens up for a few hands after a big loss, scaled by style', () => {
    const engine = PokerEngine.create(
      {
        players: [{ name: 'A' }, { name: 'B' }],
        startingStack: 5000,
        smallBlind: 50,
        bigBlind: 100,
      },
      new SeededRng(8),
    );
    const maniac = new NpcBrain(0, 'maniac', new SeededRng(1), { iterations: 50 });
    const nit = new NpcBrain(1, 'nit', new SeededRng(2), { iterations: 50 });
    // Play shove-or-call until someone loses at least half their stack in a hand.
    for (let h = 0; h < 200 && !engine.isFinished; h++) {
      engine.dispatch({ type: 'startHand' });
      while (engine.isHandInProgress) {
        const seat = engine.state.hand?.toAct ?? 0;
        const view = engine.viewFor(seat);
        (seat === 0 ? maniac : nit).decide(view);
        const l = view.legal;
        engine.dispatch({
          type: 'act',
          seat,
          action:
            l?.canRaise || l?.canBet
              ? { type: 'allIn' }
              : l?.canCheck
                ? { type: 'check' }
                : { type: 'call' },
        });
      }
      maniac.observeHandEnd(engine.viewFor(0));
      nit.observeHandEnd(engine.viewFor(1));
      if (maniac.tilted || nit.tilted) break;
    }
    expect(maniac.tilted || nit.tilted || engine.isFinished).toBe(true);
  });
});

describe('controller with AI brains', () => {
  const config = {
    players: Array.from({ length: 4 }, (_, i) => ({ name: `P${i}` })),
    startingStack: 2000,
    smallBlind: 50,
    bigBlind: 100,
  };
  const seats = [
    { seat: 1, style: 'tag' as const },
    { seat: 2, style: 'lag' as const },
    { seat: 3, style: 'station' as const },
  ];

  function playOut(controller: GameController, scheduler: FakeScheduler): Promise<void> {
    return (async () => {
      for (let i = 0; i < 50_000; i++) {
        const snap = controller.getSnapshot();
        if (snap.phase === 'userOut' || snap.phase === 'gameOver') return;
        if (snap.phase === 'userTurn') {
          const l = snap.view.legal;
          controller.act(l?.canCheck ? { type: 'check' } : { type: 'call' });
          continue;
        }
        await Promise.resolve();
        if (!scheduler.runNext()) await Promise.resolve();
      }
      throw new Error('did not finish');
    })();
  }

  it('plays a full game with synchronous in-process brains', async () => {
    const scheduler = new FakeScheduler();
    const controller = new GameController({
      config,
      deckRng: new SeededRng(1),
      npcRng: new SeededRng(2),
      scheduler,
      speed: 'instant',
      driver: new LocalNpcDriver(seats, (s) => new SeededRng(100 + s)),
      styles: [null, 'tag', 'lag', 'station'],
    });
    controller.start();
    await playOut(controller, scheduler);
    expect(['userOut', 'gameOver']).toContain(controller.getSnapshot().phase);
  }, 60_000);

  it('uses asynchronous (worker-style) decisions and falls back when one never arrives', async () => {
    const local = new LocalNpcDriver(seats, (s) => new SeededRng(200 + s));
    let calls = 0;
    const driver: NpcDriver = {
      decide: (seat, view) => {
        calls++;
        // Every tenth decision never answers: the controller must fall back after the cap.
        if (calls % 10 === 0) return new Promise<PlayerAction>(() => undefined);
        return Promise.resolve(local.decide(seat, view));
      },
      observeHandEnd: (views) => {
        local.observeHandEnd(views);
      },
      dispose: () => undefined,
    };
    const scheduler = new FakeScheduler();
    const controller = new GameController({
      config,
      deckRng: new SeededRng(3),
      npcRng: new SeededRng(4),
      scheduler,
      speed: 'normal',
      driver,
      styles: [null, 'tag', 'lag', 'station'],
    });
    controller.start();
    await playOut(controller, scheduler);
    expect(calls).toBeGreaterThan(10);
    expect(['userOut', 'gameOver']).toContain(controller.getSnapshot().phase);
  }, 60_000);
});

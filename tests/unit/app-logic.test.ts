import { describe, expect, it } from 'vitest';
import {
  clampTarget,
  potFractionTarget,
  sizingPresets,
  sizingStep,
} from '../../src/app/bet-sizing.ts';
import { pickNames } from '../../src/app/names.ts';
import { SessionStatsTracker } from '../../src/app/session-stats.ts';
import {
  checkSetup,
  DEFAULT_SETUP,
  loadLastSetup,
  saveLastSetup,
  toEngineConfig,
} from '../../src/app/setup.ts';
import { decideSimple, chenScore } from '../../src/ai/simple/simple-npc.ts';
import { parseCards } from '../../src/core/cards/index.ts';
import { EngineError, PokerEngine } from '../../src/core/engine/index.ts';
import { SeededRng } from '../../src/core/rng/seeded-rng.ts';
import type { LegalActions } from '../../src/core/view/index.ts';

describe('setup validation (AGENTS.md §5.1)', () => {
  it('accepts the defaults', () => {
    expect(checkSetup(DEFAULT_SETUP)).toEqual({ errors: [], warnings: [] });
  });

  it('rejects bad blinds and short stacks, and warns below 20 BB', () => {
    expect(checkSetup({ ...DEFAULT_SETUP, smallBlind: 0 }).errors).toContain('smallBlindMin');
    expect(checkSetup({ ...DEFAULT_SETUP, bigBlind: 50 }).errors).toContain('bigBlindAboveSmall');
    expect(checkSetup({ ...DEFAULT_SETUP, startingStack: 999 }).errors).toContain('stackTooShort');
    expect(checkSetup({ ...DEFAULT_SETUP, startingStack: 1500 }).warnings).toContain('shortStack');
    expect(checkSetup({ ...DEFAULT_SETUP, bigBlind: 75 }).warnings).toContain('bigBlindSuggestion');
    expect(checkSetup({ ...DEFAULT_SETUP, startingStack: NaN }).errors).toEqual(['integer']);
  });

  it('remembers the last setup and survives broken storage', () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
    };
    const setup = {
      players: 3,
      startingStack: 5000,
      smallBlind: 25,
      bigBlind: 50,
      opponents: 'random' as const,
    };
    saveLastSetup(storage, setup);
    expect(loadLastSetup(storage)).toEqual(setup);
    store.set('mesa-viva:last-setup', '{broken');
    expect(loadLastSetup(storage)).toEqual(DEFAULT_SETUP);
    const throwing = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(loadLastSetup(throwing)).toEqual(DEFAULT_SETUP);
    expect(() => {
      saveLastSetup(throwing, setup);
    }).not.toThrow();
  });

  it('builds an engine config with the user in seat 0', () => {
    const config = toEngineConfig(
      { ...DEFAULT_SETUP, players: 3 },
      ['Ana', 'Bruno', 'Caio'],
      'Você',
    );
    expect(config.players.map((p) => p.name)).toEqual(['Você', 'Ana', 'Bruno']);
  });
});

describe('bet sizing (AGENTS.md §11.3)', () => {
  const legal = (over: Partial<LegalActions>): LegalActions => ({
    seat: 0,
    canFold: true,
    canCheck: false,
    callAmount: 100,
    canBet: false,
    canRaise: true,
    minTo: 200,
    maxTo: 5000,
    allInTo: 5000,
    ...over,
  });

  it('offers 2,5×/3×/4×/pot preflop and pot fractions postflop, clamped and deduplicated', () => {
    const pre = sizingPresets({
      legal: legal({}),
      street: 'preflop',
      bigBlind: 100,
      smallBlind: 50,
      pot: 150,
      currentBet: 100,
    });
    expect(pre.map((p) => [p.id, p.to])).toEqual([
      ['x2_5', 250],
      ['x3', 300],
      ['x4', 400],
      ['pot', 350], // 100 + (150 + 100)
      ['allIn', 5000],
    ]);
    const post = sizingPresets({
      legal: legal({ canBet: true, canRaise: false, canCheck: true, callAmount: 0, minTo: 100 }),
      street: 'flop',
      bigBlind: 100,
      smallBlind: 50,
      pot: 600,
      currentBet: 0,
    });
    expect(post.map((p) => p.to)).toEqual([200, 300, 400, 450, 600, 5000]);
  });

  it('computes pot-sized raises and clamps to the legal range', () => {
    const ctx = {
      legal: legal({}),
      street: 'turn' as const,
      bigBlind: 100,
      smallBlind: 50,
      pot: 900,
      currentBet: 300,
    };
    expect(potFractionTarget(ctx, 1)).toBe(300 + 900 + 100);
    expect(clampTarget(ctx, 10)).toBe(200);
    expect(clampTarget(ctx, 99_999)).toBe(5000);
    expect(clampTarget(ctx, 250.4)).toBe(250);
    expect(sizingStep(ctx, 300)).toBe(50);
    expect(sizingStep(ctx, 600)).toBe(100);
  });
});

describe('session stats (AGENTS.md §5.8)', () => {
  it('tracks hands, wins, biggest pot, best hand, VPIP and PFR from events', () => {
    const tracker = new SessionStatsTracker(0, 1000);
    const hole = parseCards('AsAh');
    const board = parseCards('AdKd7c2h3s');
    tracker.record(
      [
        {
          type: 'HandStarted',
          handNumber: 1,
          button: 0,
          smallBlindSeat: 1,
          bigBlindSeat: 2,
          seats: [0, 1, 2],
          stacks: [],
        },
        {
          type: 'ActionTaken',
          action: { seat: 0, street: 'preflop', kind: 'raise', amount: 300, to: 300, allIn: false },
        },
        {
          type: 'PotAwarded',
          potIndex: 0,
          amount: 750,
          winners: [{ seat: 0, amount: 750 }],
          value: null,
          bestFive: null,
        },
        { type: 'HandEnded', handNumber: 1, stacks: [] },
        {
          type: 'HandStarted',
          handNumber: 2,
          button: 1,
          smallBlindSeat: 2,
          bigBlindSeat: 0,
          seats: [0, 1, 2],
          stacks: [],
        },
        {
          type: 'ActionTaken',
          action: { seat: 0, street: 'preflop', kind: 'fold', amount: 0, to: 100, allIn: false },
        },
        { type: 'HandEnded', handNumber: 2, stacks: [] },
      ],
      hole,
      board,
    );
    const stats = tracker.snapshot();
    expect(stats).toMatchObject({
      handsPlayed: 2,
      handsWon: 1,
      biggestPotWon: 750,
      vpip: 0.5,
      pfr: 0.5,
    });
    expect(stats.bestHand).not.toBeNull();
  });
});

describe('temporary rule-based NPC', () => {
  it('scores classic hands with the Chen formula', () => {
    expect(chenScore(parseCards('AsAh'))).toBe(20);
    expect(chenScore(parseCards('AsKs'))).toBe(12);
    expect(chenScore(parseCards('7c2d'))).toBe(-1);
    expect(chenScore(parseCards('2c2d'))).toBe(5);
  });

  it('only ever chooses legal actions and finishes NPC-only games', () => {
    for (let seed = 1; seed <= 150; seed++) {
      const rng = new SeededRng(seed);
      const players = 2 + (seed % 8);
      const engine = PokerEngine.create(
        {
          players: Array.from({ length: players }, (_, i) => ({ name: `N${i}` })),
          startingStack: 2000,
          smallBlind: 50,
          bigBlind: 100,
        },
        rng,
      );
      let hands = 0;
      while (!engine.isFinished && hands < 3000) {
        engine.dispatch({ type: 'startHand' });
        hands++;
        while (engine.isHandInProgress) {
          const seat = engine.state.hand?.toAct ?? -1;
          try {
            engine.dispatch({ type: 'act', seat, action: decideSimple(engine.viewFor(seat), rng) });
          } catch (error) {
            if (error instanceof EngineError)
              throw new Error(`Illegal NPC action (seed ${seed}): ${error.message}`, {
                cause: error,
              });
            throw error;
          }
        }
      }
      expect(engine.isFinished).toBe(true);
    }
  });

  it('picks distinct names', () => {
    const names = pickNames(8, new SeededRng(4));
    expect(new Set(names).size).toBe(8);
  });
});

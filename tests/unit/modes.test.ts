import { describe, expect, it } from 'vitest';
import { randomStyles, STYLE_IDS, type StyleId } from '../../src/ai/index.ts';
import {
  BLIND_LEVEL_CHOICES,
  type Blinds,
  blindsAtLevel,
  DEFAULT_LEVEL_HANDS,
  handsToNextLevel,
  levelForHand,
  niceAtLeast,
} from '../../src/app/blind-schedule.ts';
import {
  GameController,
  type SavedGame,
  type TableSnapshot,
} from '../../src/app/game-controller.ts';
import {
  addGame,
  clearLifetimeStats,
  EMPTY_LIFETIME,
  type GameOutcome,
  loadLifetimeStats,
  recordGame,
} from '../../src/app/lifetime-stats.ts';
import { DEFAULT_SETUP } from '../../src/app/setup.ts';
import { EngineError, PokerEngine } from '../../src/core/engine/index.ts';
import { evaluate, type HandValue } from '../../src/core/eval/index.ts';
import { parseCards } from '../../src/core/cards/index.ts';
import { SeededRng } from '../../src/core/rng/seeded-rng.ts';
import { FakeScheduler } from '../support/fake-scheduler.ts';

const config = (startingStack = 1000, smallBlind = 50, bigBlind = 100) => ({
  players: Array.from({ length: 3 }, (_, i) => ({ name: `P${i}` })),
  startingStack,
  smallBlind,
  bigBlind,
});

const code = (fn: () => unknown): string | null => {
  try {
    fn();
    return null;
  } catch (error) {
    return error instanceof EngineError ? error.code : 'other';
  }
};

describe('engine: changing the blinds (AGENTS.md §31.3.1)', () => {
  it('changes the blinds between hands and announces it', () => {
    const engine = PokerEngine.create(config(), new SeededRng(1));
    expect(engine.dispatch({ type: 'setBlinds', smallBlind: 75, bigBlind: 150 })).toEqual([
      { type: 'BlindsChanged', smallBlind: 75, bigBlind: 150 },
    ]);
    engine.dispatch({ type: 'startHand' });
    expect(engine.viewFor(0).bigBlind).toBe(150);
    expect(engine.viewFor(0).smallBlind).toBe(75);
  });

  it('rejects a change during a hand and invalid blinds', () => {
    const engine = PokerEngine.create(config(), new SeededRng(2));
    expect(code(() => engine.dispatch({ type: 'setBlinds', smallBlind: 0, bigBlind: 10 }))).toBe(
      'InvalidConfig',
    );
    expect(code(() => engine.dispatch({ type: 'setBlinds', smallBlind: 100, bigBlind: 100 }))).toBe(
      'InvalidConfig',
    );
    expect(code(() => engine.dispatch({ type: 'setBlinds', smallBlind: 1.5, bigBlind: 3 }))).toBe(
      'InvalidConfig',
    );
    expect(engine.state.config.bigBlind).toBe(100);
    engine.dispatch({ type: 'startHand' });
    expect(code(() => engine.dispatch({ type: 'setBlinds', smallBlind: 75, bigBlind: 150 }))).toBe(
      'HandInProgress',
    );
  });

  it('allows blinds above a tenth of the stack once the game runs, and restores them', () => {
    const engine = PokerEngine.create(config(), new SeededRng(3));
    engine.dispatch({ type: 'setBlinds', smallBlind: 200, bigBlind: 400 });
    const restored = PokerEngine.restore(engine.snapshot(), new SeededRng(4));
    expect(restored.state.config.bigBlind).toBe(400);
    // The setup rule still applies to a new game.
    expect(code(() => PokerEngine.create(config(1000, 200, 400), new SeededRng(5)))).toBe(
      'InvalidConfig',
    );
  });
});

describe('blind schedule (AGENTS.md §31.3.1)', () => {
  const schedule = { everyHands: 10, smallBlind: 50, bigBlind: 100 };

  it('offers the agreed level lengths with 10 hands as the default', () => {
    expect([...BLIND_LEVEL_CHOICES]).toEqual([5, 10, 15, 20]);
    expect(DEFAULT_LEVEL_HANDS).toBe(10);
    expect(DEFAULT_SETUP.blindLevelHands).toBeNull();
  });

  it('rounds up to nice numbers', () => {
    expect([1, 2, 7, 11, 13, 22, 150, 225, 337, 9001].map(niceAtLeast)).toEqual([
      1, 2, 8, 12, 15, 25, 150, 250, 400, 10000,
    ]);
  });

  it('grows about 1.5× per level with readable blinds', () => {
    const levels = [0, 1, 2, 3, 4, 5].map((l) => blindsAtLevel(schedule, l));
    expect(levels).toEqual([
      { smallBlind: 50, bigBlind: 100 },
      { smallBlind: 75, bigBlind: 150 },
      { smallBlind: 125, bigBlind: 250 },
      { smallBlind: 200, bigBlind: 400 },
      { smallBlind: 300, bigBlind: 600 },
      { smallBlind: 500, bigBlind: 1000 },
    ]);
  });

  it('keeps integer, strictly rising blinds from any valid start', () => {
    for (const [sb, bb] of [
      [1, 2],
      [1, 3],
      [2, 3],
      [5, 10],
      [25, 50],
      [40, 100],
      [99, 100],
    ] as const) {
      let prev: Blinds = { smallBlind: sb, bigBlind: bb };
      for (let level = 1; level <= 20; level++) {
        const next = blindsAtLevel({ everyHands: 5, smallBlind: sb, bigBlind: bb }, level);
        expect(Number.isSafeInteger(next.smallBlind) && Number.isSafeInteger(next.bigBlind)).toBe(
          true,
        );
        expect(next.smallBlind).toBeGreaterThanOrEqual(1);
        expect(next.bigBlind).toBeGreaterThan(next.smallBlind);
        expect(next.bigBlind).toBeGreaterThan(prev.bigBlind);
        expect(next.smallBlind).toBeGreaterThanOrEqual(prev.smallBlind);
        prev = next;
      }
    }
  });

  it('counts hands per level', () => {
    expect([0, 9, 10, 19, 20].map((h) => levelForHand(h, 10))).toEqual([0, 0, 1, 1, 2]);
    expect([0, 8, 9, 10].map((h) => handsToNextLevel(h, 10))).toEqual([10, 2, 1, 10]);
  });
});

function tournament(seed: number, everyHands: number) {
  const scheduler = new FakeScheduler();
  const outcomes: GameOutcome[] = [];
  const controller = new GameController({
    config: {
      players: Array.from({ length: 4 }, (_, i) => ({ name: `P${i}` })),
      startingStack: 5000,
      smallBlind: 25,
      bigBlind: 50,
    },
    deckRng: new SeededRng(seed),
    npcRng: new SeededRng(seed + 11),
    scheduler,
    speed: 'instant',
    blindSchedule: { everyHands, smallBlind: 25, bigBlind: 50 },
    onGameOver: (outcome) => outcomes.push(outcome),
  });
  const seen: TableSnapshot[] = [];
  controller.subscribe(() => seen.push(controller.getSnapshot()));
  controller.start();
  for (let guard = 0; guard < 100_000; guard++) {
    const snap = controller.getSnapshot();
    if (snap.phase === 'gameOver' || snap.phase === 'userOut') break;
    if (snap.phase === 'userTurn') {
      controller.act(snap.view.legal?.canCheck ? { type: 'check' } : { type: 'call' });
      continue;
    }
    if (!scheduler.runNext()) break;
  }
  return { controller, seen, outcomes };
}

describe('tournament mode in the controller (AGENTS.md §31.3.1)', () => {
  it('raises the blinds every N hands and reports the level', () => {
    const { seen, outcomes } = tournament(5, 5);
    const byHand = new Map<number, TableSnapshot>();
    for (const s of seen) if (s.view.handNumber > 0) byHand.set(s.view.handNumber, s);
    expect(byHand.size).toBeGreaterThan(5);
    const schedule = { everyHands: 5, smallBlind: 25, bigBlind: 50 };
    for (const [hand, snap] of byHand) {
      const level = levelForHand(hand - 1, 5);
      expect(snap.view.bigBlind).toBe(blindsAtLevel(schedule, level).bigBlind);
      expect(snap.tournament).toMatchObject({
        level: level + 1,
        handsLeft: handsToNextLevel(hand - 1, 5),
        raised: level > 0 && (hand - 1) % 5 === 0,
      });
    }
    // The game ends (rising blinds force it to) and the outcome is reported once.
    expect(outcomes).toHaveLength(1);
  });

  it('keeps the schedule across a save', () => {
    const scheduler = new FakeScheduler();
    const saves: SavedGame[] = [];
    const controller = new GameController({
      config: {
        players: Array.from({ length: 3 }, (_, i) => ({ name: `P${i}` })),
        startingStack: 5000,
        smallBlind: 25,
        bigBlind: 50,
      },
      deckRng: new SeededRng(8),
      npcRng: new SeededRng(9),
      scheduler,
      speed: 'instant',
      blindSchedule: { everyHands: 5, smallBlind: 25, bigBlind: 50 },
      onSave: (s) => {
        saves.push(s);
      },
    });
    controller.start();
    expect(saves[0]?.blindSchedule).toEqual({ everyHands: 5, smallBlind: 25, bigBlind: 50 });
  });

  it('has no tournament state with fixed blinds', () => {
    const scheduler = new FakeScheduler();
    const controller = new GameController({
      config: config(5000, 25, 50),
      deckRng: new SeededRng(1),
      npcRng: new SeededRng(2),
      scheduler,
      speed: 'instant',
    });
    controller.start();
    expect(controller.getSnapshot().tournament).toBeNull();
  });
});

describe('opponent level (AGENTS.md §31.3.2)', () => {
  const mix = (level: 'beginner' | 'normal' | 'hard') => {
    const rng = new SeededRng(31);
    const counts = new Map<StyleId, number>();
    for (let i = 0; i < 2000; i++) {
      const table = randomStyles(8, rng, level);
      expect(table).toHaveLength(8);
      expect(table.filter((s) => s === 'maniac').length).toBeLessThanOrEqual(
        level === 'hard' ? 1 : 2,
      );
      for (const s of table) counts.set(s, (counts.get(s) ?? 0) + 1);
    }
    const share = (...styles: StyleId[]) =>
      styles.reduce((sum, s) => sum + (counts.get(s) ?? 0), 0) / (2000 * 8);
    return { counts, share };
  };

  it('makes beginner tables softer and hard tables tougher than normal', () => {
    const beginner = mix('beginner');
    const normal = mix('normal');
    const hard = mix('hard');
    const strong = ['tag', 'lag'] as const;
    const weak = ['rec', 'station'] as const;
    expect(beginner.share(...weak)).toBeGreaterThan(normal.share(...weak) + 0.1);
    expect(hard.share(...strong)).toBeGreaterThan(normal.share(...strong) + 0.1);
    expect(hard.share(...weak)).toBeLessThan(normal.share(...weak));
    for (const s of STYLE_IDS) expect(normal.counts.get(s) ?? 0).toBeGreaterThan(0);
  });

  it('keeps the normal mix identical to the default draw', () => {
    expect(randomStyles(8, new SeededRng(4), 'normal')).toEqual(randomStyles(8, new SeededRng(4)));
  });
});

describe('lifetime statistics (AGENTS.md §31.3.3)', () => {
  const game = (place: number, players: number, bestHand: HandValue | null): GameOutcome => ({
    place,
    players,
    durationMs: 600_000,
    stats: {
      handsPlayed: 40,
      handsWon: 8,
      biggestPotWon: place === 1 ? 9000 : 1200,
      bestHand,
      vpipHands: 10,
      pfrHands: 6,
    },
  });
  const flush = evaluate(parseCards('As9s7s4s2sKdQh'));
  const pair = evaluate(parseCards('AsAd7c4h2sKdQh'));

  it('adds up games, places, hands and keeps the bests', () => {
    let stats = addGame(EMPTY_LIFETIME, game(3, 6, pair));
    stats = addGame(stats, game(1, 6, flush));
    stats = addGame(stats, game(5, 9, null));
    expect(stats).toEqual({
      games: 3,
      wins: 1,
      placeSum: 9,
      playersSum: 21,
      bestPlace: 1,
      handsPlayed: 120,
      handsWon: 24,
      vpipHands: 30,
      pfrHands: 18,
      biggestPotWon: 9000,
      bestHand: flush,
      totalMs: 1_800_000,
    });
  });

  it('persists, survives bad data and resets', () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
      removeItem: (k: string) => store.delete(k),
    };
    expect(loadLifetimeStats(storage)).toEqual(EMPTY_LIFETIME);
    recordGame(storage, game(2, 4, pair));
    const after = recordGame(storage, game(4, 4, flush));
    expect(loadLifetimeStats(storage)).toEqual(after);
    expect(after.games).toBe(2);

    store.set('mesa-viva:lifetime-stats', '{"games":-3,"wins":"x","bestHand":99999999999}');
    expect(loadLifetimeStats(storage)).toEqual(EMPTY_LIFETIME);
    store.set('mesa-viva:lifetime-stats', '{broken');
    expect(loadLifetimeStats(storage)).toEqual(EMPTY_LIFETIME);

    recordGame(storage, game(1, 2, null));
    clearLifetimeStats(storage);
    expect(loadLifetimeStats(storage)).toEqual(EMPTY_LIFETIME);
    expect(loadLifetimeStats(null)).toEqual(EMPTY_LIFETIME);
  });
});

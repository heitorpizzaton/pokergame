import { describe, expect, it } from 'vitest';
import { GameController } from '../../src/app/game-controller.ts';
import { madeHandLabel } from '../../src/app/made-hand.ts';
import { OpponentStatsTracker } from '../../src/app/opponent-stats.ts';
import { DEFAULT_SETTINGS, SettingsStore } from '../../src/app/settings.ts';
import { parseCards } from '../../src/core/cards/index.ts';
import { SeededRng } from '../../src/core/rng/seeded-rng.ts';
import { FakeScheduler } from '../support/fake-scheduler.ts';

describe('made hand label (AGENTS.md §31.2.1)', () => {
  it('names the starting hand before the flop', () => {
    expect(madeHandLabel(parseCards('AsKs'), [])).toBe('Ás e Rei do mesmo naipe');
    expect(madeHandLabel(parseCards('Kd2c'), [])).toBe('Rei e Dois');
    expect(madeHandLabel(parseCards('QhQd'), [])).toBe('Par de Damas');
    expect(madeHandLabel(parseCards('TcTd'), [])).toBe('Par de Dez');
  });

  it('names the made hand with the visible board', () => {
    expect(madeHandLabel(parseCards('QhQd'), parseCards('2c7s9h'))).toBe('Par de Damas');
    expect(madeHandLabel(parseCards('Kh3d'), parseCards('Kc3s9h'))).toBe('Dois Pares, Reis e Três');
    expect(madeHandLabel(null, parseCards('Kc3s9h'))).toBeNull();
  });
});

function playGame(seed: number) {
  const scheduler = new FakeScheduler();
  const controller = new GameController({
    config: {
      players: Array.from({ length: 6 }, (_, i) => ({ name: `P${i}` })),
      startingStack: 5000,
      smallBlind: 25,
      bigBlind: 50,
    },
    deckRng: new SeededRng(seed),
    npcRng: new SeededRng(seed + 7),
    scheduler,
    speed: 'instant',
  });
  controller.start();
  for (let guard = 0; guard < 20_000; guard++) {
    const snap = controller.getSnapshot();
    if (snap.phase === 'userOut' || snap.phase === 'gameOver' || snap.view.handNumber > 30) break;
    if (snap.phase === 'userTurn') {
      controller.act(snap.view.legal?.canCheck ? { type: 'check' } : { type: 'call' });
      continue;
    }
    if (!scheduler.runNext()) break;
  }
  return controller;
}

describe('opponent profiles (AGENTS.md §31.2.2)', () => {
  it('keeps consistent counts and only cards the table has seen', () => {
    for (let seed = 1; seed <= 5; seed++) {
      const snap = playGame(seed).getSnapshot();
      const seen = new Set(
        snap.view.shownHands.map((h) => `${h.handNumber}:${h.seat}:${h.cards.join(',')}`),
      );
      expect(Object.keys(snap.opponents)).not.toContain(String(snap.userSeat));
      for (const [seat, summary] of Object.entries(snap.opponents)) {
        expect(summary.hands).toBeGreaterThan(0);
        if (summary.vpip !== null && summary.pfr !== null) {
          expect(summary.pfr).toBeLessThanOrEqual(summary.vpip);
          expect(summary.vpip).toBeLessThanOrEqual(1);
        }
        for (const shown of summary.shown) {
          expect(seen.has(`${shown.handNumber}:${seat}:${shown.cards.join(',')}`)).toBe(true);
        }
      }
    }
  });

  it('survives a save and restore', () => {
    const tracker = new OpponentStatsTracker({
      2: {
        hands: 10,
        vpip: 4,
        pfr: 2,
        aggressive: 3,
        passive: 1,
        sawFlop: 5,
        showdowns: 2,
        shown: [{ handNumber: 9, cards: parseCards('AhAd') }],
      },
    });
    const restored = new OpponentStatsTracker(tracker.save());
    expect(restored.summary(2)).toEqual({
      hands: 10,
      vpip: 0.4,
      pfr: 0.2,
      aggression: 3,
      wentToShowdown: 0.4,
      shown: [{ handNumber: 9, cards: parseCards('AhAd') }],
    });
    expect(restored.summary(5).vpip).toBeNull();
  });
});

describe('first-game tips (AGENTS.md §31.2.4)', () => {
  it('are pending on a fresh profile, and "Restaurar padrões" keeps them dismissed', () => {
    expect(DEFAULT_SETTINGS.tipsSeen).toBe(false);
    const data = new Map<string, string>();
    const store = new SettingsStore({
      getItem: (k) => data.get(k) ?? null,
      setItem: (k, v) => {
        data.set(k, v);
      },
    });
    store.update({ tipsSeen: true, sound: false });
    store.reset();
    expect(store.get().tipsSeen).toBe(true);
    expect(store.get().sound).toBe(true);
  });
});

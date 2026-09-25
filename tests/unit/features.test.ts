import { describe, expect, it } from 'vitest';
import { clearAutosave, loadAutosave, saveAutosave } from '../../src/app/autosave.ts';
import {
  type CompletedHand,
  GameController,
  type SavedGame,
  type TableSnapshot,
} from '../../src/app/game-controller.ts';
import { DEFAULT_SETTINGS, loadSettings, SettingsStore } from '../../src/app/settings.ts';
import { SeededRng } from '../../src/core/rng/seeded-rng.ts';
import {
  buildHandRecord,
  englishHandName,
  MemoryHistoryStore,
  replayFrames,
  streetStart,
  toPokerStarsText,
} from '../../src/history/index.ts';
import { parseCards } from '../../src/core/cards/index.ts';
import { evaluate } from '../../src/core/eval/index.ts';
import { FakeScheduler } from '../support/fake-scheduler.ts';

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      map.set(k, v);
    },
    removeItem: (k: string) => {
      map.delete(k);
    },
  };
}

const config = {
  players: Array.from({ length: 3 }, (_, i) => ({ name: i === 0 ? 'Você' : `NPC${i}` })),
  startingStack: 2000,
  smallBlind: 50,
  bigBlind: 100,
};

function controllerWith(extra: Partial<ConstructorParameters<typeof GameController>[0]> = {}) {
  const scheduler = new FakeScheduler();
  const controller = new GameController({
    config,
    deckRng: new SeededRng(1),
    npcRng: new SeededRng(2),
    scheduler,
    speed: 'instant',
    ...extra,
  });
  return { controller, scheduler };
}

function runUntil(
  scheduler: FakeScheduler,
  controller: GameController,
  done: (s: TableSnapshot) => boolean,
): TableSnapshot {
  for (let i = 0; i < 5000; i++) {
    const snap = controller.getSnapshot();
    if (done(snap)) return snap;
    // The callback may have acted for the user, making it their turn again with no timer.
    if (!scheduler.runNext() && controller.getSnapshot().phase !== 'userTurn') break;
  }
  return controller.getSnapshot();
}

describe('settings (AGENTS.md §11.7)', () => {
  it('uses the spec defaults: odds panel on, history off, rabbit hunt on, 20 s timer', () => {
    expect(DEFAULT_SETTINGS).toMatchObject({
      oddsPanel: true,
      handHistory: false,
      rabbitHunt: true,
      actionTimer: 20,
      showNpcStyles: false,
      fourColorDeck: false,
      autoMuck: true,
      confirmAllIn: false,
      sound: true,
      volume: 70,
      haptics: true,
    });
  });

  it('persists changes, validates stored values and restores defaults', () => {
    const storage = memoryStorage();
    const store = new SettingsStore(storage);
    let notified = 0;
    store.subscribe(() => notified++);
    store.update({ handHistory: true, actionTimer: 30, volume: 40 });
    expect(new SettingsStore(storage).get()).toMatchObject({
      handHistory: true,
      actionTimer: 30,
      volume: 40,
    });
    storage.setItem(
      'mesa-viva:settings',
      JSON.stringify({ actionTimer: 99, volume: 500, oddsPanel: 'yes' }),
    );
    expect(loadSettings(storage)).toMatchObject({ actionTimer: 20, volume: 100, oddsPanel: true });
    store.reset();
    expect(store.get()).toEqual(DEFAULT_SETTINGS);
    expect(notified).toBe(2);
  });
});

describe('time bank (AGENTS.md §9)', () => {
  it('checks or folds on timeout, marks the user away, and "Voltar" returns control', () => {
    const { controller, scheduler } = controllerWith({ timer: { actionMs: 1000, bankMs: 500 } });
    controller.start();
    const turn = runUntil(scheduler, controller, (s) => s.phase === 'userTurn');
    expect(turn.userClock).toMatchObject({ actionMs: 1000, bankMs: 500 });
    const before = turn.view.actions.length;
    scheduler.runNext(); // the timer fires at 1.5 s
    const after = controller.getSnapshot();
    expect(after.away).toBe(true);
    expect(after.timeBankMs).toBe(0);
    const mine = after.view.actions.slice(before).find((a) => a.seat === 0);
    expect(['check', 'fold']).toContain(mine?.kind);
    controller.setAway(false);
    expect(controller.getSnapshot().away).toBe(false);
  });

  it('only spends the bank for time beyond the action timer', () => {
    const { controller, scheduler } = controllerWith({ timer: { actionMs: 1000, bankMs: 30_000 } });
    controller.start();
    runUntil(scheduler, controller, (s) => s.phase === 'userTurn');
    const clockStart = controller.getSnapshot().userClock?.startedAt ?? 0;
    // Advance the fake clock by 4 s with a dummy timer, then act.
    scheduler.setTimeout(() => undefined, 4000 - (scheduler.now() - clockStart));
    scheduler.runNext();
    const legal = controller.getSnapshot().view.legal;
    controller.act(legal?.canCheck ? { type: 'check' } : { type: 'call' });
    expect(controller.getSnapshot().timeBankMs).toBe(27_000);
  });
});

describe('rabbit hunt (AGENTS.md §10.1)', () => {
  it('offers the would-be board after a hand ends early, when enabled', () => {
    const { controller, scheduler } = controllerWith({ rabbitHunt: true, speed: 'normal' });
    controller.start();
    for (let i = 0; i < 200; i++) {
      const snap = runUntil(
        scheduler,
        controller,
        (s) => s.phase === 'userTurn' || s.rabbit === 'available',
      );
      if (snap.rabbit === 'available') {
        controller.revealRabbit();
        const shown = controller.getSnapshot().rabbit;
        expect(Array.isArray(shown)).toBe(true);
        expect((shown as readonly number[]).length + snap.view.board.length).toBe(5);
        return;
      }
      const legal = snap.view.legal;
      controller.act(legal?.canFold ? { type: 'fold' } : { type: 'check' });
    }
    throw new Error('No hand ended early');
  });
});

describe('autosave (AGENTS.md §5.8)', () => {
  it('saves between hands without a deck and resumes the game', () => {
    const storage = memoryStorage();
    let latest: SavedGame | null = null;
    const { controller, scheduler } = controllerWith({
      onSave: (save) => {
        latest = save;
        saveAutosave(storage, save);
      },
    });
    controller.start();
    runUntil(scheduler, controller, (s) => {
      if (s.phase === 'userTurn') {
        controller.act(s.view.legal?.canCheck ? { type: 'check' } : { type: 'fold' });
      }
      return s.view.handNumber >= 3;
    });
    expect(latest).not.toBeNull();
    const raw = storage.map.get('mesa-viva:autosave') ?? '';
    expect(raw).not.toContain('deck');
    const saved = loadAutosave(storage);
    expect(saved?.state.hand).toBeNull();
    const resumed = new GameController({
      config,
      deckRng: new SeededRng(9),
      npcRng: new SeededRng(10),
      scheduler: new FakeScheduler(),
      speed: 'instant',
      ...(saved ? { restore: saved } : {}),
    });
    resumed.start();
    expect(resumed.getSnapshot().view.handNumber).toBe((saved?.state.handNumber ?? 0) + 1);
    clearAutosave(storage);
    expect(loadAutosave(storage)).toBeNull();
  });

  it('ignores corrupt or mid-hand saves', () => {
    const storage = memoryStorage();
    storage.setItem('mesa-viva:autosave', '{nope');
    expect(loadAutosave(storage)).toBeNull();
    storage.setItem(
      'mesa-viva:autosave',
      JSON.stringify({ version: 1, state: { hand: { deck: [] } } }),
    );
    expect(loadAutosave(storage)).toBeNull();
  });
});

describe('hand history (AGENTS.md §10.2)', () => {
  function recordHands(count: number): CompletedHand[] {
    const hands: CompletedHand[] = [];
    const { controller, scheduler } = controllerWith({ onHandComplete: (h) => hands.push(h) });
    controller.start();
    runUntil(scheduler, controller, (s) => {
      if (s.phase === 'userTurn') {
        const legal = s.view.legal;
        controller.act(legal?.canCheck ? { type: 'check' } : { type: 'call' });
      }
      return hands.length >= count || s.phase === 'userOut' || s.phase === 'gameOver';
    });
    return hands;
  }

  it('records hands without any hidden NPC card', () => {
    const hands = recordHands(8);
    expect(hands.length).toBeGreaterThanOrEqual(8);
    for (const hand of hands) {
      const record = buildHandRecord(hand, 'session-1');
      expect(record.userHole).toHaveLength(2);
      // Only publicly shown NPC cards may appear.
      const json = JSON.stringify(hand.events);
      for (const e of hand.events) {
        if (e.event.type === 'HoleCardDealt' && e.event.seat !== 0) expect(e.event.card).toBeNull();
      }
      expect(json).not.toContain('"deck"');
      expect(record.seats.length).toBeGreaterThanOrEqual(2);
      expect(record.awards.reduce((s, a) => s + a.amount, 0)).toBe(record.potTotal);
    }
  });

  it('stores, lists newest first, and clears', async () => {
    const store = new MemoryHistoryStore();
    const [a, b] = recordHands(2).map((h) => buildHandRecord(h, 's'));
    if (!a || !b) throw new Error('need two hands');
    await store.add(a);
    await store.add(b);
    expect((await store.list()).map((r) => r.handNumber)).toEqual(
      [b.handNumber, a.handNumber].sort((x, y) => y - x),
    );
    await store.clear();
    expect(await store.list()).toEqual([]);
  });

  it('exports PokerStars-style text and replays every step', () => {
    const [hand] = recordHands(1);
    if (!hand) throw new Error('no hand');
    const record = buildHandRecord(hand, '2026-09-25T10:00:00.000Z');
    const text = toPokerStarsText(record);
    expect(text).toMatch(/^PokerStars Hand #\d+: Hold'em No Limit \(50\/100\)/);
    expect(text).toContain('*** HOLE CARDS ***');
    expect(text).toContain('Dealt to Você [');
    expect(text).toContain('*** SUMMARY ***');
    const frames = replayFrames(record);
    expect(frames[0]?.step.kind).toBe('start');
    expect(frames.at(-1)?.step.kind).toBe('result');
    expect(streetStart(frames, 'preflop')).toBe(0);
    const total = (f: (typeof frames)[number]) => f.seats.reduce((s, x) => s + x.stack, 0) + f.pot;
    const [first] = frames;
    const last = frames.at(-1);
    if (!first || !last) throw new Error('no frames');
    expect(total(first)).toBe(total(last));
  });

  it('names hands in English for the export', () => {
    expect(englishHandName(evaluate(parseCards('KsKhKd7c7h')))).toBe(
      'a full house, Kings full of Sevens',
    );
    expect(englishHandName(evaluate(parseCards('As2d3h4c5s')))).toBe('a straight, Ace to Five');
    expect(englishHandName(evaluate(parseCards('AsKsQsJsTs')))).toBe('a Royal Flush');
    expect(englishHandName(evaluate(parseCards('QsQh2c5d9h')))).toBe('a pair of Queens');
  });
});

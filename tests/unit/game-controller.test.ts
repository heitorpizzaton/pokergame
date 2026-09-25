import { describe, expect, it } from 'vitest';
import { GameController, type TableSnapshot } from '../../src/app/game-controller.ts';
import { SeededRng } from '../../src/core/rng/seeded-rng.ts';
import type { PlayerAction } from '../../src/core/view/index.ts';
import { FakeScheduler } from '../support/fake-scheduler.ts';

function setup(players = 4, speed: 'normal' | 'instant' = 'instant', seed = 1) {
  const scheduler = new FakeScheduler();
  const controller = new GameController({
    config: {
      players: Array.from({ length: players }, (_, i) => ({ name: i === 0 ? 'Você' : `NPC${i}` })),
      startingStack: 1000,
      smallBlind: 50,
      bigBlind: 100,
    },
    deckRng: new SeededRng(seed),
    npcRng: new SeededRng(seed + 1000),
    scheduler,
    speed,
  });
  return { controller, scheduler };
}

/** Shove when raising is allowed, otherwise call or check (what the UI offers). */
const shove = (snap: TableSnapshot): PlayerAction => {
  const legal = snap.view.legal;
  if (legal?.canBet || legal?.canRaise) return { type: 'allIn' };
  return legal?.canCheck ? { type: 'check' } : { type: 'call' };
};

/** Plays until the user must act, then applies `policy`; stops at the summary. */
function playUntilOver(
  controller: GameController,
  scheduler: FakeScheduler,
  policy: (snap: TableSnapshot) => PlayerAction,
): TableSnapshot {
  for (let guard = 0; guard < 20_000; guard++) {
    const snap = controller.getSnapshot();
    if (snap.phase === 'userOut' || snap.phase === 'gameOver') return snap;
    if (snap.phase === 'userTurn') {
      expect(controller.act(policy(snap))).toBe(true);
      continue;
    }
    if (!scheduler.runNext()) throw new Error(`Stuck in phase ${snap.phase}`);
  }
  throw new Error('Game did not finish');
}

describe('GameController', () => {
  it('deals a hand and waits for the user on their turn', () => {
    const { controller, scheduler } = setup();
    controller.start();
    for (let i = 0; i < 50 && controller.getSnapshot().phase !== 'userTurn'; i++)
      scheduler.runNext();
    const snap = controller.getSnapshot();
    expect(snap.phase).toBe('userTurn');
    expect(snap.view.holeCards).toHaveLength(2);
    expect(snap.view.legal).not.toBeNull();
    // Other players' cards are never in the user's view.
    expect(snap.view.seats.filter((s) => s.seat !== 0).every((s) => s.shownCards === null)).toBe(
      true,
    );
  });

  it('plays complete games to the summary with an always-all-in user', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const { controller, scheduler } = setup(3, 'instant', seed);
      controller.start();
      const end = playUntilOver(controller, scheduler, shove);
      if (end.phase === 'userOut') {
        expect(end.userPlace).toBeGreaterThanOrEqual(2);
      } else {
        expect(end.winnerSeat).toBe(0);
        expect(end.userPlace).toBe(1);
      }
      expect(end.stats.handsPlayed).toBeGreaterThan(0);
    }
  });

  it('lets the NPCs finish the game after the user busts, and can skip to the end', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const { controller, scheduler } = setup(5, 'instant', seed);
      controller.start();
      const end = playUntilOver(controller, scheduler, shove);
      if (end.phase !== 'userOut' || end.winnerSeat !== null) continue;
      controller.watchToEnd();
      expect(controller.getSnapshot().phase).toBe('watching');
      scheduler.runNext();
      controller.skipToEnd();
      const final = controller.getSnapshot();
      expect(final.phase).toBe('gameOver');
      expect(final.winnerSeat).not.toBeNull();
      expect(final.winnerSeat).not.toBe(0);
      return;
    }
    throw new Error('No seed produced an early bust');
  });

  it('uses human-like NPC thinking time within the §8.4 bounds', () => {
    const { controller, scheduler } = setup(6, 'normal', 3);
    controller.start();
    let last = scheduler.now();
    const delays: number[] = [];
    for (let i = 0; i < 400; i++) {
      const snap = controller.getSnapshot();
      if (snap.phase === 'userTurn') {
        controller.act(snap.view.legal?.canCheck ? { type: 'check' } : { type: 'fold' });
        last = scheduler.now();
        continue;
      }
      const wasNpcTurn = snap.phase === 'npcTurn';
      if (!scheduler.runNext()) break;
      if (wasNpcTurn) delays.push(scheduler.now() - last);
      last = scheduler.now();
    }
    expect(delays.length).toBeGreaterThan(10);
    for (const d of delays) {
      expect(d).toBeGreaterThanOrEqual(350);
      expect(d).toBeLessThanOrEqual(1200);
    }
  });

  it('applies a check/fold pre-action when the turn arrives', () => {
    const { controller, scheduler } = setup(4, 'instant', 5);
    controller.start();
    controller.setPreAction('checkFold');
    expect(controller.getSnapshot().preAction).toBe('checkFold');
    for (let i = 0; i < 20 && controller.getSnapshot().phase !== 'userTurn'; i++) {
      if (!scheduler.runNext()) break;
      if (controller.getSnapshot().preAction === null) break;
    }
    const actions = controller.getSnapshot().view.actions.filter((a) => a.seat === 0);
    if (actions.length > 0) {
      expect(['check', 'fold']).toContain(actions[0]?.kind);
    }
  });

  it('pauses and resumes without losing its place', () => {
    const { controller, scheduler } = setup(4, 'instant', 9);
    controller.start();
    controller.pause();
    expect(controller.getSnapshot().paused).toBe(true);
    expect(scheduler.pending).toBe(0);
    controller.resume();
    expect(controller.getSnapshot().paused).toBe(false);
    expect(
      scheduler.pending + (controller.getSnapshot().phase === 'userTurn' ? 1 : 0),
    ).toBeGreaterThan(0);
  });

  it('rejects illegal user actions without changing anything', () => {
    const { controller, scheduler } = setup(4, 'instant', 2);
    controller.start();
    for (let i = 0; i < 50 && controller.getSnapshot().phase !== 'userTurn'; i++)
      scheduler.runNext();
    const before = controller.getSnapshot();
    const illegal: PlayerAction = before.view.legal?.canCheck
      ? { type: 'fold' }
      : { type: 'check' };
    expect(controller.act(illegal)).toBe(false);
    expect(controller.getSnapshot()).toBe(before);
  });
});

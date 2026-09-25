import { describe, expect, it } from 'vitest';
import { GameController, type TableEffect } from '../../src/app/game-controller.ts';
import { SeededRng } from '../../src/core/rng/seeded-rng.ts';
import { FakeScheduler } from '../support/fake-scheduler.ts';

const config = {
  players: Array.from({ length: 4 }, (_, i) => ({ name: i === 0 ? 'Você' : `NPC${i}` })),
  startingStack: 2000,
  smallBlind: 50,
  bigBlind: 100,
};

function setup(speed: 'normal' | 'instant' = 'instant', seed = 3) {
  const scheduler = new FakeScheduler();
  const controller = new GameController({
    config,
    deckRng: new SeededRng(seed),
    npcRng: new SeededRng(seed + 1),
    scheduler,
    speed,
  });
  const effects: TableEffect[] = [];
  controller.subscribeEffects((e) => effects.push(e));
  return { controller, scheduler, effects };
}

describe('table effects for sound, haptics and animation (AGENTS.md §11.4–11.5)', () => {
  it('reports the deal in the engine order, starting left of the button', () => {
    const { controller, effects } = setup();
    controller.start();
    const snap = controller.getSnapshot();
    const players = snap.view.seats.length;
    expect(effects[0]).toEqual({ kind: 'deal', cards: 2 * players });
    expect(snap.dealOrder).toHaveLength(2 * players);
    // AGENTS.md §5.3: first card to the small blind, one card at a time, twice around.
    const sb = (snap.view.button + 1) % players;
    expect(snap.dealOrder[0]).toBe(sb);
    expect(snap.dealOrder.slice(players)).toEqual(snap.dealOrder.slice(0, players));
  });

  it('waits for the deal animation at normal speed before anyone acts', () => {
    const { controller, scheduler } = setup('normal');
    controller.start();
    expect(controller.getSnapshot().phase).toBe('dealing');
    const actionsBefore = controller.getSnapshot().view.actions.length;
    scheduler.runNext();
    expect(controller.getSnapshot().phase).not.toBe('dealing');
    expect(controller.getSnapshot().view.actions.length).toBe(actionsBefore);
  });

  it('announces the user turn once, and actions, collections and wins as they happen', () => {
    const { controller, scheduler, effects } = setup();
    controller.start();
    let turns = 0;
    for (let i = 0; i < 4000 && controller.getSnapshot().view.handNumber < 6; i++) {
      const snap = controller.getSnapshot();
      if (snap.phase === 'userTurn') {
        turns++;
        const legal = snap.view.legal;
        controller.act(legal?.canCheck ? { type: 'check' } : { type: 'call' });
      } else if (!scheduler.runNext()) break;
    }
    const kinds = new Set(effects.map((e) => e.kind));
    for (const kind of ['deal', 'bet', 'fold', 'collect', 'win', 'yourTurn'] as const) {
      expect(kinds).toContain(kind);
    }
    expect(effects.filter((e) => e.kind === 'yourTurn')).toHaveLength(turns);
    const wins = effects.filter((e) => e.kind === 'win');
    expect(wins.every((w) => w.seats.length > 0)).toBe(true);
  });

  it('gives the five winning cards after a showdown', () => {
    for (let seed = 1; seed < 60; seed++) {
      const { controller, scheduler } = setup('instant', seed);
      controller.start();
      for (let i = 0; i < 400; i++) {
        const snap = controller.getSnapshot();
        if (snap.phase === 'handResult' && snap.result?.showdown) {
          expect(snap.result.bestFive).toHaveLength(5);
          const shown = new Set([
            ...snap.view.board,
            ...snap.view.seats.flatMap((s) => s.shownCards ?? []),
          ]);
          for (const card of snap.result.bestFive ?? []) expect(shown.has(card)).toBe(true);
          return;
        }
        if (snap.phase === 'userTurn') {
          controller.act(snap.view.legal?.canCheck ? { type: 'check' } : { type: 'call' });
        } else if (!scheduler.runNext()) break;
      }
    }
    throw new Error('No showdown found');
  });

  it('reports the bets gathered into the pot at each street end', () => {
    for (let seed = 1; seed < 40; seed++) {
      const { controller, scheduler } = setup('instant', seed);
      controller.start();
      for (let i = 0; i < 400; i++) {
        const snap = controller.getSnapshot();
        if (snap.view.street === 'flop' && snap.collected) {
          const gathered = snap.collected.bets.reduce((sum, b) => sum + b.amount, 0);
          const pot = snap.view.pots.reduce((sum, p) => sum + p.amount, 0);
          expect(gathered).toBe(pot);
          expect(snap.collected.bets.every((b) => b.amount > 0)).toBe(true);
          return;
        }
        if (snap.phase === 'userTurn') {
          controller.act(snap.view.legal?.canCheck ? { type: 'check' } : { type: 'call' });
        } else if (!scheduler.runNext()) break;
      }
    }
    throw new Error('No flop reached');
  });
});

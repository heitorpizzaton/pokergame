import { describe, expect, it } from 'vitest';
import { GameController, type TableSnapshot } from '../../src/app/game-controller.ts';
import { dealDurationMs, flipDelayMs, PACING, streetRevealMs } from '../../src/app/pacing.ts';
import { parseCards } from '../../src/core/cards/index.ts';
import { evaluate } from '../../src/core/eval/index.ts';
import { SeededRng } from '../../src/core/rng/seeded-rng.ts';
import type { PlayerAction } from '../../src/core/view/index.ts';
import { handName } from '../../src/i18n/index.ts';
import { clockState } from '../../src/ui/table/clock-state.ts';
import { FakeScheduler } from '../support/fake-scheduler.ts';

const normal = PACING.normal;

describe('pacing (AGENTS.md §31.1.3)', () => {
  it('deals one card at a time and turns the flop card by card after the burn', () => {
    expect(dealDurationMs(normal, 12)).toBe(11 * normal.dealStaggerMs + normal.dealFlightMs);
    expect(dealDurationMs(normal, 0)).toBe(0);
    expect([0, 1, 2, 3, 4].map((i) => flipDelayMs(normal, i))).toEqual([
      normal.burnMs,
      normal.burnMs + normal.flopStaggerMs,
      normal.burnMs + 2 * normal.flopStaggerMs,
      normal.burnMs,
      normal.burnMs,
    ]);
    expect(streetRevealMs(normal, 3)).toBe(
      normal.burnMs + 2 * normal.flopStaggerMs + normal.flipMs,
    );
    expect(streetRevealMs(normal, 1)).toBe(normal.burnMs + normal.flipMs);
  });

  it('is slower at normal speed than fast, and instant has no pauses', () => {
    for (const key of Object.keys(normal) as (keyof typeof normal)[]) {
      if (key === 'thinkingMs') continue;
      expect(PACING.fast[key]).toBeLessThan(normal[key]);
      expect(PACING.instant[key]).toBe(0);
    }
    expect(streetRevealMs(PACING.instant, 3)).toBe(0);
    expect(dealDurationMs(PACING.instant, 18)).toBe(0);
  });

  it('keeps the NPC thinking budget of §8.4', () => {
    expect(normal.thinkingMs).toEqual([350, 1200]);
    expect(PACING.fast.thinkingMs).toEqual([120, 400]);
  });
});

function setup(seed: number, players = 4, startingStack = 1000) {
  const scheduler = new FakeScheduler();
  const controller = new GameController({
    config: {
      players: Array.from({ length: players }, (_, i) => ({ name: i === 0 ? 'Você' : `NPC${i}` })),
      startingStack,
      smallBlind: 50,
      bigBlind: 100,
    },
    deckRng: new SeededRng(seed),
    npcRng: new SeededRng(seed + 1000),
    scheduler,
    speed: 'normal',
  });
  const log: { at: number; snap: TableSnapshot }[] = [];
  controller.subscribe(() => {
    log.push({ at: scheduler.now(), snap: controller.getSnapshot() });
  });
  return { controller, scheduler, log };
}

const callDown = (snap: TableSnapshot): PlayerAction =>
  snap.view.legal?.canCheck ? { type: 'check' } : { type: 'call' };

/** Plays `hands` hands at normal speed with a calling user. */
function play(controller: GameController, scheduler: FakeScheduler, hands: number): void {
  controller.start();
  for (let guard = 0; guard < 50_000; guard++) {
    const snap = controller.getSnapshot();
    if (snap.phase === 'userOut' || snap.phase === 'gameOver') return;
    if (snap.view.handNumber > hands) return;
    if (snap.phase === 'userTurn') {
      controller.act(callDown(snap));
      continue;
    }
    if (!scheduler.runNext()) return;
  }
}

describe('street pause and sequential showdown (AGENTS.md §31.1.3, §31.1.5)', () => {
  it('waits for the burn, the flips and a breath before anyone acts on a new street', () => {
    let streets = 0;
    for (let seed = 1; seed <= 6; seed++) {
      const { controller, scheduler, log } = setup(seed);
      play(controller, scheduler, 3);
      for (let i = 0; i < log.length; i++) {
        const entry = log[i];
        if (entry?.snap.phase !== 'street') continue;
        const previous = log
          .slice(0, i)
          .reverse()
          .find((e) => e.snap.view.handNumber === entry.snap.view.handNumber);
        const added = entry.snap.boardShown - (previous?.snap.boardShown ?? 0);
        const next = log.slice(i + 1).find((e) => e.snap.phase !== 'street');
        if (!next || added <= 0) continue;
        expect(next.at - entry.at).toBe(streetRevealMs(normal, added) + normal.streetPauseMs);
        streets++;
      }
    }
    expect(streets).toBeGreaterThan(5);
  });

  it('turns showdown hands face up one at a time, then shows the result', () => {
    let showdowns = 0;
    for (let seed = 1; seed <= 40 && showdowns < 3; seed++) {
      // Deep stacks, so showdowns are not all-in (all-in hands are revealed at once, §5.4).
      const { controller, scheduler, log } = setup(seed, 5, 20_000);
      play(controller, scheduler, 4);
      const steps = log.filter((e) => e.snap.phase === 'showdown');
      if (steps.length === 0) continue;
      showdowns++;
      for (let i = 1; i < steps.length; i++) {
        const prev = steps[i - 1];
        const cur = steps[i];
        if (!prev || cur?.snap.view.handNumber !== prev.snap.view.handNumber) continue;
        expect(cur.snap.hiddenShowdown.length).toBe(prev.snap.hiddenShowdown.length - 1);
        expect(cur.at - prev.at).toBe(normal.showdownStepMs);
      }
      for (const e of log.filter((x) => x.snap.phase === 'handResult')) {
        expect(e.snap.hiddenShowdown).toEqual([]);
      }
    }
    expect(showdowns).toBeGreaterThan(0);
  });
});

describe('visible action timer (AGENTS.md §31.1.1)', () => {
  const clock = { startedAt: 1_000, actionMs: 20_000, bankMs: 30_000 };

  it('counts the action time first, then the time bank', () => {
    expect(clockState(clock, 1_000)).toMatchObject({ inBank: false, seconds: 20, fraction: 1 });
    expect(clockState(clock, 7_500)).toMatchObject({ inBank: false, seconds: 14 });
    expect(clockState(clock, 21_000)).toMatchObject({ inBank: true, seconds: 30, fraction: 1 });
    expect(clockState(clock, 36_000)).toMatchObject({ inBank: true, seconds: 15 });
  });

  it('warns in the last 5 seconds overall', () => {
    expect(clockState(clock, 45_000).warning).toBe(false);
    expect(clockState(clock, 46_500).warning).toBe(true);
    expect(clockState({ ...clock, bankMs: 0 }, 17_000).warning).toBe(true);
  });
});

describe('hand names (AGENTS.md §31.1.9)', () => {
  const name = (cards: string) => handName(evaluate(parseCards(cards)));

  it('keeps Três and Dez invariable in the plural', () => {
    expect(name('KsKh3c3h9d')).toBe('Dois Pares, Reis e Três');
    expect(name('TsTh2c5d9h')).toBe('Par de Dez');
    expect(name('3s3h3dKcKh')).toMatch(/Três/);
  });
});

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { EngineError, type EngineEvent, PokerEngine } from '../../src/core/engine/index.ts';
import { SeededRng } from '../../src/core/rng/seeded-rng.ts';
import type { LegalActions, PlayerAction } from '../../src/core/view/index.ts';
import { totalChips } from '../support/engine-harness.ts';

/**
 * Property tests over complete random games (AGENTS.md §13.1, Phase 2 acceptance: 10,000+
 * games). Every command is followed by invariant checks.
 */

const GAMES = 10_000;
const MAX_HANDS = 1_000;
const MAX_ACTIONS_PER_HAND = 300;

function randomAction(legal: LegalActions, rng: SeededRng): PlayerAction {
  const options: [number, () => PlayerAction][] = [];
  if (legal.canFold) options.push([2, () => ({ type: 'fold' })]);
  options.push([5, () => (legal.canCheck ? { type: 'check' } : { type: 'call' })]);
  if ((legal.canBet || legal.canRaise) && legal.minTo !== null && legal.maxTo !== null) {
    const { minTo, maxTo } = legal;
    const type = legal.canBet ? 'bet' : 'raise';
    options.push([3, () => ({ type, to: minTo + rng.int(maxTo - minTo + 1) })]);
    options.push([1, () => ({ type: 'allIn' })]);
  }
  const total = options.reduce((sum, [w]) => sum + w, 0);
  let pick = rng.int(total);
  for (const [weight, make] of options) {
    if (pick < weight) return make();
    pick -= weight;
  }
  throw new Error('unreachable');
}

/** An action that the engine must reject for `legal`, or null if none applies. */
function illegalAction(legal: LegalActions, rng: SeededRng): PlayerAction | null {
  const candidates: PlayerAction[] = [];
  if (legal.canCheck) candidates.push({ type: 'fold' }, { type: 'call' });
  else candidates.push({ type: 'check' });
  if (legal.minTo !== null) {
    candidates.push({ type: legal.canBet ? 'bet' : 'raise', to: legal.minTo - 1 });
    candidates.push({ type: legal.canBet ? 'bet' : 'raise', to: legal.allInTo + 1 });
  } else {
    candidates.push({ type: 'raise', to: legal.allInTo });
  }
  return candidates[rng.int(candidates.length)] ?? null;
}

interface GameStats {
  hands: number;
  showdowns: number;
  sidePots: number;
}

function fail(message: string): never {
  throw new Error(message);
}

function playRandomGame(seed: number, players: number, stackBBs: number): GameStats {
  const rng = new SeededRng(seed);
  const engine = PokerEngine.create(
    {
      players: Array.from({ length: players }, (_, i) => ({
        name: `P${i}`,
        autoMuck: rng.int(2) === 0,
      })),
      startingStack: stackBBs * 100,
      smallBlind: 50,
      bigBlind: 100,
    },
    rng,
  );
  const total = players * stackBBs * 100;
  const stats: GameStats = { hands: 0, showdowns: 0, sidePots: 0 };
  let previousBigBlind: number | null = null;

  // Hot-path invariants use plain checks: calling expect() millions of times dominates runtime.
  const check = (events: readonly EngineEvent[]): void => {
    const chips = totalChips(engine);
    if (chips !== total) fail(`Chips not conserved: ${chips} !== ${total}`);
    for (const s of engine.state.seats) {
      if (!Number.isSafeInteger(s.stack) || s.stack < 0) fail(`Invalid stack ${s.stack}`);
      if (s.eliminated && s.stack !== 0) fail('Eliminated seat still has chips');
    }
    for (const e of events) {
      if (e.type === 'Showdown') stats.showdowns++;
      if (e.type === 'PotsUpdated' && e.pots.length > 1) stats.sidePots++;
    }
  };

  while (!engine.isFinished) {
    expect(stats.hands).toBeLessThan(MAX_HANDS);
    const startEvents = engine.dispatch({ type: 'startHand' });
    check(startEvents);
    stats.hands++;

    // Button and blinds (docs/RULES.md §2).
    const started = startEvents[0];
    if (started?.type !== 'HandStarted') throw new Error('HandStarted must come first');
    const active = started.seats;
    const next = (from: number): number => {
      for (let i = 1; i <= players; i++) {
        const seat = (from + i) % players;
        if (active.includes(seat)) return seat;
      }
      return -1;
    };
    if (active.length === 2) {
      expect(started.smallBlindSeat).toBe(started.button);
      expect(started.bigBlindSeat).toBe(next(started.button));
      // Heads-up (including the transition to it), nobody posts the big blind twice in a row:
      // with two players left it is always avoidable.
      if (previousBigBlind !== null && active.includes(previousBigBlind)) {
        expect(started.bigBlindSeat).not.toBe(previousBigBlind);
      }
    } else {
      expect(started.smallBlindSeat).toBe(next(started.button));
      expect(started.bigBlindSeat).toBe(next(started.smallBlindSeat));
    }
    previousBigBlind = started.bigBlindSeat;

    let actions = 0;
    while (engine.isHandInProgress) {
      if (actions++ >= MAX_ACTIONS_PER_HAND) fail('Hand did not terminate');
      const seat = engine.state.hand?.toAct;
      if (seat === null || seat === undefined) throw new Error('A running hand needs a player');
      const legal = engine.legalActions(seat);
      if (!legal) throw new Error('The player to act must have legal actions');
      if (legal.canFold === legal.canCheck) fail('Fold must be legal exactly when check is not');
      if (legal.minTo !== null && legal.maxTo !== null && legal.minTo > legal.maxTo) {
        fail('minTo must not exceed maxTo');
      }

      // Occasionally try an illegal command: it must throw and change nothing.
      if (rng.int(100) === 0) {
        const bad = illegalAction(legal, rng);
        const other = (seat + 1) % players;
        const before = JSON.stringify(engine.state);
        expect(() =>
          engine.dispatch({ type: 'act', seat: other, action: { type: 'call' } }),
        ).toThrow(EngineError);
        if (bad) {
          expect(() => engine.dispatch({ type: 'act', seat, action: bad })).toThrow(EngineError);
        }
        expect(JSON.stringify(engine.state)).toBe(before);
      }

      check(engine.dispatch({ type: 'act', seat, action: randomAction(legal, rng) }));
    }
  }

  const places = engine.state.seats.map((s) => s.place);
  expect(places.filter((p) => p === 1)).toHaveLength(1);
  expect(engine.state.seats.filter((s) => s.stack === total)).toHaveLength(1);
  return stats;
}

describe(`engine properties over ${GAMES.toLocaleString('en-US')} random games`, () => {
  it('conserves chips, keeps stacks valid, terminates, and rejects illegal actions', () => {
    let hands = 0;
    let showdowns = 0;
    let sidePots = 0;
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 2 ** 31 - 1 }),
        fc.integer({ min: 2, max: 9 }),
        fc.integer({ min: 10, max: 30 }),
        (seed, players, stackBBs) => {
          const stats = playRandomGame(seed, players, stackBBs);
          hands += stats.hands;
          showdowns += stats.showdowns;
          sidePots += stats.sidePots;
        },
      ),
      { numRuns: GAMES },
    );
    // The random policy must actually exercise the interesting paths.
    expect(hands).toBeGreaterThan(GAMES * 5);
    expect(showdowns).toBeGreaterThan(GAMES);
    expect(sidePots).toBeGreaterThan(GAMES / 10);
  }, 120_000);
});

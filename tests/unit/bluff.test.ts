import { describe, expect, it } from 'vitest';
import { NpcBrain, STYLES } from '../../src/ai/index.ts';
import {
  blockerScore,
  type BluffInput,
  bluffProbability,
  boardStory,
} from '../../src/ai/postflop/bluff.ts';
import { classifyBet, cleanDrawOuts, isBluffOpportunity } from '../../src/ai/postflop/classify.ts';
import { decidePostflop, type PostflopContext } from '../../src/ai/postflop/decide.ts';
import type { Spot } from '../../src/ai/view-analysis.ts';
import { parseCards } from '../../src/core/cards/index.ts';
import { SeededRng } from '../../src/core/rng/seeded-rng.ts';
import type { LegalActions, PublicSeat } from '../../src/core/view/index.ts';

describe('bet classification (AGENTS.md §18.1)', () => {
  it('splits value, semi-bluff and pure bluff by equity vs. callers and clean outs', () => {
    expect(classifyBet({ street: 'flop', equityVsCallers: 0.55, cleanOuts: 0 })).toBe('value');
    expect(classifyBet({ street: 'flop', equityVsCallers: 0.4, cleanOuts: 0 })).toBe('semiBluff');
    expect(classifyBet({ street: 'flop', equityVsCallers: 0.2, cleanOuts: 8 })).toBe('semiBluff');
    expect(classifyBet({ street: 'turn', equityVsCallers: 0.2, cleanOuts: 5 })).toBe('pureBluff');
    // On the river there are no draws left.
    expect(classifyBet({ street: 'river', equityVsCallers: 0.29, cleanOuts: 9 })).toBe('pureBluff');
    expect(classifyBet({ street: 'river', equityVsCallers: 0.31, cleanOuts: 0 })).toBe('semiBluff');
  });

  it('counts clean outs to a straight or better', () => {
    // Nut flush draw: nine hearts left, minus the 2h that pairs the board.
    expect(cleanDrawOuts(parseCards('AhKh'), parseCards('Qh7h2c'))).toBe(8);
    // Open-ended straight draw: four fives and four tens.
    expect(cleanDrawOuts(parseCards('9s8s'), parseCards('7c6d2h'))).toBe(8);
    // Gutshot: four sevens only, not a real draw.
    expect(cleanDrawOuts(parseCards('9s8s'), parseCards('6c5d2h'))).toBe(4);
    // A made straight needs no outs; the river has none.
    expect(cleanDrawOuts(parseCards('9s8s'), parseCards('7c6d5h'))).toBe(0);
    expect(cleanDrawOuts(parseCards('AhKh'), parseCards('Qh7h2c3d'))).toBe(7);
    expect(cleanDrawOuts(parseCards('AhKh'), parseCards('Qh7h2c3d4s'))).toBe(0);
  });

  it('only counts pots with fewer than four players as bluff opportunities', () => {
    expect(isBluffOpportunity(true, 'pureBluff', 3)).toBe(true);
    expect(isBluffOpportunity(true, 'pureBluff', 4)).toBe(false);
    expect(isBluffOpportunity(true, 'value', 2)).toBe(false);
    expect(isBluffOpportunity(false, 'semiBluff', 2)).toBe(false);
  });
});

const input = (over: Partial<BluffInput> = {}): BluffInput => ({
  style: STYLES.tag,
  street: 'flop',
  kind: 'bet',
  betClass: 'pureBluff',
  cbet: false,
  opponents: 1,
  inPosition: true,
  foldEquity: 0.45,
  boardStory: 0,
  blockers: 0,
  showdownValue: false,
  recentFailedBluff: false,
  tilted: false,
  personal: 1,
  ...over,
});

describe('bluff probability modifiers (AGENTS.md §18.3)', () => {
  it('bluffs less against more opponents and out of position', () => {
    const one = bluffProbability(input());
    expect(bluffProbability(input({ opponents: 2 }))).toBeCloseTo(one * 0.55, 6);
    expect(bluffProbability(input({ inPosition: false }))).toBeCloseTo((one / 1.2) * 0.85, 6);
  });

  it('lets strong styles adapt to fold equity, while the maniac ignores it', () => {
    const tagStation = bluffProbability(input({ foldEquity: 0.05 }));
    const tagFolder = bluffProbability(input({ foldEquity: 0.95 }));
    expect(tagStation).toBeLessThan(tagFolder * 0.6);
    const maniac = STYLES.maniac;
    expect(bluffProbability(input({ style: maniac, foldEquity: 0.05 }))).toBe(
      bluffProbability(input({ style: maniac, foldEquity: 0.95 })),
    );
  });

  it('applies board story, blockers, showdown value, failed bluffs, tilt and the clamp', () => {
    const base = bluffProbability(input());
    expect(bluffProbability(input({ boardStory: 1 }))).toBeGreaterThan(base);
    expect(bluffProbability(input({ boardStory: -1 }))).toBeLessThan(base);
    expect(bluffProbability(input({ blockers: 1 }))).toBeGreaterThan(base);
    expect(bluffProbability(input({ showdownValue: true }))).toBeLessThan(base);
    expect(bluffProbability(input({ recentFailedBluff: true }))).toBeLessThan(base);
    expect(bluffProbability(input({ style: STYLES.maniac, recentFailedBluff: true }))).toBe(
      bluffProbability(input({ style: STYLES.maniac })),
    );
    expect(bluffProbability(input({ tilted: true }))).toBeCloseTo(
      base * STYLES.tag.bluffing.tilt,
      6,
    );
    const extreme = input({
      style: STYLES.maniac,
      foldEquity: 1,
      boardStory: 1,
      blockers: 1,
      personal: 1.2,
    });
    expect(bluffProbability(extreme)).toBeLessThanOrEqual(0.95);
  });

  it('reads the board story and blockers from public cards and the NPC hand', () => {
    expect(boardStory(parseCards('AsKd4c'), true)).toBe(1);
    expect(boardStory(parseCards('AsKd4c'), false)).toBe(-1);
    expect(boardStory(parseCards('7s6d5c'), true)).toBe(-1);
    expect(blockerScore(parseCards('Ah2c'), parseCards('Kh8h3h'))).toBe(1);
    expect(blockerScore(parseCards('As2c'), parseCards('Kh8d3c'))).toBe(0.4);
    expect(blockerScore(parseCards('Qs2c'), parseCards('Kh8d3c'))).toBe(0);
  });

  it('gives every NPC its own persistent multiplier in [0.8, 1.2]', () => {
    const values = Array.from(
      { length: 50 },
      (_, i) => new NpcBrain(1, 'tag', new SeededRng(i)).personal,
    );
    expect(Math.min(...values)).toBeGreaterThanOrEqual(0.8);
    expect(Math.max(...values)).toBeLessThanOrEqual(1.2);
    expect(new Set(values).size).toBeGreaterThan(45);
  });
});

/** A postflop spot built by hand: the NPC in seat 1 on a flop, against `opponents`. */
function spotWith(
  opponents: readonly Partial<PublicSeat>[],
  legalOver: Partial<LegalActions> = {},
  hole = 'Tc9d',
  board = 'AsKh2c',
): Spot {
  const legal: LegalActions = {
    seat: 1,
    canFold: false,
    canCheck: true,
    callAmount: 0,
    canBet: true,
    canRaise: false,
    minTo: 100,
    maxTo: 9000,
    allInTo: 9000,
    ...legalOver,
  };
  const seats = opponents.map(
    (o, i) => ({ seat: i + 2, status: 'active', stack: 9000, committed: 0, ...o }) as PublicSeat,
  );
  return {
    view: { seat: 1, board: parseCards(board), legal, currentBet: legal.callAmount } as never,
    me: { seat: 1, stack: 9000 } as PublicSeat,
    hole: parseCards(hole),
    street: 'flop',
    bb: 100,
    pot: 600,
    toCall: legal.callAmount,
    effective: 9000,
    opponents: seats,
    preflopRaises: 1,
    preflopLimpers: 0,
    preflopAggressor: 1,
    inPosition: true,
    streetActions: [],
  };
}

function context(spot: Spot, over: Partial<PostflopContext> = {}, seed = 1): PostflopContext {
  const rng = new SeededRng(seed);
  return {
    spot,
    style: STYLES.maniac,
    equity: 0.1,
    equityVsCallers: 0.05,
    cleanOuts: 0,
    draw: false,
    tilted: false,
    personal: 1.2,
    foldEquity: 0.9,
    recentFailedBluff: false,
    bluffedThisHand: false,
    random: () => rng.int(1_000_000) / 1_000_000,
    ...over,
  };
}

describe('bluffing sanity rules (AGENTS.md §18.4)', () => {
  it('never bluffs when every opponent is all-in and nobody can fold', () => {
    const spot = spotWith([{ status: 'allIn', stack: 0 }]);
    for (let seed = 0; seed < 300; seed++) {
      const { action, info } = decidePostflop(context(spot, {}, seed));
      expect(info.opportunity).toBe(false);
      expect(info.bluffed).toBe(false);
      expect(action.type).toBe('check');
    }
  });

  it('never treats the nuts or a value hand as a bluff', () => {
    const nuts = spotWith([{}], {}, 'AhAd', 'AsAc2d');
    for (let seed = 0; seed < 100; seed++) {
      const { info } = decidePostflop(context(nuts, { equityVsCallers: 0.1 }, seed));
      expect(info.betClass).toBe('value');
      expect(info.bluffed).toBe(false);
    }
    const value = spotWith([{}]);
    const { info } = decidePostflop(context(value, { equityVsCallers: 0.7, equity: 0.7 }));
    expect(info.betClass).toBe('value');
    expect(info.opportunity).toBe(false);
  });

  it('does not call off a stack to keep a failed bluff going (bounded leaks aside)', () => {
    const facing = spotWith([{}], {
      canCheck: false,
      canFold: true,
      callAmount: 6000,
      canBet: false,
      canRaise: false,
      minTo: null,
      maxTo: null,
    });
    const calls = (style: keyof typeof STYLES) => {
      let n = 0;
      for (let seed = 0; seed < 2000; seed++) {
        const { action } = decidePostflop(
          context(facing, { style: STYLES[style], equity: 0.05, bluffedThisHand: true }, seed),
        );
        if (action.type === 'call') n++;
      }
      return n / 2000;
    };
    expect(calls('tag')).toBe(0);
    expect(calls('lag')).toBe(0);
    expect(calls('station')).toBeLessThanOrEqual(STYLES.station.bluffing.callOffLeak + 0.03);
    expect(calls('maniac')).toBeLessThanOrEqual(STYLES.maniac.bluffing.callOffLeak + 0.03);
  });
});

import { describe, expect, it } from 'vitest';
import { type Card, parseCards } from '../../src/core/cards/index.ts';
import {
  drawOdds,
  exactEquityVsHands,
  exactEquityVsRandom,
  MonteCarloEquity,
  preflopClass,
  preflopClasses,
  probabilityOfAtLeast,
} from '../../src/core/equity/index.ts';
import { HandCategory } from '../../src/core/eval/index.ts';
import { SeededRng } from '../../src/core/rng/seeded-rng.ts';

/**
 * Reference values (AGENTS.md §7.2). Tolerance: ±0.3 pp for exact results, ±1.0 pp for Monte
 * Carlo.
 */
const EXACT_TOLERANCE = 0.003;
const MC_TOLERANCE = 0.01;
const c = parseCards;

describe('equity reference values', () => {
  it('AA vs KK preflop: AA wins about 82%', () => {
    // Averaged over all 36 suit combinations. By symmetry, for any AA combo the six KK combos
    // share 0 suits (1 combo), 1 suit (4 combos) or 2 suits (1 combo) with it.
    const aa = c('AsAh');
    const shares0 = exactEquityVsHands([aa, c('KdKc')], [])[0]?.equity ?? 0;
    const shares1 = exactEquityVsHands([aa, c('KsKd')], [])[0]?.equity ?? 0;
    const shares2 = exactEquityVsHands([aa, c('KsKh')], [])[0]?.equity ?? 0;
    const average = (shares0 + 4 * shares1 + shares2) / 6;
    expect(Math.abs(average - 0.82)).toBeLessThanOrEqual(EXACT_TOLERANCE);
  });

  it('AA vs one random hand: about 85.2% (exact preflop table)', () => {
    const equity = preflopClass(c('AdAc')).vsRandom.equity;
    expect(Math.abs(equity - 0.852)).toBeLessThanOrEqual(EXACT_TOLERANCE);
  });

  it('9-out flush draw from the flop to the river: 1 − (38/47 × 37/46) ≈ 34.97%', () => {
    const p = probabilityOfAtLeast(c('AhKh'), c('Qh7h2c'), HandCategory.Flush);
    expect(p).toBeCloseTo(1 - (38 / 47) * (37 / 46), 12);
    expect(Math.abs(p - 0.3497)).toBeLessThanOrEqual(EXACT_TOLERANCE);
  });

  it('8-out open-ended straight draw from the flop to the river ≈ 31.45%', () => {
    const p = probabilityOfAtLeast(c('9h8c'), c('7d6s2c'), HandCategory.Straight);
    expect(p).toBeCloseTo(1 - (39 / 47) * (38 / 46), 12);
    expect(Math.abs(p - 0.3145)).toBeLessThanOrEqual(EXACT_TOLERANCE);
  });

  it('9 outs from the turn to the river: 9/46 ≈ 19.57%', () => {
    const p = probabilityOfAtLeast(c('AhKh'), c('Qh7h2c3d'), HandCategory.Flush);
    expect(p).toBeCloseTo(9 / 46, 12);
  });
});

describe('exact and Monte Carlo engines agree', () => {
  const cases: [string, string, number][] = [
    ['AhKh', 'Qh7h2c', 1],
    ['9h8c', '7d6s2c', 1],
    ['QsQd', 'Ah7c2d', 1],
    ['AhKh', 'Qh7h2c3d', 1],
    ['JcTc', '9c8d2h4s', 1],
    ['AsKd', 'KhQc7d2s9h', 1],
    ['AsKd', 'KhQc7d2s9h', 2],
    ['7c7d', '2h3sKdJc8h', 2],
  ];
  it.each(cases)('%s on %s vs %i random', (hero, board, opponents) => {
    const exact = exactEquityVsRandom(c(hero), c(board), opponents);
    if (!exact) throw new Error('expected an exact result');
    const mc = new MonteCarloEquity(
      c(hero),
      c(board),
      opponents,
      new SeededRng(hero.length * 97 + opponents),
    );
    mc.run(40_000);
    const estimate = mc.result();
    expect(Math.abs(estimate.equity - exact.equity)).toBeLessThanOrEqual(MC_TOLERANCE);
    expect(Math.abs(estimate.win - exact.win)).toBeLessThanOrEqual(MC_TOLERANCE);
    expect(Math.abs(estimate.tie - exact.tie)).toBeLessThanOrEqual(MC_TOLERANCE);
  });

  it('Monte Carlo reproduces the exact preflop table', () => {
    for (const label of ['AA', 'KQs', 'T9s', '72o', '22', 'A5o']) {
      const cls = preflopClasses().find((x) => x.label === label);
      if (!cls) throw new Error(label);
      const hole = handFromLabel(label);
      const mc = new MonteCarloEquity(hole, [], 1, new SeededRng(label.charCodeAt(0)));
      mc.run(40_000);
      expect(Math.abs(mc.result().equity - cls.vsRandom.equity), label).toBeLessThanOrEqual(
        MC_TOLERANCE,
      );
    }
  });

  it('enumerates exactly when within budget and refuses otherwise', () => {
    expect(exactEquityVsRandom(c('AhKh'), c('Qh7h2c'), 1)?.samples).toBe(1081 * 990);
    expect(exactEquityVsRandom(c('AhKh'), c('Qh7h2c'), 2)).toBeNull();
    expect(exactEquityVsRandom(c('AhKh'), [], 1)).toBeNull();
  });
});

describe('the exact preflop table', () => {
  const classes = preflopClasses();

  it('has 169 classes covering all 1,326 combinations', () => {
    expect(classes).toHaveLength(169);
    expect(classes.reduce((sum, x) => sum + x.combos, 0)).toBe(1326);
  });

  it('averages exactly 50% equity over every starting hand (symmetry check)', () => {
    const weighted = classes.reduce((sum, x) => sum + x.combos * x.vsRandom.equity, 0) / 1326;
    expect(weighted).toBeCloseTo(0.5, 6);
  });

  it('ranks AA first and 32o last', () => {
    expect(classes[0]?.label).toBe('AA');
    expect(classes[0]?.topShare).toBe(0);
    expect(classes.at(-1)?.label).toBe('32o');
  });

  it('keeps win + tie consistent with equity', () => {
    for (const x of classes) {
      const { win, tie, equity } = x.vsRandom;
      expect(equity).toBeGreaterThanOrEqual(win);
      expect(equity).toBeLessThanOrEqual(win + tie + 1e-9);
    }
  });
});

describe('draw odds and outs', () => {
  it('lists flush and overcard outs, but not board-pairing cards', () => {
    const odds = drawOdds(c('AhKh'), c('Qh7h2c'));
    if (!odds) throw new Error('expected draw odds');
    const outs = new Set(odds.outs);
    for (const heart of c('2h3h4h5h6h8h9hThJh')) expect(outs.has(heart)).toBe(true);
    for (const over of c('AsAdAcKsKdKc')) expect(outs.has(over)).toBe(true);
    for (const pairsBoard of c('QsQdQc7s7d7c2s2d2h')) expect(outs.has(pairsBoard)).toBe(false);
    expect(odds.outs).toHaveLength(15);
    expect(odds.improveNextCard).toBeCloseTo(15 / 47, 12);
    expect(odds.category).toBe(HandCategory.HighCard);
  });

  it('marks outs that pair the board or add a third suited card as tainted', () => {
    const odds = drawOdds(c('9h8c'), c('7d6s2d'));
    if (!odds) throw new Error('expected draw odds');
    // Td and 5d complete the straight but put a third diamond on the board.
    expect(odds.taintedOuts).toEqual(expect.arrayContaining(c('Td5d')));
    expect(odds.cleanOuts).toEqual(expect.arrayContaining(c('Tc5c')));
  });

  it('is only available on the flop and turn', () => {
    expect(drawOdds(c('AhKh'), [])).toBeNull();
    expect(drawOdds(c('AhKh'), c('Qh7h2c3d9s'))).toBeNull();
    const turn = drawOdds(c('AhKh'), c('Qh7h2c3d'));
    expect(turn?.improveByRiver).toBe(turn?.improveNextCard);
  });
});

function handFromLabel(label: string): Card[] {
  const [hi, lo, kind] = label.split('');
  if (hi === lo) return c(`${hi}s${lo}h`);
  return kind === 's' ? c(`${hi}s${lo}s`) : c(`${hi}s${lo}h`);
}

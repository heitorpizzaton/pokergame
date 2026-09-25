import type { LegalActions, Street } from '../core/view/index.ts';

/** Context for the bet-sizing control (AGENTS.md §11.3). All amounts are chips. */
export interface SizingContext {
  readonly legal: LegalActions;
  readonly street: Street;
  readonly bigBlind: number;
  readonly smallBlind: number;
  /** Every chip in the middle, current street bets included. */
  readonly pot: number;
  readonly currentBet: number;
}

export type PresetId =
  'x2_5' | 'x3' | 'x4' | 'third' | 'half' | 'twoThirds' | 'threeQuarters' | 'pot' | 'allIn';

export interface SizingPreset {
  readonly id: PresetId;
  readonly to: number;
}

/** Clamps a target to the legal range as an integer. */
export function clampTarget(ctx: SizingContext, to: number): number {
  const { minTo, maxTo } = ctx.legal;
  if (minTo === null || maxTo === null) return 0;
  return Math.min(maxTo, Math.max(minTo, Math.round(to)));
}

/** Pot-fraction target: a bet of `fraction` of the pot, or a raise of that size after calling. */
export function potFractionTarget(ctx: SizingContext, fraction: number): number {
  const toCall = ctx.legal.callAmount;
  return ctx.currentBet + fraction * (ctx.pot + toCall);
}

/**
 * Preset targets: preflop 2,5×, 3×, 4× (of the bet faced, which is the big blind when unopened)
 * and pot; postflop ⅓, ½, ⅔, ¾, pot and all-in. Every value is clamped to the legal range and
 * presets that collapse onto the same amount are dropped (all-in is always kept).
 */
export function sizingPresets(ctx: SizingContext): SizingPreset[] {
  const { minTo, maxTo } = ctx.legal;
  if (minTo === null || maxTo === null) return [];
  const raw: [PresetId, number][] =
    ctx.street === 'preflop'
      ? [
          ['x2_5', 2.5 * Math.max(ctx.currentBet, ctx.bigBlind)],
          ['x3', 3 * Math.max(ctx.currentBet, ctx.bigBlind)],
          ['x4', 4 * Math.max(ctx.currentBet, ctx.bigBlind)],
          ['pot', potFractionTarget(ctx, 1)],
        ]
      : [
          ['third', potFractionTarget(ctx, 1 / 3)],
          ['half', potFractionTarget(ctx, 1 / 2)],
          ['twoThirds', potFractionTarget(ctx, 2 / 3)],
          ['threeQuarters', potFractionTarget(ctx, 3 / 4)],
          ['pot', potFractionTarget(ctx, 1)],
        ];
  const seen = new Set<number>();
  const presets: SizingPreset[] = [];
  for (const [id, to] of raw) {
    const target = clampTarget(ctx, to);
    if (target >= maxTo || seen.has(target)) continue;
    seen.add(target);
    presets.push({ id, to: target });
  }
  presets.push({ id: 'allIn', to: maxTo });
  return presets;
}

/** Stepper increment: 1 BB, or the small blind while the target is small (under 5 BB). */
export function sizingStep(ctx: SizingContext, currentTarget: number): number {
  return currentTarget < 5 * ctx.bigBlind ? ctx.smallBlind : ctx.bigBlind;
}

/** Total chips in the middle as seen in a view: collected pots plus current bets. */
export function potInView(view: {
  readonly pots: readonly { readonly amount: number }[];
  readonly seats: readonly { readonly committed: number }[];
}): number {
  return (
    view.pots.reduce((sum, p) => sum + p.amount, 0) +
    view.seats.reduce((sum, s) => sum + s.committed, 0)
  );
}

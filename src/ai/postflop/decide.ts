import { evaluate } from '../../core/eval/index.ts';
import type { PlayerAction } from '../../core/view/index.ts';
import { ALL_COMBOS } from '../ranges/hand-order.ts';
import type { StyleProfile } from '../styles/styles.ts';
import type { Spot } from '../view-analysis.ts';
import { boardTexture } from './texture.ts';

export interface PostflopContext {
  readonly spot: Spot;
  readonly style: StyleProfile;
  /** Equity versus the estimated ranges of the live opponents. */
  readonly equity: number;
  /** Has a flush draw or an open-ended straight draw. */
  readonly draw: boolean;
  /** 1 normally; higher while tilted. */
  readonly aggression: number;
  readonly random: () => number;
}

/** True when no two-card combo can beat the hand on this board (AGENTS.md §8.2.9). */
export function isNuts(spot: Spot): boolean {
  const board = spot.view.board;
  const mine = evaluate([...spot.hole, ...board]);
  const dead = new Set<number>([...spot.hole, ...board]);
  for (const c of ALL_COMBOS) {
    if (dead.has(c.a) || dead.has(c.b)) continue;
    if (evaluate([c.a, c.b, ...board]) > mine) return false;
  }
  return true;
}

export function decidePostflop(ctx: PostflopContext): PlayerAction {
  const { spot, style, equity, random } = ctx;
  const legal = spot.view.legal;
  if (!legal) throw new Error('Not our turn');
  const texture = boardTexture(spot.view.board);
  const opponents = spot.opponents.filter(
    (o) => o.status === 'active' || o.status === 'allIn',
  ).length;
  const multiway = Math.max(0, opponents - 1);
  const jitter = (random() - 0.5) * 2 * style.noise;
  const aggressive = legal.canBet || legal.canRaise;

  const sized = (fraction: number): PlayerAction => {
    if (!aggressive || legal.minTo === null || legal.maxTo === null) {
      return legal.canCheck ? { type: 'check' } : { type: 'call' };
    }
    const base = legal.canBet ? 0 : spot.view.currentBet;
    const noise = 1 + (random() - 0.5) * 0.1;
    const to = Math.round(base + fraction * (spot.pot + legal.callAmount) * noise);
    const target = Math.min(legal.maxTo, Math.max(legal.minTo, to));
    if (target >= legal.maxTo || legal.maxTo - target < spot.pot * 0.25) return { type: 'allIn' };
    return { type: legal.canBet ? 'bet' : 'raise', to: target };
  };
  const pickSize = (strong: boolean): number => {
    const sizes = style.sizes;
    const wetBias = texture.wetness > 0.45 || strong ? sizes.length - 1 : 0;
    const index = Math.min(
      sizes.length - 1,
      Math.floor(random() * sizes.length * 0.6) + (wetBias > 0 ? Math.floor(sizes.length / 2) : 0),
    );
    return sizes[index] ?? 0.5;
  };

  const nuts = isNuts(spot);
  const valueLine = style.valueEquity + multiway * 0.08 + jitter;

  if (legal.canCheck) {
    if (nuts || equity >= valueLine) {
      // Value: bet most of the time, sometimes slow-play (less often on wet boards).
      const slowPlay = texture.wetness < 0.3 && random() < 0.15;
      return aggressive && !slowPlay ? sized(pickSize(true)) : { type: 'check' };
    }
    const wasAggressor = spot.preflopAggressor === spot.view.seat;
    if (
      spot.street === 'flop' &&
      wasAggressor &&
      random() < style.cbet * ctx.aggression * (multiway > 0 ? 0.55 : 1)
    ) {
      return sized(texture.wetness > 0.45 ? 0.66 : 0.33);
    }
    if (ctx.draw && random() < 0.3 + style.semiBluffRaise * ctx.aggression)
      return sized(pickSize(false));
    const bluffChance =
      style.bluff * ctx.aggression * (spot.inPosition ? 1.3 : 0.7) * (multiway > 0 ? 0.4 : 1);
    if (random() < bluffChance) return sized(pickSize(false));
    return { type: 'check' };
  }

  // Facing a bet.
  const potOdds = legal.callAmount / (spot.pot + legal.callAmount);
  if (nuts) return aggressive && random() < 0.7 ? sized(pickSize(true)) : { type: 'call' };
  if (equity >= style.raiseEquity + multiway * 0.05 + jitter && aggressive && random() < 0.75) {
    return sized(pickSize(true));
  }
  if (ctx.draw && aggressive && random() < style.semiBluffRaise * ctx.aggression * 0.6) {
    return sized(pickSize(false));
  }
  const impliedOdds = ctx.draw && spot.street !== 'river' ? 0.07 : 0;
  const required = potOdds * style.callFactor - impliedOdds + jitter;
  if (equity >= required) return { type: 'call' };
  // Hero calls: occasionally call a big river bet with a bluff-catcher.
  if (spot.street === 'river' && equity >= required * 0.7 && random() < 0.12 / style.callFactor) {
    return { type: 'call' };
  }
  return { type: 'fold' };
}

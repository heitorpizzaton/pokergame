import { evaluate } from '../../core/eval/index.ts';
import type { PlayerAction, Street } from '../../core/view/index.ts';
import { ALL_COMBOS } from '../ranges/hand-order.ts';
import type { StyleProfile } from '../styles/styles.ts';
import type { Spot } from '../view-analysis.ts';
import { blockerScore, bluffProbability, boardStory } from './bluff.ts';
import { type BetClass, classifyBet, isBluffOpportunity } from './classify.ts';
import { boardTexture } from './texture.ts';

export interface PostflopContext {
  readonly spot: Spot;
  readonly style: StyleProfile;
  /** Equity versus the estimated ranges of the live opponents. */
  readonly equity: number;
  /** Equity versus the part of those ranges that would call a bet (§18.1). */
  readonly equityVsCallers: number;
  /** Clean outs to a straight or better (§18.1). */
  readonly cleanOuts: number;
  /** Has a flush draw or an open-ended straight draw (for implied odds). */
  readonly draw: boolean;
  readonly tilted: boolean;
  /** Persistent per-NPC bluffing multiplier in [0.8, 1.2] (§18.3). */
  readonly personal: number;
  /** Average fold-to-bet rate of the live opponents, from the opponent model. */
  readonly foldEquity: number;
  /** A bluff of this NPC was shown down and lost in the last few hands. */
  readonly recentFailedBluff: boolean;
  /** This NPC already bluffed earlier in this hand. */
  readonly bluffedThisHand: boolean;
  readonly random: () => number;
}

/** What the NPC saw and chose at a postflop decision (for the simulator statistics). */
export interface DecisionInfo {
  readonly street: Exclude<Street, 'preflop'>;
  readonly betClass: BetClass;
  /** A bluff opportunity (§18.1). */
  readonly opportunity: boolean;
  readonly facingBet: boolean;
  /** Continuation-bet spot: preflop aggressor, heads-up, flop not yet bet. */
  readonly cbetSpot: boolean;
  /** The action is a bet or raise with a non-value hand. */
  readonly bluffed: boolean;
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

export function decidePostflop(ctx: PostflopContext): {
  action: PlayerAction;
  info: DecisionInfo;
} {
  const { spot, style, equity, random } = ctx;
  const legal = spot.view.legal;
  if (!legal) throw new Error('Not our turn');
  const street = spot.street as Exclude<Street, 'preflop'>;
  const texture = boardTexture(spot.view.board);
  const live = spot.opponents.filter((o) => o.status === 'active' || o.status === 'allIn');
  // Someone must still be able to fold, or a bluff has nothing to win (§18.4).
  const canStillFold = live.some((o) => o.status === 'active');
  const multiway = Math.max(0, live.length - 1);
  const jitter = (random() - 0.5) * 2 * style.noise;
  const aggressive = legal.canBet || legal.canRaise;
  const nuts = isNuts(spot);
  const betClass: BetClass = nuts
    ? 'value'
    : classifyBet({ street, equityVsCallers: ctx.equityVsCallers, cleanOuts: ctx.cleanOuts });
  const opportunity = isBluffOpportunity(aggressive && canStillFold, betClass, live.length + 1);
  const facingBet = !legal.canCheck;
  const cbetSpot =
    street === 'flop' &&
    spot.preflopAggressor === spot.view.seat &&
    legal.canCheck &&
    live.length === 1 &&
    !spot.streetActions.some((a) => a.kind === 'bet' || a.kind === 'raise');

  const done = (action: PlayerAction, bluffed = false) => ({
    action,
    info: { street, betClass, opportunity, facingBet, cbetSpot, bluffed },
  });

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
  // Balanced styles size bluffs exactly like value bets, so the size never gives the hand away;
  // weak styles leak through their bluff sizes (§18.3).
  const pickSize = (bluff: boolean): number => {
    const sizes = style.sizes;
    if (bluff && style.bluffing.sizing === 'small') return sizes[0] ?? 0.33;
    if (bluff && style.bluffing.sizing === 'large') return sizes[sizes.length - 1] ?? 1;
    const wet = texture.wetness > 0.45;
    const index = Math.min(
      sizes.length - 1,
      Math.floor(random() * sizes.length * 0.6) + (wet ? Math.floor(sizes.length / 2) : 0),
    );
    return sizes[index] ?? 0.5;
  };
  const bluffChance = (kind: 'bet' | 'raise'): number =>
    betClass === 'value'
      ? 0
      : bluffProbability({
          style,
          street,
          kind,
          betClass,
          cbet: cbetSpot && kind === 'bet',
          opponents: live.length,
          inPosition: spot.inPosition,
          foldEquity: ctx.foldEquity,
          boardStory: boardStory(spot.view.board, spot.preflopAggressor === spot.view.seat),
          blockers: blockerScore(spot.hole, spot.view.board),
          showdownValue: equity >= 0.35,
          recentFailedBluff: ctx.recentFailedBluff,
          tilted: ctx.tilted,
          personal: ctx.personal,
        });

  if (legal.canCheck) {
    if (betClass === 'value') {
      // Value: bet most of the time, sometimes slow-play (less often on wet boards).
      const slowPlay =
        (texture.wetness < 0.3 && random() < style.bluffing.slowPlay) ||
        random() < style.bluffing.passiveValue;
      return done(aggressive && !slowPlay ? sized(pickSize(false)) : { type: 'check' });
    }
    if (
      street === 'river' &&
      betClass === 'semiBluff' &&
      aggressive &&
      canStillFold &&
      random() < style.bluffing.thinValue
    ) {
      return done(sized(pickSize(false)));
    }
    if (opportunity && random() < bluffChance('bet')) {
      const fraction = cbetSpot ? (texture.wetness > 0.45 ? 0.66 : 0.33) : pickSize(true);
      return done(sized(fraction), true);
    }
    return done({ type: 'check' });
  }

  // Facing a bet.
  const potOdds = legal.callAmount / (spot.pot + legal.callAmount);
  if (nuts) return done(aggressive && random() < 0.7 ? sized(pickSize(false)) : { type: 'call' });
  const raiseLine = style.raiseEquity + multiway * 0.05 + jitter;
  if (betClass === 'value' && equity >= raiseLine && aggressive && random() < style.valueRaise) {
    return done(sized(pickSize(false)));
  }
  if (opportunity && random() < bluffChance('raise')) return done(sized(pickSize(true)), true);
  const impliedOdds = ctx.draw && street !== 'river' ? 0.07 : 0;
  const required = potOdds * style.callFactor - impliedOdds + jitter;
  if (equity >= required) return done({ type: 'call' });
  // Never call off a big part of the stack to keep a failed bluff going (§18.4), except for the
  // bounded, documented leaks of the maniac and the calling station.
  const bigCall = legal.callAmount >= (spot.me.stack + legal.callAmount) / 3;
  if (ctx.bluffedThisHand && bigCall) {
    return done(random() < style.bluffing.callOffLeak ? { type: 'call' } : { type: 'fold' });
  }
  // Hero calls: occasionally call a big river bet with a bluff-catcher.
  if (street === 'river' && equity >= required * 0.7 && random() < 0.12 / style.callFactor) {
    return done({ type: 'call' });
  }
  return done({ type: 'fold' });
}

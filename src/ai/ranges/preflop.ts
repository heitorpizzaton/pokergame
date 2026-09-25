import type { PlayerAction, PositionLabel } from '../../core/view/index.ts';
import type { StyleProfile } from '../styles/styles.ts';
import type { Spot } from '../view-analysis.ts';
import { handPercentile } from './hand-order.ts';

/** Position multipliers on the opening range (late positions open wider). */
const POSITION_WIDTH: Readonly<Record<PositionLabel, number>> = {
  UTG: 0.55,
  'UTG+1': 0.62,
  MP: 0.7,
  LJ: 0.8,
  HJ: 0.92,
  CO: 1.2,
  BTN: 1.65,
  SB: 1.1,
  BB: 1.0,
};

/**
 * Range widths are calibrated for 6 players; fewer players widen them (each hand is played
 * more often relative to the blinds), more players tighten them (AGENTS.md §8.3).
 */
export function tableSizeFactor(players: number): number {
  return Math.pow(6 / Math.max(2, players), 0.45);
}

export interface PreflopContext {
  readonly spot: Spot;
  readonly style: StyleProfile;
  /** 1 = normal; > 1 while tilted (wider, more aggressive). */
  readonly looseness: number;
  /** Uniform random numbers in [0, 1) for mixed strategies. */
  readonly random: () => number;
}

/** Soft range membership: mixes near the boundary instead of a hard threshold. */
function member(percentile: number, width: number, noise: number, random: () => number): boolean {
  const softness = 0.015 + noise * 0.3;
  const p = 1 / (1 + Math.exp(-(width - percentile) / softness));
  return random() < p;
}

export function decidePreflop(ctx: PreflopContext): PlayerAction {
  const { spot, style, random } = ctx;
  const legal = spot.view.legal;
  if (!legal) throw new Error('Not our turn');
  const percentile = handPercentile(spot.hole);
  const players = spot.view.playersDealt;
  const size = tableSizeFactor(players) * ctx.looseness;
  const position = spot.me.position ?? 'BB';
  const bb = spot.bb;
  const effectiveBbs = spot.effective / bb;
  const passive = (): PlayerAction => (legal.canCheck ? { type: 'check' } : { type: 'fold' });
  const call = (): PlayerAction => (legal.canCheck ? { type: 'check' } : { type: 'call' });
  const raiseTo = (to: number): PlayerAction => {
    if (!(legal.canBet || legal.canRaise) || legal.minTo === null || legal.maxTo === null)
      return call();
    const target = Math.round(Math.min(legal.maxTo, Math.max(legal.minTo, to)));
    // Commit fully when the raise would leave less than a third of the stack behind.
    if (target >= legal.maxTo || legal.maxTo - target < target / 3) return { type: 'allIn' };
    return { type: legal.canBet ? 'bet' : 'raise', to: target };
  };
  const shove = (): PlayerAction => (legal.canBet || legal.canRaise ? { type: 'allIn' } : call());

  // Push/fold below about 12 BB (AGENTS.md §8.2.9).
  if (effectiveBbs <= 12) {
    const aggressionBoost = style.open / 0.2;
    if (spot.preflopRaises === 0) {
      const pushWidth = Math.min(
        0.7,
        (0.1 + (12 - effectiveBbs) * 0.025) * aggressionBoost * size * POSITION_WIDTH[position],
      );
      return member(percentile, pushWidth, style.noise, random) ? shove() : passive();
    }
    const price = legal.callAmount / Math.max(1, spot.pot + legal.callAmount);
    const callWidth = Math.min(0.5, (0.08 + price * 0.25) * (1 / style.callFactor) * ctx.looseness);
    return member(percentile, callWidth, style.noise, random) ? shove() : passive();
  }

  if (spot.preflopRaises === 0) {
    const open = style.open * size * POSITION_WIDTH[position];
    const openTo = (style.openSize + spot.preflopLimpers) * bb;
    if (position === 'BB') {
      // Limped pot: raise the top of the range, otherwise take the free flop.
      return member(percentile, open * 0.45, style.noise, random) ? raiseTo(openTo + bb) : call();
    }
    if (member(percentile, open, style.noise, random)) return raiseTo(openTo);
    const limpWidth = open + (style.limp + (spot.preflopLimpers > 0 ? style.limp * 0.5 : 0)) * size;
    if (member(percentile, limpWidth, style.noise, random)) return call();
    return passive();
  }

  const facing = spot.view.currentBet;
  if (spot.preflopRaises === 1) {
    if (member(percentile, style.threeBet * size, style.noise, random)) {
      return raiseTo(facing * (spot.inPosition ? 3 : 3.6));
    }
    const callWidth = (style.threeBet + style.callRaise) * size * (position === 'BB' ? 1.35 : 1);
    const cheap = legal.callAmount <= 3 * bb ? 1.15 : 1;
    if (member(percentile, callWidth * cheap, style.noise, random)) return call();
    // Bluff 3-bets from just outside the calling range.
    if (percentile < callWidth * 1.8 && random() < style.threeBetBluff * 0.25) {
      return raiseTo(facing * 3.3);
    }
    return passive();
  }

  if (spot.preflopRaises === 2) {
    if (member(percentile, style.fourBet * size, style.noise, random)) return raiseTo(facing * 2.3);
    if (member(percentile, style.callThreeBet * size, style.noise, random)) return call();
    return passive();
  }

  // Facing a 4-bet or more: continue only with the very top.
  if (member(percentile, style.fourBet * 0.6 * size, style.noise, random)) return shove();
  if (member(percentile, style.fourBet * size, style.noise, random)) return call();
  return passive();
}

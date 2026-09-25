import type { LegalActions, PlayerAction } from '../core/view/index.ts';

/**
 * Last line of defence (AGENTS.md §8.2.9): never fold when checking is free, never make an
 * illegal action, never bet less than the minimum. Anything unusable becomes a check or call.
 */
export function sanitize(action: PlayerAction, legal: LegalActions): PlayerAction {
  const passive: PlayerAction = legal.canCheck ? { type: 'check' } : { type: 'call' };
  switch (action.type) {
    case 'fold':
      return legal.canCheck ? { type: 'check' } : action;
    case 'check':
      return legal.canCheck ? action : { type: 'fold' };
    case 'call':
      return legal.canCheck ? { type: 'check' } : action;
    case 'allIn':
      if (legal.canBet || legal.canRaise) return action;
      return passive;
    case 'bet':
    case 'raise': {
      const allowed = action.type === 'bet' ? legal.canBet : legal.canRaise;
      if (!allowed || legal.minTo === null || legal.maxTo === null) return passive;
      const to = Math.round(Math.min(legal.maxTo, Math.max(legal.minTo, action.to)));
      return to >= legal.maxTo ? { type: 'allIn' } : { type: action.type, to };
    }
  }
}

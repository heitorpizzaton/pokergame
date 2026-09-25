import type { LegalActions, PlayerAction } from '../view/index.ts';

/**
 * The action taken when the user's timer and time bank run out (AGENTS.md §9): check when
 * possible, otherwise fold.
 */
export function timeoutAction(legal: LegalActions): PlayerAction {
  return legal.canCheck ? { type: 'check' } : { type: 'fold' };
}

import type { Card } from '../../core/cards/index.ts';
import { evaluate, HandCategory, handCategory } from '../../core/eval/index.ts';
import type { Rng } from '../../core/rng/index.ts';
import type { PlayerAction, PlayerView } from '../../core/view/index.ts';

/**
 * Temporary rule-based NPC for Phase 4 (AGENTS.md §14), replaced by the full AI in Phase 5.
 * It reads only its PlayerView. Preflop it uses the Chen formula; postflop it plays made hands,
 * draws and a little bluffing, with random mixing so it is not trivially readable.
 */
export function decideSimple(view: PlayerView, rng: Rng): PlayerAction {
  const legal = view.legal;
  const hole = view.holeCards;
  if (!legal || hole?.length !== 2) throw new Error('decideSimple needs the turn');
  const me = view.seats[view.seat];
  const stack = me?.stack ?? 0;
  const bb = view.bigBlind;
  const effectiveBbs = (stack + (me?.committed ?? 0)) / bb;
  const pot =
    view.pots.reduce((s, p) => s + p.amount, 0) + view.seats.reduce((s, x) => s + x.committed, 0);
  const roll = rng.int(1000) / 1000;

  const passive = (): PlayerAction => (legal.canCheck ? { type: 'check' } : { type: 'fold' });
  const callOrCheck = (): PlayerAction => (legal.canCheck ? { type: 'check' } : { type: 'call' });
  const sized = (to: number): PlayerAction => {
    if (legal.minTo === null || legal.maxTo === null) return callOrCheck();
    const target = Math.min(legal.maxTo, Math.max(legal.minTo, Math.round(to)));
    if (target >= legal.maxTo) return { type: 'allIn' };
    return { type: legal.canBet ? 'bet' : 'raise', to: target };
  };
  const canAggress = legal.canBet || legal.canRaise;

  if (view.street === 'preflop') {
    const chen = chenScore(hole);
    if (effectiveBbs <= 12) {
      // Push/fold when short.
      if (chen >= 8 || (chen >= 6 && roll < 0.35)) {
        return canAggress ? { type: 'allIn' } : callOrCheck();
      }
      return passive();
    }
    const unopened = view.currentBet <= bb;
    const late = me?.position === 'BTN' || me?.position === 'CO' || me?.position === 'SB';
    if (unopened) {
      const openThreshold = late ? 7 : 9;
      if (canAggress && chen >= openThreshold && roll < 0.85) return sized(3 * bb);
      if (chen >= 6 && roll < 0.35) return callOrCheck();
      return passive();
    }
    const priceBbs = legal.callAmount / bb;
    if (canAggress && chen >= 12 && roll < 0.7) return sized(3 * view.currentBet);
    if (chen >= 9 || (chen >= 7 && priceBbs <= 3) || (chen >= 5 && priceBbs <= 1 && roll < 0.5)) {
      return callOrCheck();
    }
    return passive();
  }

  const board = view.board;
  const category = handCategory(evaluate([...hole, ...board]));
  const boardCategory = board.length >= 5 ? handCategory(evaluate(board)) : pairedCategory(board);
  const strength = category > boardCategory ? category : HandCategory.HighCard;
  const draw = board.length < 5 && hasDraw(hole, board);
  const potOdds = legal.callAmount > 0 ? legal.callAmount / (pot + legal.callAmount) : 0;

  if (strength >= HandCategory.TwoPair) {
    if (canAggress && roll < 0.75) return sized(legal.canBet ? pot * 0.66 : view.currentBet * 2.5);
    return callOrCheck();
  }
  if (strength === HandCategory.OnePair) {
    if (legal.canCheck) return canAggress && roll < 0.45 ? sized(pot * 0.5) : { type: 'check' };
    return potOdds < 0.35 || roll < 0.3 ? { type: 'call' } : { type: 'fold' };
  }
  if (draw) {
    if (legal.canCheck) return canAggress && roll < 0.3 ? sized(pot * 0.6) : { type: 'check' };
    return potOdds < 0.3 ? { type: 'call' } : passive();
  }
  if (legal.canCheck) return canAggress && roll < 0.12 ? sized(pot * 0.5) : { type: 'check' };
  return roll < 0.05 ? { type: 'call' } : { type: 'fold' };
}

/** Bill Chen's preflop hand score. */
export function chenScore(hole: readonly Card[]): number {
  const [a, b] = hole;
  if (a === undefined || b === undefined) return 0;
  const hi = Math.max(a >> 2, b >> 2);
  const lo = Math.min(a >> 2, b >> 2);
  const cardScore = (rank: number): number =>
    rank === 12 ? 10 : rank === 11 ? 8 : rank === 10 ? 7 : rank === 9 ? 6 : (rank + 2) / 2;
  let score = cardScore(hi);
  if (hi === lo) return Math.max(5, Math.ceil(score * 2));
  if ((a & 3) === (b & 3)) score += 2;
  const gap = hi - lo - 1;
  score -= gap === 0 ? 0 : gap === 1 ? 1 : gap === 2 ? 2 : gap === 3 ? 4 : 5;
  if (gap <= 1 && hi < 10) score += 1;
  return Math.ceil(score);
}

function pairedCategory(board: readonly Card[]): HandCategory {
  const counts = new Map<number, number>();
  for (const c of board) counts.set(c >> 2, (counts.get(c >> 2) ?? 0) + 1);
  const max = Math.max(0, ...counts.values());
  const pairs = [...counts.values()].filter((n) => n === 2).length;
  if (max >= 3) return HandCategory.ThreeOfAKind;
  if (pairs >= 2) return HandCategory.TwoPair;
  if (pairs === 1) return HandCategory.OnePair;
  return HandCategory.HighCard;
}

/** Four to a flush or an open-ended straight draw that uses at least one hole card. */
function hasDraw(hole: readonly Card[], board: readonly Card[]): boolean {
  const all = [...hole, ...board];
  for (let suit = 0; suit < 4; suit++) {
    const suited = all.filter((c) => (c & 3) === suit);
    if (suited.length === 4 && hole.some((c) => (c & 3) === suit)) return true;
  }
  const ranks = new Set(all.map((c) => c >> 2));
  if (ranks.has(12)) ranks.add(-1);
  for (let low = -1; low <= 8; low++) {
    let run = 0;
    for (let r = low; r < low + 4; r++) if (ranks.has(r)) run++;
    const usesHole = hole.some((c) => c >> 2 >= low && c >> 2 < low + 4);
    if (run === 4 && usesHole && low >= 0 && low + 4 <= 12) return true;
  }
  return false;
}

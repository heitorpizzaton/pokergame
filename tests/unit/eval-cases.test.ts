import { describe, expect, it } from 'vitest';
import { formatCards, parseCards } from '../../src/core/cards/index.ts';
import {
  bestFive,
  evaluate,
  HandCategory,
  handCategory,
  type HandValue,
  isRoyalFlush,
} from '../../src/core/eval/index.ts';

const ev = (cards: string): HandValue => evaluate(parseCards(cards));
const category = (cards: string): HandCategory => handCategory(ev(cards));
const best = (cards: string): string =>
  formatCards([...bestFive(parseCards(cards)).cards].sort((a, b) => b - a));

describe('hand-picked evaluator cases (AGENTS.md §13.1)', () => {
  it('recognises the wheel as a five-high straight that loses to six-high', () => {
    expect(category('As 2d 3h 4c 5s Kd Qh')).toBe(HandCategory.Straight);
    expect(ev('As 2d 3h 4c 5s')).toBeLessThan(ev('2d 3h 4c 5s 6d'));
    expect(ev('As 2d 3h 4c 5s')).toBeGreaterThan(ev('Ah Ad Ac Kd Qs'));
  });

  it('recognises the steel wheel (five-high straight flush)', () => {
    const steel = ev('Ah 2h 3h 4h 5h Kc Kd');
    expect(handCategory(steel)).toBe(HandCategory.StraightFlush);
    expect(isRoyalFlush(steel)).toBe(false);
    expect(steel).toBeLessThan(ev('2h 3h 4h 5h 6h'));
    expect(steel).toBeGreaterThan(ev('Ac Ad Ah As Kd'));
  });

  it('recognises a royal flush', () => {
    const royal = ev('Ts Js Qs Ks As 2d 3c');
    expect(isRoyalFlush(royal)).toBe(true);
    expect(royal).toBeGreaterThan(ev('9s Ts Js Qs Ks'));
  });

  it('does not wrap straights around the ace', () => {
    expect(category('Qs Kd Ah 2c 3d 7h 8s')).toBe(HandCategory.HighCard);
  });

  it('lets the board play: both players tie with the board straight', () => {
    const board = '5c 6d 7h 8s 9c';
    expect(ev(`${board} 2d 2h`)).toBe(ev(`${board} 3d Kh`));
    expect(best(`${board} 2d 2h`)).toBe(best(board));
  });

  it('uses the higher straight when a hole card extends the board', () => {
    expect(ev('5c 6d 7h 8s 9c Td 2h')).toBeGreaterThan(ev('5c 6d 7h 8s 9c 4d 2s'));
  });

  it('handles counterfeited two pair: the board pairs above the hole pair', () => {
    // Hole 5-5 on a board of K-K-Q-Q-2: best hand is K-K-Q-Q with a 5 kicker, the 5-5 is dead.
    const counterfeited = ev('5c 5d Kh Ks Qh Qs 2c');
    const aceKicker = ev('Ac 3d Kh Ks Qh Qs 2c');
    expect(handCategory(counterfeited)).toBe(HandCategory.TwoPair);
    expect(aceKicker).toBeGreaterThan(counterfeited);
    // Both fives tie as the kicker; bestFive keeps the first one in input order (5c).
    expect(best('5c 5d Kh Ks Qh Qs 2c')).toBe(formatCards(parseCards('Ks Kh Qs Qh 5c')));
  });

  it('uses the third pair as a kicker when holding three pairs', () => {
    // A-A, K-K, Q-Q, 2: best is A-A-K-K with a Q kicker (the third pair), beating a J kicker.
    expect(ev('Ac Ad Kc Kd Qc Qd 2s')).toBeGreaterThan(ev('Ac Ad Kc Kd Jc 2d 3s'));
  });

  it('splits kicker ties when the fifth card is on the board', () => {
    // Both play A-K-Q-J-9 high; the hole kickers (3 and 2) are below the board.
    expect(ev('Ah Kd Qc Js 9h 3c 2d')).toBe(ev('Ah Kd Qc Js 9h 2c 3s'));
  });

  it('decides pairs by kickers in order', () => {
    expect(ev('Ah Ad Kc Qs 9h')).toBeGreaterThan(ev('Ah Ad Kc Qs 8h'));
    expect(ev('Ah Ad Kc Qs 2h')).toBeGreaterThan(ev('Ah Ad Kc Js Th'));
  });

  it('compares flush against flush down to the fifth card', () => {
    const board = 'Ah Kh 9h 4c 3d';
    const fifthSeven = ev(`${board} 7h 2h`); // A-K-9-7-2
    const fifthSix = ev(`${board} 6h 5h`); // A-K-9-6-5
    expect(handCategory(fifthSeven)).toBe(HandCategory.Flush);
    expect(fifthSeven).toBeGreaterThan(fifthSix);
    expect(ev('Ah Kh 9h 7h 3h')).toBeGreaterThan(ev('Ah Kh 9h 7h 2h'));
  });

  it('builds the best full house from two sets of trips on the board', () => {
    // Board 8-8-8-4-4, hole 4-x: two trips (8s and 4s) -> eights full of fours.
    const twoTrips = ev('8c 8d 8h 4c 4d 4h Ks');
    expect(handCategory(twoTrips)).toBe(HandCategory.FullHouse);
    expect(twoTrips).toBe(ev('8c 8d 8h 4c 4d 2s 3s'));
    // Trips of K in hand with trips of 8 on board -> kings full of eights.
    expect(ev('Kc Kd Ks 8c 8d 8h 2s')).toBeGreaterThan(ev('8c 8d 8h Kc Kd 2s 3s'));
  });

  it('picks the best pair for a full house with trips and two pairs', () => {
    expect(ev('9c 9d 9h Ac Ad 2c 2d')).toBe(ev('9c 9d 9h Ac Ad 3c 4d'));
  });

  it('uses the best kicker with quads', () => {
    expect(ev('7c 7d 7h 7s Ac 2d 3h')).toBeGreaterThan(ev('7c 7d 7h 7s Kc Qd Jh'));
    expect(ev('7c 7d 7h 7s Ac Ad Ah')).toBe(ev('7c 7d 7h 7s As 2d 3h'));
  });

  it('prefers a flush over a straight and a straight flush over trips and flushes', () => {
    expect(category('2h 5h 9h Jh Kh Tc Qd')).toBe(HandCategory.Flush);
    expect(category('6c 7c 8c 9c Tc Td Th')).toBe(HandCategory.StraightFlush);
    expect(category('6c 7c 8c 9c Tc Ac 2c')).toBe(HandCategory.StraightFlush);
  });

  it('prefers quads over a full house and a full house over a flush', () => {
    expect(category('9c 9d 9h 9s Kc Kd 2c')).toBe(HandCategory.FourOfAKind);
    expect(category('9c 9d 9h Kc Kd 2c 5c')).toBe(HandCategory.FullHouse);
  });

  it('finds a straight flush inside a six-card flush', () => {
    const value = ev('2s 3s 4s 5s 6s Ks Ad');
    expect(handCategory(value)).toBe(HandCategory.StraightFlush);
    expect(best('2s 3s 4s 5s 6s Ks Ad')).toBe(formatCards(parseCards('6s 5s 4s 3s 2s')));
  });

  it('evaluates 5, 6 and 7 cards and rejects other sizes', () => {
    expect(category('Ah Ad Kc Qs 9h')).toBe(HandCategory.OnePair);
    expect(category('Ah Ad Kc Qs 9h 9c')).toBe(HandCategory.TwoPair);
    expect(() => ev('Ah Ad Kc Qs')).toThrow(RangeError);
    expect(() => ev('Ah Ad Kc Qs 9h 9c 2d 3d')).toThrow(RangeError);
  });

  it('bestFive returns five of the input cards with the same value', () => {
    const cards = parseCards('Ah Kh Qh Jh Th 9h 8h');
    const result = bestFive(cards);
    expect(result.cards).toHaveLength(5);
    expect(result.value).toBe(evaluate(cards));
    expect(evaluate(result.cards)).toBe(result.value);
    for (const card of result.cards) expect(cards).toContain(card);
  });
});

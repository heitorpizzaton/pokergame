import { describe, expect, it } from 'vitest';
import {
  type Card,
  CardParseError,
  DECK_SIZE,
  formatCard,
  formatCards,
  isCard,
  makeCard,
  orderedDeck,
  parseCard,
  parseCards,
  type Rank,
  rankOf,
  Ranks,
  type Suit,
  suitOf,
  Suits,
} from '../../src/core/cards/index.ts';

describe('card encoding', () => {
  it('encodes rank * 4 + suit and decodes back', () => {
    for (let rank = 0; rank < 13; rank++) {
      for (let suit = 0; suit < 4; suit++) {
        const card = makeCard(rank as Rank, suit as Suit);
        expect(card).toBe(rank * 4 + suit);
        expect(rankOf(card)).toBe(rank);
        expect(suitOf(card)).toBe(suit);
      }
    }
  });

  it('uses the documented rank and suit indices', () => {
    expect(parseCard('2c')).toBe(makeCard(Ranks.Two, Suits.Clubs));
    expect(parseCard('As')).toBe(makeCard(Ranks.Ace, Suits.Spades));
    expect(parseCard('Td')).toBe(makeCard(Ranks.Ten, Suits.Diamonds));
    expect(parseCard('Qh')).toBe(makeCard(Ranks.Queen, Suits.Hearts));
    expect(parseCard('As')).toBe(51);
  });

  it('round-trips every card through format and parse', () => {
    const seen = new Set<string>();
    for (const card of orderedDeck()) {
      const text = formatCard(card);
      seen.add(text);
      expect(parseCard(text)).toBe(card);
    }
    expect(seen.size).toBe(DECK_SIZE);
  });

  it('parses case-insensitively', () => {
    expect(parseCard('aS')).toBe(parseCard('As'));
    expect(parseCard('tD')).toBe(parseCard('Td'));
  });

  it.each(['', 'A', 'Asx', '1s', 'Ax', '10s', 'Zs'])('rejects %j', (text) => {
    expect(() => parseCard(text)).toThrow(CardParseError);
  });

  it('parses card lists in several layouts', () => {
    const expected = [parseCard('As'), parseCard('Kd'), parseCard('Qh')];
    expect(parseCards('AsKdQh')).toEqual(expected);
    expect(parseCards('As Kd Qh')).toEqual(expected);
    expect(parseCards('As, Kd,Qh')).toEqual(expected);
    expect(parseCards('')).toEqual([]);
  });

  it('rejects duplicate and malformed card lists', () => {
    expect(() => parseCards('AsAs')).toThrow(CardParseError);
    expect(() => parseCards('AsK')).toThrow(CardParseError);
  });

  it('formats card lists', () => {
    expect(formatCards(parseCards('AsKd'))).toBe('As Kd');
    expect(formatCards(parseCards('AsKd'), '')).toBe('AsKd');
  });

  it('validates card values', () => {
    expect(isCard(0)).toBe(true);
    expect(isCard(51)).toBe(true);
    expect(isCard(52)).toBe(false);
    expect(isCard(-1)).toBe(false);
    expect(isCard(1.5)).toBe(false);
    expect(isCard('As')).toBe(false);
  });

  it('builds a fresh ordered deck of 52 distinct cards each call', () => {
    const a = orderedDeck();
    const b = orderedDeck();
    expect(a).not.toBe(b);
    expect(a).toEqual(Array.from({ length: 52 }, (_, i) => i as Card));
  });
});

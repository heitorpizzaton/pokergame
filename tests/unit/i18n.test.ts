import { describe, expect, it } from 'vitest';
import { parseCards } from '../../src/core/cards/index.ts';
import { evaluate } from '../../src/core/eval/index.ts';
import {
  cardLabel,
  formatBigBlinds,
  formatChips,
  formatDuration,
  formatPercent,
  handName,
  strings,
} from '../../src/i18n/index.ts';

const name = (cards: string) => handName(evaluate(parseCards(cards)));
const card = (text: string) => {
  const [c] = parseCards(text);
  if (c === undefined) throw new Error(text);
  return c;
};

describe('i18n (AGENTS.md §11.6)', () => {
  it('carries the mandatory entertainment disclaimer (§2.6)', () => {
    expect(strings.legal.entertainment).toBe(
      'Jogo de entretenimento. As fichas não têm valor real.',
    );
  });

  it('formats numbers the pt-BR way', () => {
    expect(formatChips(1250)).toBe('1.250');
    expect(formatChips(1_000_000)).toBe('1.000.000');
    expect(formatPercent(0.3497)).toBe('35,0%');
    expect(formatPercent(0.349)).toBe('34,9%');
    expect(formatBigBlinds(2500, 100)).toBe('25 BB');
    expect(formatBigBlinds(250, 100)).toBe('2,5 BB');
    expect(formatDuration(12 * 60_000)).toBe('12 min');
    expect(formatDuration(65 * 60_000)).toBe('1 h 05 min');
  });

  it('names cards for screen readers', () => {
    expect(cardLabel(card('As'))).toBe('Ás de Espadas');
    expect(cardLabel(card('Qh'))).toBe('Dama de Copas');
    expect(cardLabel(card('2c'))).toBe('Dois de Paus');
    expect(cardLabel(card('Td'))).toBe('Dez de Ouros');
  });

  it('names hands in pt-BR', () => {
    expect(name('KsKhKd7c7h')).toBe('Full House, Reis cheios de Setes');
    expect(name('KsKh7c7h2d')).toBe('Dois Pares, Reis e Setes');
    expect(name('6c7d8h9sTc')).toBe('Sequência até o Dez');
    expect(name('8c9dThJsQc')).toBe('Sequência até a Dama');
    expect(name('As2d3h4c5s')).toBe('Sequência até o Cinco');
    expect(name('QsQh2c5d9h')).toBe('Par de Damas');
    expect(name('AsKsQsJsTs')).toBe('Royal Flush');
    expect(name('5h6h7h8h9h')).toBe('Straight Flush até o Nove');
    expect(name('9s9h9d9c2s')).toBe('Quadra de Noves');
    expect(name('Ah9h7h4h2h')).toBe('Flush, Ás alto');
    expect(name('Qh9h7h4h2h')).toBe('Flush, Dama alta');
    expect(name('7s7h7d2c4h')).toBe('Trinca de Setes');
    expect(name('As9h7d4c2h')).toBe('Carta Alta, Ás');
  });
});

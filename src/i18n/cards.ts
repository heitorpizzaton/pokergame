import { type Card, rankOf, suitOf } from '../core/cards/index.ts';

/** Rank names in pt-BR, indexed by rank (0 = deuce … 12 = ace). */
export const RANK_NAMES = [
  'Dois',
  'Três',
  'Quatro',
  'Cinco',
  'Seis',
  'Sete',
  'Oito',
  'Nove',
  'Dez',
  'Valete',
  'Dama',
  'Rei',
  'Ás',
] as const;

export const RANK_PLURALS = [
  'Dois',
  'Treses',
  'Quatros',
  'Cincos',
  'Seis',
  'Setes',
  'Oitos',
  'Noves',
  'Dezes',
  'Valetes',
  'Damas',
  'Reis',
  'Ases',
] as const;

/** Grammatical gender for articles ("até o Dez", "até a Dama"). */
export const RANK_FEMININE = [
  false,
  false,
  false,
  false,
  false,
  false,
  false,
  false,
  false,
  false,
  true,
  false,
  false,
] as const;

/** Suit names in pt-BR, indexed by suit (0 = clubs … 3 = spades). */
export const SUIT_NAMES = ['Paus', 'Ouros', 'Copas', 'Espadas'] as const;

/** Short rank shown on the card face. */
export const RANK_SYMBOLS = [
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '10',
  'J',
  'Q',
  'K',
  'A',
] as const;
export const SUIT_SYMBOLS = ['♣', '♦', '♥', '♠'] as const;

export function rankName(rank: number): string {
  return RANK_NAMES[rank] ?? '';
}

export function rankPlural(rank: number): string {
  return RANK_PLURALS[rank] ?? '';
}

/** Accessible label, e.g. "Ás de Espadas" (AGENTS.md §12). */
export function cardLabel(card: Card): string {
  return `${rankName(rankOf(card))} de ${SUIT_NAMES[suitOf(card)]}`;
}

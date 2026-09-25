import { HandCategory, handCategory, type HandValue } from '../core/eval/index.ts';
import { RANK_FEMININE, rankName, rankPlural } from './cards.ts';

function nibble(value: HandValue, index: number): number {
  return (value >> (16 - 4 * index)) & 0xf;
}

function upTo(rank: number): string {
  return `${RANK_FEMININE[rank] ? 'até a' : 'até o'} ${rankName(rank)}`;
}

function high(rank: number): string {
  return `${rankName(rank)} ${RANK_FEMININE[rank] ? 'alta' : 'alto'}`;
}

/**
 * The pt-BR name of a hand (AGENTS.md §5.6, §11.6), e.g. "Full House, Reis cheios de Setes",
 * "Dois Pares, Reis e Setes", "Sequência até o Dez".
 */
export function handName(value: HandValue): string {
  const r1 = nibble(value, 0);
  const r2 = nibble(value, 1);
  switch (handCategory(value)) {
    case HandCategory.StraightFlush:
      return r1 === 12 ? 'Royal Flush' : `Straight Flush ${upTo(r1)}`;
    case HandCategory.FourOfAKind:
      return `Quadra de ${rankPlural(r1)}`;
    case HandCategory.FullHouse:
      return `Full House, ${rankPlural(r1)} cheios de ${rankPlural(r2)}`;
    case HandCategory.Flush:
      return `Flush, ${high(r1)}`;
    case HandCategory.Straight:
      return `Sequência ${upTo(r1)}`;
    case HandCategory.ThreeOfAKind:
      return `Trinca de ${rankPlural(r1)}`;
    case HandCategory.TwoPair:
      return `Dois Pares, ${rankPlural(r1)} e ${rankPlural(r2)}`;
    case HandCategory.OnePair:
      return `Par de ${rankPlural(r1)}`;
    case HandCategory.HighCard:
      return `Carta Alta, ${rankName(r1)}`;
  }
}

/** Short category name (glossary of §11.6). */
export function categoryName(category: HandCategory): string {
  return CATEGORY_NAMES[category];
}

const CATEGORY_NAMES: Record<HandCategory, string> = {
  [HandCategory.HighCard]: 'Carta Alta',
  [HandCategory.OnePair]: 'Par',
  [HandCategory.TwoPair]: 'Dois Pares',
  [HandCategory.ThreeOfAKind]: 'Trinca',
  [HandCategory.Straight]: 'Sequência',
  [HandCategory.Flush]: 'Flush',
  [HandCategory.FullHouse]: 'Full House',
  [HandCategory.FourOfAKind]: 'Quadra',
  [HandCategory.StraightFlush]: 'Straight Flush',
};

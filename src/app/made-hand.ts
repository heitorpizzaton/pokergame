import { type Card, rankOf, suitOf } from '../core/cards/index.ts';
import { evaluate } from '../core/eval/index.ts';
import { handName, rankName, rankPlural, strings } from '../i18n/index.ts';

/**
 * The user's current hand in pt-BR (AGENTS.md §31.2.1), from their hole cards and the board they
 * can see: "Par de Damas", "Dois Pares, Reis e Três"… Before the flop it names the starting hand
 * ("Ás e Rei do mesmo naipe"). Uses only cards the user is entitled to see.
 */
export function madeHandLabel(hole: readonly Card[] | null, board: readonly Card[]): string | null {
  if (hole?.length !== 2) return null;
  if (board.length >= 3) return handName(evaluate([...hole, ...board]));
  const [a, b] = hole as [Card, Card];
  const high = Math.max(rankOf(a), rankOf(b));
  const low = Math.min(rankOf(a), rankOf(b));
  if (high === low) return strings.table.madeHand.pair(rankPlural(high));
  const pairName = strings.table.madeHand.unpaired(rankName(high), rankName(low));
  return suitOf(a) === suitOf(b) ? strings.table.madeHand.suited(pairName) : pairName;
}

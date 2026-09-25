import { boardDeckPositions, verifyCommitment } from '../core/fairness/index.ts';
import type { HandRecord } from './record.ts';

export interface FairnessCheck {
  /** The revealed deck and salt hash to the commitment published before the hand. */
  readonly commitment: boolean;
  /** Every card seen in the hand (the user's, the board, cards shown) sits where it was dealt from. */
  readonly cards: boolean;
}

/** "Verificar" (AGENTS.md §14, Phase 8). Null for records saved before commitments existed. */
export function checkFairness(record: HandRecord): FairnessCheck | null {
  const proof = record.fairness;
  if (!proof) return null;
  const commitment = verifyCommitment(proof.hash, { deck: proof.deck, salt: proof.salt });
  const positionsOf = (seat: number) => proof.dealOrder.flatMap((s, i) => (s === seat ? [i] : []));
  const holeMatches = (seat: number, cards: readonly number[]) => {
    const positions = positionsOf(seat);
    return (
      positions.length === cards.length &&
      cards.every((c, i) => proof.deck[positions[i] ?? -1] === c)
    );
  };
  const boardPositions = boardDeckPositions(proof.dealOrder.length);
  const cards =
    (record.userHole === null || holeMatches(record.userSeat, record.userHole)) &&
    record.shown.every((s) => holeMatches(s.seat, s.cards)) &&
    record.board.every((c, i) => proof.deck[boardPositions[i] ?? -1] === c);
  return { commitment, cards };
}

import { formatCards } from '../core/cards/index.ts';
import { HandCategory, handCategory, type HandValue } from '../core/eval/index.ts';
import type { HandRecord } from './record.ts';

/**
 * Plain-text hand histories in a PokerStars-like English format (AGENTS.md §10.2), so external
 * tools can read them. This is a file format, not UI text, so it is English by design.
 */
const RANKS = [
  'Deuce',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Jack',
  'Queen',
  'King',
  'Ace',
];
const PLURALS = [
  'Deuces',
  'Threes',
  'Fours',
  'Fives',
  'Sixes',
  'Sevens',
  'Eights',
  'Nines',
  'Tens',
  'Jacks',
  'Queens',
  'Kings',
  'Aces',
];

function nib(value: HandValue, i: number): number {
  return (value >> (16 - 4 * i)) & 0xf;
}

export function englishHandName(value: HandValue): string {
  const r1 = nib(value, 0);
  const r2 = nib(value, 1);
  switch (handCategory(value)) {
    case HandCategory.StraightFlush:
      return r1 === 12
        ? 'a Royal Flush'
        : `a straight flush, ${RANKS[r1 - 4] ?? 'Ace'} to ${RANKS[r1] ?? ''}`;
    case HandCategory.FourOfAKind:
      return `four of a kind, ${PLURALS[r1] ?? ''}`;
    case HandCategory.FullHouse:
      return `a full house, ${PLURALS[r1] ?? ''} full of ${PLURALS[r2] ?? ''}`;
    case HandCategory.Flush:
      return `a flush, ${RANKS[r1] ?? ''} high`;
    case HandCategory.Straight:
      return `a straight, ${r1 === 3 ? 'Ace' : (RANKS[r1 - 4] ?? '')} to ${RANKS[r1] ?? ''}`;
    case HandCategory.ThreeOfAKind:
      return `three of a kind, ${PLURALS[r1] ?? ''}`;
    case HandCategory.TwoPair:
      return `two pair, ${PLURALS[r1] ?? ''} and ${PLURALS[r2] ?? ''}`;
    case HandCategory.OnePair:
      return `a pair of ${PLURALS[r1] ?? ''}`;
    case HandCategory.HighCard:
      return `high card ${RANKS[r1] ?? ''}`;
  }
}

function stamp(ms: number): string {
  const d = new Date(ms);
  const two = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${two(d.getMonth() + 1)}/${two(d.getDate())} ${two(d.getHours())}:${two(d.getMinutes())}:${two(d.getSeconds())}`;
}

export function toPokerStarsText(record: HandRecord): string {
  const name = (seat: number) =>
    record.seats.find((s) => s.seat === seat)?.name ?? `Seat ${seat + 1}`;
  const lines: string[] = [];
  const handId = `${record.sessionId.replace(/\D/g, '').slice(-8)}${String(record.handNumber).padStart(5, '0')}`;
  lines.push(
    `PokerStars Hand #${handId}: Hold'em No Limit (${record.smallBlind}/${record.bigBlind}) - ${stamp(record.startedAt)}`,
  );
  lines.push(
    `Table 'Mesa Viva' ${record.seats.length}-max Seat #${record.button + 1} is the button`,
  );
  for (const s of record.seats) lines.push(`Seat ${s.seat + 1}: ${s.name} (${s.stack} in chips)`);
  for (const b of record.blinds) {
    lines.push(`${name(b.seat)}: posts ${b.blind} blind ${b.amount}`);
  }
  lines.push('*** HOLE CARDS ***');
  if (record.userHole)
    lines.push(`Dealt to ${name(record.userSeat)} [${formatCards(record.userHole)}]`);

  let street = 'preflop';
  let currentBet = record.bigBlind;
  const boardAt = (n: number) => formatCards(record.board.slice(0, n));
  for (const a of record.actions) {
    if (a.street !== street) {
      street = a.street;
      currentBet = 0;
      if (street === 'flop') lines.push(`*** FLOP *** [${boardAt(3)}]`);
      if (street === 'turn')
        lines.push(`*** TURN *** [${boardAt(3)}] [${formatCards(record.board.slice(3, 4))}]`);
      if (street === 'river')
        lines.push(`*** RIVER *** [${boardAt(4)}] [${formatCards(record.board.slice(4, 5))}]`);
    }
    const allIn = a.allIn ? ' and is all-in' : '';
    switch (a.kind) {
      case 'fold':
        lines.push(`${name(a.seat)}: folds`);
        break;
      case 'check':
        lines.push(`${name(a.seat)}: checks`);
        break;
      case 'call':
        lines.push(`${name(a.seat)}: calls ${a.amount}${allIn}`);
        break;
      case 'bet':
        lines.push(`${name(a.seat)}: bets ${a.to}${allIn}`);
        currentBet = a.to;
        break;
      case 'raise':
        lines.push(`${name(a.seat)}: raises ${a.to - currentBet} to ${a.to}${allIn}`);
        currentBet = a.to;
        break;
    }
  }
  // Streets dealt after the last action (all-in runouts).
  const dealtStreets = street === 'preflop' ? 0 : street === 'flop' ? 3 : street === 'turn' ? 4 : 5;
  if (record.board.length > dealtStreets) {
    if (dealtStreets < 3 && record.board.length >= 3) lines.push(`*** FLOP *** [${boardAt(3)}]`);
    if (dealtStreets < 4 && record.board.length >= 4)
      lines.push(`*** TURN *** [${boardAt(3)}] [${formatCards(record.board.slice(3, 4))}]`);
    if (dealtStreets < 5 && record.board.length >= 5)
      lines.push(`*** RIVER *** [${boardAt(4)}] [${formatCards(record.board.slice(4, 5))}]`);
  }
  for (const u of record.uncalled)
    lines.push(`Uncalled bet (${u.amount}) returned to ${name(u.seat)}`);

  const wentToShowdown = record.awards.some((a) => a.value !== null);
  if (wentToShowdown) lines.push('*** SHOW DOWN ***');
  for (const s of record.shown) {
    const award = record.awards.find(
      (a) => a.winners.some((w) => w.seat === s.seat) && a.value !== null,
    );
    const desc = award?.value != null ? ` (${englishHandName(award.value)})` : '';
    lines.push(`${name(s.seat)}: shows [${formatCards(s.cards)}]${desc}`);
  }
  for (const seat of record.mucked) lines.push(`${name(seat)}: mucks hand`);
  for (const a of record.awards) {
    const pot =
      record.awards.length === 1 ? 'pot' : a.potIndex === 0 ? 'main pot' : `side pot-${a.potIndex}`;
    for (const w of a.winners) lines.push(`${name(w.seat)} collected ${w.amount} from ${pot}`);
  }
  lines.push('*** SUMMARY ***');
  lines.push(`Total pot ${record.potTotal} | Rake 0`);
  if (record.board.length > 0) lines.push(`Board [${formatCards(record.board)}]`);
  for (const s of record.seats) {
    const won = record.awards
      .flatMap((a) => a.winners)
      .filter((w) => w.seat === s.seat)
      .reduce((sum, w) => sum + w.amount, 0);
    const folded = record.actions.find((a) => a.seat === s.seat && a.kind === 'fold');
    const outcome =
      won > 0
        ? `collected (${won})`
        : folded
          ? `folded on the ${folded.street === 'preflop' ? 'Preflop' : folded.street.charAt(0).toUpperCase() + folded.street.slice(1)}`
          : 'lost';
    lines.push(`Seat ${s.seat + 1}: ${s.name} ${outcome}`);
  }
  return lines.join('\n');
}

/** A whole session: hands in play order, separated by blank lines. */
export function sessionToPokerStarsText(records: readonly HandRecord[]): string {
  return [...records]
    .sort((a, b) => a.startedAt - b.startedAt)
    .map(toPokerStarsText)
    .join('\n\n\n');
}

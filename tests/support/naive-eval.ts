/**
 * Independent, deliberately simple five-card evaluator used as a test oracle. It shares no code
 * with src/core/eval: it groups ranks by count, sorts, and checks flush and straight directly.
 * It returns values in the same layout as HandValue so the two can be compared exactly.
 */
export function naiveEvaluate5(cards: readonly number[]): number {
  if (cards.length !== 5) throw new Error('naiveEvaluate5 needs exactly 5 cards');
  const ranks = cards.map((c) => c >> 2);
  const suits = cards.map((c) => c & 3);

  const counts = new Map<number, number>();
  for (const r of ranks) counts.set(r, (counts.get(r) ?? 0) + 1);
  // Groups ordered by count desc, then rank desc: e.g. full house -> [trips, pair].
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const ordered = groups.map(([rank]) => rank);
  const shape = groups.map(([, count]) => count).join('');

  const isFlush = suits.every((s) => s === suits[0]);
  const distinctDesc = [...counts.keys()].sort((a, b) => b - a);
  let straightTop = -1;
  if (distinctDesc.length === 5) {
    if ((distinctDesc[0] as number) - (distinctDesc[4] as number) === 4) {
      straightTop = distinctDesc[0] as number;
    } else if (distinctDesc.join(',') === '12,3,2,1,0') {
      straightTop = 3; // wheel: A-2-3-4-5 is five-high
    }
  }

  const pack = (category: number, rs: readonly number[]): number => {
    let value = category << 20;
    rs.forEach((r, i) => (value |= r << (16 - 4 * i)));
    return value;
  };

  if (isFlush && straightTop >= 0) return pack(8, [straightTop]);
  if (shape === '41') return pack(7, ordered);
  if (shape === '32') return pack(6, ordered);
  if (isFlush) return pack(5, distinctDesc);
  if (straightTop >= 0) return pack(4, [straightTop]);
  if (shape === '311') return pack(3, ordered);
  if (shape === '221') return pack(2, ordered);
  if (shape === '2111') return pack(1, ordered);
  return pack(0, ordered);
}

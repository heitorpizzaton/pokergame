/** pt-BR number formatting (AGENTS.md §11.6): `1.250` fichas, `34,9%`. */
const integer = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
const oneDecimal = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

/** Chip amount with thousands separators, e.g. 1250 → "1.250". */
export function formatChips(amount: number): string {
  return integer.format(amount);
}

/** Probability in [0, 1] as a percentage with one decimal, e.g. 0.3497 → "35,0%". */
export function formatPercent(probability: number): string {
  return `${oneDecimal.format(probability * 100)}%`;
}

/** Amount in big blinds, e.g. 2500 with BB 100 → "25 BB", 250 → "2,5 BB". */
export function formatBigBlinds(amount: number, bigBlind: number): string {
  const bbs = amount / bigBlind;
  const text = Number.isInteger(bbs) ? integer.format(bbs) : oneDecimal.format(bbs);
  return `${text} BB`;
}

/** Elapsed time as "12 min" or "1 h 05 min". */
export function formatDuration(ms: number): string {
  const minutes = Math.max(0, Math.round(ms / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `${hours} h ${String(minutes % 60).padStart(2, '0')} min`;
}

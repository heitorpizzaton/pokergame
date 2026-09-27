import type { TableSnapshot } from '../../app/game-controller.ts';
import { formatChips, handName, strings } from '../../i18n/index.ts';

/** One line per winner of the hand, for the result banner and screen-reader announcements. */
export function resultLines(snapshot: TableSnapshot): string[] {
  return (snapshot.result?.winners ?? []).map((w) => {
    const name = snapshot.view.seats[w.seat]?.name ?? '';
    const amount = formatChips(w.amount);
    const text =
      w.seat === snapshot.userSeat
        ? strings.table.youWin(amount)
        : strings.table.wins(name, amount);
    return w.hand !== null ? `${text} · ${handName(w.hand)}` : text;
  });
}

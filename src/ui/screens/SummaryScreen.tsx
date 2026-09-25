import type { TableSnapshot } from '../../app/game-controller.ts';
import { formatChips, formatDuration, formatPercent, handName, strings } from '../../i18n/index.ts';
import styles from './Screens.module.css';

interface Props {
  readonly snapshot: TableSnapshot;
  readonly onWatch: () => void;
  readonly onPlayAgain: () => void;
  readonly onMenu: () => void;
}

/** Summary / Victory screen (AGENTS.md §5.8). */
export function SummaryScreen({ snapshot, onWatch, onPlayAgain, onMenu }: Props) {
  const t = strings.summary;
  const { stats } = snapshot;
  const won = snapshot.winnerSeat === snapshot.userSeat;
  const place = snapshot.userPlace ?? 1;
  const gameContinues = snapshot.phase === 'userOut' && snapshot.winnerSeat === null;
  const duration = (snapshot.endedAt ?? stats.startedAt) - stats.startedAt;
  const winnerName =
    snapshot.winnerSeat !== null && !won ? snapshot.view.seats[snapshot.winnerSeat]?.name : null;

  const rows: [string, string][] = [
    [t.handsPlayed, String(stats.handsPlayed)],
    [t.handsWon, String(stats.handsWon)],
    [t.biggestPot, stats.biggestPotWon > 0 ? formatChips(stats.biggestPotWon) : t.none],
    [t.bestHand, stats.bestHand !== null ? handName(stats.bestHand) : t.none],
    [t.vpip, formatPercent(stats.vpip)],
    [t.pfr, formatPercent(stats.pfr)],
    [t.duration, formatDuration(duration)],
  ];

  return (
    <main
      className={styles.screen}
      data-testid="summary-screen"
      data-result={won ? 'victory' : 'busted'}
    >
      <section className={styles.panel}>
        <h1 className={styles.title}>{won ? t.victory : t.busted}</h1>
        <p className={styles.subtitle} data-testid="finishing-place">
          {t.finished(place, snapshot.playerCount)}
        </p>
        {winnerName && <p className={styles.hint}>{t.winnerIs(winnerName)}</p>}
        <dl className={styles.stats}>
          {rows.map(([label, value]) => (
            <div key={label} className={styles.statRow}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
        <div className={styles.buttons}>
          {gameContinues && (
            <button type="button" className={styles.secondary} onClick={onWatch}>
              {t.watch}
            </button>
          )}
          <button type="button" className={styles.primary} onClick={onPlayAgain}>
            {t.playAgain}
          </button>
          <button type="button" className={styles.secondary} onClick={onMenu}>
            {t.menu}
          </button>
        </div>
      </section>
    </main>
  );
}

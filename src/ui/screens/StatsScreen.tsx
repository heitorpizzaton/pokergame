import { useState } from 'react';
import type { LifetimeStats } from '../../app/lifetime-stats.ts';
import {
  formatChips,
  formatDecimal,
  formatDuration,
  formatPercent,
  handName,
  strings,
} from '../../i18n/index.ts';
import styles from './Screens.module.css';

interface Props {
  readonly stats: LifetimeStats;
  readonly onReset: () => void;
  readonly onBack: () => void;
}

const t = strings.stats;

/** Lifetime statistics across finished games (AGENTS.md §31.3.3). */
export function StatsScreen({ stats, onReset, onBack }: Props) {
  const [confirmReset, setConfirmReset] = useState(false);
  const empty = stats.games === 0;
  const ratio = (part: number, whole: number) => (whole > 0 ? formatPercent(part / whole) : t.none);

  const rows: [string, string][] = empty
    ? []
    : [
        [t.games, String(stats.games)],
        [t.wins, String(stats.wins)],
        [t.winRate, ratio(stats.wins, stats.games)],
        [
          t.averagePlace,
          t.placeOf(
            formatDecimal(stats.placeSum / stats.games),
            formatDecimal(stats.playersSum / stats.games),
          ),
        ],
        [t.bestPlace, stats.bestPlace !== null ? t.place(stats.bestPlace) : t.none],
        [t.handsPlayed, formatChips(stats.handsPlayed)],
        [t.handsWon, formatChips(stats.handsWon)],
        [t.vpip, ratio(stats.vpipHands, stats.handsPlayed)],
        [t.pfr, ratio(stats.pfrHands, stats.handsPlayed)],
        [t.biggestPot, stats.biggestPotWon > 0 ? formatChips(stats.biggestPotWon) : t.none],
        [t.bestHand, stats.bestHand !== null ? handName(stats.bestHand) : t.none],
        [t.totalTime, formatDuration(stats.totalMs)],
      ];

  return (
    <main className={styles.screen} data-testid="stats-screen">
      <section className={styles.panel}>
        <h1 className={styles.title}>{t.title}</h1>
        <p className={styles.hint}>{empty ? t.empty : t.intro}</p>
        {!empty && (
          <dl className={styles.stats}>
            {rows.map(([label, value]) => (
              <div key={label} className={styles.statRow}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        )}
        <div className={styles.buttons}>
          {!empty &&
            (confirmReset ? (
              <div className={styles.row}>
                <span className={styles.hint}>{t.confirmReset}</span>
                <button
                  type="button"
                  className={styles.secondary}
                  onClick={() => {
                    setConfirmReset(false);
                  }}
                >
                  {t.cancel}
                </button>
                <button
                  type="button"
                  className={styles.primary}
                  data-testid="confirm-reset-stats"
                  onClick={() => {
                    setConfirmReset(false);
                    onReset();
                  }}
                >
                  {t.confirm}
                </button>
              </div>
            ) : (
              <button
                type="button"
                className={styles.secondary}
                onClick={() => {
                  setConfirmReset(true);
                }}
              >
                {t.reset}
              </button>
            ))}
          <button type="button" className={styles.primary} onClick={onBack}>
            {t.back}
          </button>
        </div>
      </section>
    </main>
  );
}

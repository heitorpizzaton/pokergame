import type { OpponentSummary } from '../../app/opponent-stats.ts';
import { formatPercent, strings } from '../../i18n/index.ts';
import { PlayingCard } from './PlayingCard.tsx';
import styles from './Sheet.module.css';

const t = strings.table.profile;

/**
 * An opponent's profile (AGENTS.md §31.2.2): what the table has seen of them in this game, from
 * public actions and shown hands only.
 */
export function OpponentSheet({
  name,
  styleBadge,
  summary,
  fourColor,
  onClose,
}: {
  readonly name: string;
  readonly styleBadge: string | null;
  readonly summary: OpponentSummary;
  readonly fourColor: boolean;
  readonly onClose: () => void;
}) {
  const pct = (v: number | null) => (v === null ? t.noData : formatPercent(v));
  const rows: [string, string][] = [
    [t.hands, String(summary.hands)],
    [t.vpip, pct(summary.vpip)],
    [t.pfr, pct(summary.pfr)],
    [
      t.aggression,
      summary.aggression === null
        ? t.noData
        : summary.aggression.toLocaleString('pt-BR', { maximumFractionDigits: 1 }),
    ],
    [t.showdown, pct(summary.wentToShowdown)],
  ];
  return (
    <div className={styles.overlay} onClick={onClose}>
      <section
        className={styles.sheet}
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-title"
        data-testid="opponent-profile"
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        <div className={styles.header}>
          <h2 id="profile-title" className={styles.title}>
            {t.title(name)}
          </h2>
          <button type="button" className={styles.close} onClick={onClose} aria-label={t.close}>
            ✕
          </button>
        </div>
        <p className={styles.intro}>
          {t.intro}
          {styleBadge ? ` · ${styleBadge}` : ''}
        </p>
        <dl className={styles.rows}>
          {rows.map(([label, value]) => (
            <div key={label} className={styles.row}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
        {summary.shown.length > 0 && (
          <>
            <h3 className={styles.subtitle}>{t.shown}</h3>
            <ul className={styles.shown}>
              {summary.shown.map((h) => (
                <li key={h.handNumber}>
                  <span className={styles.cards}>
                    {h.cards.map((card) => (
                      <PlayingCard key={card} card={card} size="small" fourColor={fourColor} />
                    ))}
                  </span>
                  {t.handNumber(h.handNumber)}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}

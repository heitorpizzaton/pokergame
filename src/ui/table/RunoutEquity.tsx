import { useEffect, useState } from 'react';
import type { Card } from '../../core/cards/index.ts';
import type { EquityResult } from '../../core/equity/index.ts';
import type { PlayerView } from '../../core/view/index.ts';
import { formatPercent, strings } from '../../i18n/index.ts';
import type { EquityClient } from '../../workers/equity-client.ts';
import styles from './RunoutEquity.module.css';

interface Props {
  readonly view: PlayerView;
  readonly board: readonly Card[];
  readonly client: EquityClient;
  readonly userSeat: number;
}

/**
 * Live equity bar during an all-in runout (AGENTS.md §11.4). Every hand in it is public at this
 * point, so exact equity over the remaining board is fair to show.
 */
export function RunoutEquity({ view, board, client, userSeat }: Props) {
  const players = view.seats.filter(
    (s) => s.shownCards?.length === 2 && (s.status === 'active' || s.status === 'allIn'),
  );
  const hands = players.map((s) => s.shownCards ?? []);
  const key = `${hands.map((h) => h.join(',')).join('|')}/${board.join(',')}`;
  const [computed, setComputed] = useState<{
    key: string;
    results: readonly EquityResult[];
  } | null>(null);
  const results = computed?.key === key ? computed.results : null;

  useEffect(() => {
    if (hands.length < 2) return;
    let cancelled = false;
    void client.requestVersus(hands, board).then((r) => {
      if (!cancelled) setComputed({ key, results: r });
    });
    return () => {
      cancelled = true;
    };
    // The request depends only on the key (the hands and the board).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, client]);

  if (players.length < 2) return null;
  return (
    <section
      className={styles.panel}
      aria-label={strings.odds.runoutTitle}
      data-testid="runout-equity"
    >
      <div className={styles.bar} aria-hidden="true">
        {players.map((p, i) => (
          <span
            key={p.seat}
            className={`${styles.segment} ${p.seat === userSeat ? styles.user : ''}`}
            style={{
              flexGrow: results ? Math.max(0.001, results[i]?.equity ?? 0) : 1,
              ['--hue' as string]: String((i * 97) % 360),
            }}
          />
        ))}
      </div>
      <ul className={styles.legend}>
        {players.map((p, i) => {
          const result = results?.[i];
          const name = p.seat === userSeat ? strings.table.you : p.name;
          return (
            <li key={p.seat} className={p.seat === userSeat ? styles.userText : ''}>
              {strings.odds.runoutEquity(
                name,
                result ? formatPercent(result.equity) : strings.odds.computing,
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

import { useEffect, useState } from 'react';
import type { UserClock } from '../../app/game-controller.ts';
import { strings } from '../../i18n/index.ts';
import styles from './ActionTimerBar.module.css';
import { clockState } from './clock-state.ts';

const TICK_MS = 200;

/**
 * The visible action timer (AGENTS.md §31.1.1): a bar on top of the action bar with the seconds
 * left, then the time bank with its own seconds. The ring around the avatar stays as well.
 */
export function ActionTimerBar({
  clock,
  paused,
}: {
  readonly clock: UserClock;
  readonly paused: boolean;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (paused) return;
    const id = setInterval(() => {
      setNow(Date.now());
    }, TICK_MS);
    return () => {
      clearInterval(id);
    };
  }, [paused]);

  const state = clockState(clock, now);
  const t = strings.table.timer;
  return (
    <div
      className={`${styles.timer} ${state.inBank ? styles.bank : ''} ${state.warning ? styles.warning : ''}`}
      data-testid="action-timer"
      data-bank={state.inBank || undefined}
    >
      <span className={styles.label}>{state.inBank ? t.bank : t.label}</span>
      <span className={styles.track} aria-hidden="true">
        <span className={styles.fill} style={{ width: `${(state.fraction * 100).toFixed(1)}%` }} />
      </span>
      <span className={styles.seconds} role="timer" aria-live="off">
        {t.seconds(state.seconds)}
      </span>
    </div>
  );
}

import { type CSSProperties, useEffect, useState } from 'react';
import type { UserClock } from '../../app/game-controller.ts';
import { strings } from '../../i18n/index.ts';
import { vibrate } from '../audio/haptics.ts';
import styles from './UserTimer.module.css';

interface Props {
  readonly clock: UserClock;
  readonly haptics: boolean;
  /** Freezes the countdown while the game is paused (the controller also stops the clock). */
  readonly paused?: boolean;
  /** Called once when the last 5 seconds start (the warning sound). */
  readonly onWarning?: (() => void) | undefined;
}

const WARNING_MS = 5_000;
const R = 20;
const CIRCUMFERENCE = 2 * Math.PI * R;
/** The bank bar is drawn against the 60 s maximum bank (AGENTS.md §9). */
const BANK_SCALE_MS = 60_000;

/**
 * Circular countdown around the user's avatar and a separate time-bank bar (AGENTS.md §9).
 * Both run as CSS animations computed once per turn, so the countdown costs no React renders;
 * a single timeout turns it red with a sound and a vibration for the last 5 seconds. Mount it
 * with `key={clock.startedAt}` so each turn (or resume) starts fresh.
 */
export function UserTimer({ clock, haptics, paused = false, onWarning }: Props) {
  // Where the clock stands when this turn is shown.
  const [start] = useState(() => {
    const elapsed = Math.max(0, Date.now() - clock.startedAt);
    const actionLeft = Math.max(0, clock.actionMs - elapsed);
    const bankLeft = Math.max(0, clock.bankMs - Math.max(0, elapsed - clock.actionMs));
    return { actionLeft, bankLeft, total: actionLeft + bankLeft };
  });
  const [warning, setWarning] = useState(false);

  // An absolute deadline, so re-running the effect (new callbacks) never delays the warning.
  const warnAt = clock.startedAt + clock.actionMs + clock.bankMs - WARNING_MS;
  useEffect(() => {
    if (paused) return;
    const id = setTimeout(
      () => {
        setWarning(true);
        vibrate('timerWarning', haptics);
        onWarning?.();
      },
      Math.max(0, warnAt - Date.now()),
    );
    return () => {
      clearTimeout(id);
    };
  }, [paused, warnAt, haptics, onWarning]);

  const ringStyle = {
    '--from': `${CIRCUMFERENCE * (1 - start.actionLeft / clock.actionMs)}`,
    '--to': `${CIRCUMFERENCE}`,
    '--duration': `${start.actionLeft}ms`,
    animationPlayState: paused ? 'paused' : 'running',
  } as CSSProperties;
  const bankStyle = {
    '--bank-from': `${Math.min(100, (start.bankLeft / BANK_SCALE_MS) * 100)}%`,
    '--duration': `${start.bankLeft}ms`,
    '--delay': `${start.actionLeft}ms`,
    animationPlayState: paused ? 'paused' : 'running',
  } as CSSProperties;

  return (
    <>
      <svg
        className={`${styles.ring} ${warning ? styles.warning : ''}`}
        viewBox="0 0 44 44"
        aria-hidden="true"
      >
        <circle cx="22" cy="22" r={R} className={styles.track} />
        <circle
          cx="22"
          cy="22"
          r={R}
          className={styles.progress}
          strokeDasharray={CIRCUMFERENCE}
          style={ringStyle}
        />
      </svg>
      <span
        className={`${styles.bank} ${start.actionLeft === 0 ? styles.bankActive : ''}`}
        role="timer"
        aria-label={`${strings.table.timeBank}: ${Math.ceil(start.bankLeft / 1000)} s`}
        data-testid="time-bank"
      >
        <span className={styles.bankFill} style={bankStyle} />
      </span>
    </>
  );
}

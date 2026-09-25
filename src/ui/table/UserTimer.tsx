import { useEffect, useRef, useState } from 'react';
import type { UserClock } from '../../app/game-controller.ts';
import { strings } from '../../i18n/index.ts';
import styles from './UserTimer.module.css';

interface Props {
  readonly clock: UserClock;
  readonly haptics: boolean;
}

const WARNING_MS = 5_000;

/**
 * Circular countdown around the user's avatar and a separate time-bank bar (AGENTS.md §9).
 * Turns red in the last 5 seconds, with a gentle vibration when haptics are on.
 */
export function UserTimer({ clock, haptics }: Props) {
  const [now, setNow] = useState(() => Date.now());
  const warned = useRef(false);
  useEffect(() => {
    let frame = 0;
    const tick = () => {
      setNow(Date.now());
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
    };
  }, []);

  const elapsed = Math.max(0, now - clock.startedAt);
  const actionLeft = Math.max(0, clock.actionMs - elapsed);
  const bankLeft = Math.max(0, clock.bankMs - Math.max(0, elapsed - clock.actionMs));
  const totalLeft = actionLeft + bankLeft;
  const inBank = actionLeft === 0;
  const warning = totalLeft <= WARNING_MS;

  useEffect(() => {
    if (warning && !warned.current) {
      warned.current = true;
      if (haptics && 'vibrate' in navigator) navigator.vibrate(80);
    }
  }, [warning, haptics]);

  const fraction = inBank ? 0 : actionLeft / clock.actionMs;
  const r = 20;
  const c = 2 * Math.PI * r;
  return (
    <>
      <svg
        className={`${styles.ring} ${warning ? styles.warning : ''}`}
        viewBox="0 0 44 44"
        aria-hidden="true"
      >
        <circle cx="22" cy="22" r={r} className={styles.track} />
        <circle
          cx="22"
          cy="22"
          r={r}
          className={styles.progress}
          strokeDasharray={c}
          strokeDashoffset={c * (1 - fraction)}
        />
      </svg>
      <span
        className={`${styles.bank} ${inBank ? styles.bankActive : ''}`}
        role="timer"
        aria-label={`${strings.table.timeBank}: ${Math.ceil(bankLeft / 1000)} s`}
        data-testid="time-bank"
      >
        <span style={{ width: `${Math.min(100, (bankLeft / 60_000) * 100)}%` }} />
      </span>
    </>
  );
}

import type { CSSProperties } from 'react';
import styles from './ChipStack.module.css';
import { chipStack } from './chips.ts';

interface Props {
  readonly amount: number;
  readonly smallBlind: number;
  readonly bigBlind: number;
  readonly label?: string | null;
  readonly className?: string | undefined;
  readonly style?: CSSProperties | undefined;
  readonly testId?: string | undefined;
}

/** A vector stack of chips with the exact amount beside it. */
export function ChipStack({
  amount,
  smallBlind,
  bigBlind,
  label,
  className,
  style,
  testId,
}: Props) {
  const chips = chipStack(amount, smallBlind, bigBlind);
  return (
    <span className={`${styles.wrap} ${className ?? ''}`} style={style} data-testid={testId}>
      <span className={styles.stack} aria-hidden="true">
        {chips.map((colour, i) => (
          <span
            key={i}
            className={`${styles.chip} ${styles[`c${colour}`] ?? ''}`}
            style={{ bottom: `${i * 3}px` }}
          />
        ))}
      </span>
      {label !== null && <span className={styles.label}>{label}</span>}
    </span>
  );
}

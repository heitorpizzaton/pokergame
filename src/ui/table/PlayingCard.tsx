import type { CSSProperties } from 'react';
import type { Card } from '../../core/cards/index.ts';
import { rankOf, suitOf } from '../../core/cards/index.ts';
import { cardLabel, RANK_SYMBOLS, strings } from '../../i18n/index.ts';
import styles from './PlayingCard.module.css';
import { SuitIcon } from './SuitIcon.tsx';

interface Props {
  readonly card: Card | null;
  readonly size?: 'small' | 'medium' | 'large';
  readonly dimmed?: boolean;
  readonly highlighted?: boolean;
  /** Four-colour deck: clubs green, diamonds blue (AGENTS.md §11.1). */
  readonly fourColor?: boolean;
  /** Entrance animation: dealt from the dealer, or flipped face up on the board. */
  readonly enter?: 'deal' | 'flip' | null;
  /** Extra CSS variables for the animation (delay, flight offsets). */
  readonly motion?: CSSProperties | undefined;
}

/** A crisp vector card with large indices; `card === null` renders the (original) back. */
export function PlayingCard({
  card,
  size = 'medium',
  dimmed = false,
  highlighted = false,
  fourColor = false,
  enter = null,
  motion,
}: Props) {
  const className = [
    styles.card,
    styles[size],
    dimmed ? styles.dimmed : '',
    highlighted ? styles.highlighted : '',
    enter ? styles[enter] : '',
  ].join(' ');
  if (card === null) {
    return (
      <span
        className={`${className} ${styles.back ?? ''}`}
        style={motion}
        role="img"
        aria-label={strings.table.hiddenCard}
      />
    );
  }
  const suit = suitOf(card);
  const colour = fourColor
    ? [styles.clubs, styles.diamonds, styles.red, styles.black][suit]
    : suit === 1 || suit === 2
      ? styles.red
      : styles.black;
  return (
    <span
      className={`${className} ${colour ?? ''}`}
      style={motion}
      role="img"
      aria-label={cardLabel(card)}
      data-card={card}
      data-highlighted={highlighted || undefined}
    >
      <span className={styles.index}>
        <span className={styles.rank}>{RANK_SYMBOLS[rankOf(card)]}</span>
        <SuitIcon suit={suit} className={styles.indexSuit} />
      </span>
      <SuitIcon suit={suit} className={styles.pip} />
    </span>
  );
}

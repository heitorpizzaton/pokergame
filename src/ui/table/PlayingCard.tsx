import type { Card } from '../../core/cards/index.ts';
import { rankOf, suitOf } from '../../core/cards/index.ts';
import { cardLabel, RANK_SYMBOLS, strings, SUIT_SYMBOLS } from '../../i18n/index.ts';
import styles from './PlayingCard.module.css';

interface Props {
  readonly card: Card | null;
  readonly size?: 'small' | 'medium' | 'large';
  readonly dimmed?: boolean;
  readonly highlighted?: boolean;
}

/** A vector card with large indices; `card === null` renders the back. */
export function PlayingCard({ card, size = 'medium', dimmed = false, highlighted = false }: Props) {
  const className = [
    styles.card,
    styles[size],
    dimmed ? styles.dimmed : '',
    highlighted ? styles.highlighted : '',
  ].join(' ');
  if (card === null) {
    return (
      <span
        className={`${className} ${styles.back ?? ''}`}
        role="img"
        aria-label={strings.table.hiddenCard}
      />
    );
  }
  const suit = suitOf(card);
  const red = suit === 1 || suit === 2;
  return (
    <span
      className={`${className} ${red ? (styles.red ?? '') : (styles.black ?? '')}`}
      role="img"
      aria-label={cardLabel(card)}
      data-card={card}
    >
      <span className={styles.rank}>{RANK_SYMBOLS[rankOf(card)]}</span>
      <span className={styles.suit}>{SUIT_SYMBOLS[suit]}</span>
    </span>
  );
}

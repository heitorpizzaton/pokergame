import type { Card } from '../../core/cards/index.ts';
import type { ActionRecord, PlayerView, Street } from '../../core/view/index.ts';
import { formatChips, strings } from '../../i18n/index.ts';
import { PlayingCard } from './PlayingCard.tsx';
import styles from './Sheet.module.css';

const t = strings.table.log;
const STREETS: readonly Street[] = ['preflop', 'flop', 'turn', 'river'];
/** Board cards visible once each street has been dealt. */
const BOARD_AT: Record<Street, number> = { preflop: 0, flop: 3, turn: 4, river: 5 };

function describe(action: ActionRecord, name: string): string {
  const l = strings.table.lastAction;
  switch (action.kind) {
    case 'fold':
      return `${name}: ${l.fold}`;
    case 'check':
      return `${name}: ${l.check}`;
    case 'call':
      return `${name}: ${l.call(formatChips(action.amount))}`;
    case 'bet':
      return `${name}: ${l.bet(formatChips(action.to))}`;
    case 'raise':
      return `${name}: ${l.raise(formatChips(action.to))}`;
  }
}

/** The actions of the current hand, street by street (AGENTS.md §31.2.3). Public info only. */
export function HandLog({
  view,
  board,
  userSeat,
  fourColor,
  onClose,
}: {
  readonly view: PlayerView;
  /** The board cards the user can see right now. */
  readonly board: readonly Card[];
  readonly userSeat: number;
  readonly fourColor: boolean;
  readonly onClose: () => void;
}) {
  const nameOf = (seat: number) =>
    seat === userSeat ? strings.table.you : (view.seats[seat]?.name ?? '');
  const sb = nameOf(view.smallBlindSeat);
  const bb = nameOf(view.bigBlindSeat);
  return (
    <div className={styles.overlay} onClick={onClose}>
      <section
        className={styles.sheet}
        role="dialog"
        aria-modal="true"
        aria-labelledby="log-title"
        data-testid="hand-log"
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        <div className={styles.header}>
          <h2 id="log-title" className={styles.title}>
            {t.title(view.handNumber)}
          </h2>
          <button type="button" className={styles.close} onClick={onClose} aria-label={t.close}>
            ✕
          </button>
        </div>
        <ul className={styles.log}>
          <li>{t.posted(sb, formatChips(view.smallBlind))}</li>
          <li>{t.posted(bb, formatChips(view.bigBlind))}</li>
        </ul>
        {STREETS.map((street) => {
          const actions = view.actions.filter((a) => a.street === street);
          const cards = board.slice(0, BOARD_AT[street]);
          if (street !== 'preflop' && cards.length < BOARD_AT[street]) return null;
          return (
            <div key={street}>
              <h3 className={styles.street}>{t.streets[street]}</h3>
              {street !== 'preflop' && (
                <div className={styles.board}>
                  {cards.map((card) => (
                    <PlayingCard key={card} card={card} size="small" fourColor={fourColor} />
                  ))}
                </div>
              )}
              {actions.length === 0 ? (
                <p className={styles.intro}>{t.empty}</p>
              ) : (
                <ol className={styles.log}>
                  {actions.map((a, i) => (
                    <li key={i}>{describe(a, nameOf(a.seat))}</li>
                  ))}
                </ol>
              )}
            </div>
          );
        })}
      </section>
    </div>
  );
}

import type { CSSProperties, KeyboardEvent, MouseEvent } from 'react';
import type { StyleId } from '../../ai/index.ts';
import type { UserClock } from '../../app/game-controller.ts';
import type { Card } from '../../core/cards/index.ts';
import type { ActionRecord, PublicSeat } from '../../core/view/index.ts';
import { formatBigBlinds, formatChips, strings } from '../../i18n/index.ts';
import { useCountUp } from '../anim/useCountUp.ts';
import { PlayingCard } from './PlayingCard.tsx';
import styles from './Seat.module.css';
import { UserTimer } from './UserTimer.tsx';

interface Props {
  readonly seat: PublicSeat;
  readonly isUser: boolean;
  readonly isButton: boolean;
  readonly isActing: boolean;
  readonly isWinner: boolean;
  readonly lastAction: ActionRecord | undefined;
  /** The user's own hole cards (only for the user's seat). */
  readonly holeCards: readonly Card[] | null;
  readonly x: number;
  readonly y: number;
  /** Display options from the settings. */
  readonly bigBlind?: number | null;
  readonly style?: StyleId | null;
  readonly fourColor?: boolean;
  readonly clock?: UserClock | null;
  readonly haptics?: boolean;
  readonly away?: boolean;
  /** The game is paused: the countdown freezes. */
  readonly paused?: boolean;
  /** Plays the timer warning sound (AGENTS.md §9). */
  readonly onTimerWarning?: () => void;
  /** Deal animation: delay of each hole card and the dealer's offset (container units). */
  readonly deal?: {
    readonly delays: readonly number[];
    readonly fromX: number;
    readonly fromY: number;
  };
  /** Keys the hole cards so each hand's deal animates once. */
  readonly handNumber?: number;
  /** Cards to highlight (the winning five). */
  readonly highlight?: ReadonlySet<Card>;
  /** An NPC is deciding: show the "thinking" dots (AGENTS.md §31.1.7). */
  readonly thinking?: boolean;
  /** Showdown cards still face down while the showdown is revealed hand by hand (§31.1.5). */
  readonly concealShown?: boolean;
  /** Offset from this seat to the muck (container units), for the fold animation. */
  readonly muck?: { readonly x: number; readonly y: number };
  /** Stack changes count up over this many milliseconds (0: immediately). */
  readonly countMs?: number;
  /** The user's current hand, shown under their seat (AGENTS.md §31.2.1). */
  readonly madeHand?: string | null;
  /** Opens this opponent's profile (AGENTS.md §31.2.2). */
  readonly onSelect?: () => void;
}

function actionLabel(action: ActionRecord): string {
  const t = strings.table.lastAction;
  const amount = formatChips(action.to);
  switch (action.kind) {
    case 'fold':
      return t.fold;
    case 'check':
      return t.check;
    case 'call':
      return t.call(formatChips(action.amount));
    case 'bet':
      return t.bet(amount);
    case 'raise':
      return t.raise(amount);
  }
}

/** Deterministic avatar colour from the player's name (procedural, no external assets). */
function avatarHue(name: string): number {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + (ch.codePointAt(0) ?? 0)) % 360;
  return hash;
}

export function Seat(props: Props) {
  const { seat, isUser, isButton, isActing, isWinner, lastAction, holeCards, x, y } = props;
  const chips = (amount: number) =>
    props.bigBlind ? formatBigBlinds(amount, props.bigBlind) : formatChips(amount);
  const name = isUser ? strings.table.you : seat.name;
  const stack = useCountUp(seat.stack, props.countMs ?? 0);
  const out = seat.status === 'eliminated';
  const status =
    seat.status === 'folded'
      ? strings.table.status.folded
      : seat.status === 'allIn'
        ? strings.table.status.allIn
        : out
          ? strings.table.status.eliminated
          : null;
  // A player who just folded: their cards slide face down to the muck, then disappear.
  const mucking = seat.status === 'folded' && lastAction?.kind === 'fold';
  const shown = seat.shownCards && !props.concealShown ? seat.shownCards : null;
  const cards: (Card | null)[] | null = isUser
    ? holeCards && (seat.status !== 'folded' || mucking)
      ? [...holeCards]
      : null
    : shown
      ? [...shown]
      : seat.hasCards || mucking || props.concealShown
        ? [null, null]
        : null;
  const cardMotion = (i: number): CSSProperties | undefined => {
    if (mucking) {
      return {
        '--to-x': `${props.muck?.x ?? 0}cqw`,
        '--to-y': `${props.muck?.y ?? 0}cqh`,
      } as CSSProperties;
    }
    if (!props.deal || shown) return undefined;
    return {
      '--delay': `${props.deal.delays[i] ?? 0}ms`,
      '--from-x': `${props.deal.fromX}cqw`,
      '--from-y': `${props.deal.fromY}cqh`,
    } as CSSProperties;
  };
  const classes = [
    styles.seat,
    isUser ? styles.user : '',
    isActing ? styles.acting : '',
    isWinner ? styles.winner : '',
    out || seat.status === 'folded' ? styles.inactive : '',
  ].join(' ');

  return (
    <div
      className={classes}
      style={{ left: `${x}%`, top: `${y}%` }}
      data-testid={isUser ? 'seat-user' : `seat-${seat.seat}`}
      data-status={seat.status}
    >
      {cards && (
        <div className={styles.cards} role="group" aria-label={strings.table.holeCards(name)}>
          {cards.map((card, i) => (
            <PlayingCard
              // NPC cards turning face up at showdown get a new key, so they flip once.
              key={`${props.handNumber ?? 0}-${i}-${!isUser && card !== null ? card : 'back'}`}
              card={card}
              size={isUser ? 'large' : 'small'}
              fourColor={props.fourColor ?? false}
              highlighted={card !== null && (props.highlight?.has(card) ?? false)}
              enter={mucking ? 'muck' : shown ? 'flip' : props.deal ? 'deal' : null}
              motion={cardMotion(i)}
            />
          ))}
        </div>
      )}
      <div
        className={`${styles.plate} ${props.onSelect ? styles.selectable : ''}`}
        {...(props.onSelect
          ? {
              role: 'button',
              tabIndex: 0,
              'aria-label': strings.table.profile.open(name),
              onClick: (e: MouseEvent) => {
                e.stopPropagation();
                props.onSelect?.();
              },
              onKeyDown: (e: KeyboardEvent) => {
                if (e.key !== 'Enter' && e.key !== ' ') return;
                e.preventDefault();
                props.onSelect?.();
              },
            }
          : {})}
      >
        <span
          className={styles.avatar}
          style={{ ['--hue' as string]: String(avatarHue(seat.name)) }}
          aria-hidden="true"
        >
          {seat.name.charAt(0)}
        </span>
        <span className={styles.info}>
          <span className={styles.name}>{name}</span>
          <span className={styles.stack} data-testid={isUser ? 'user-stack' : undefined}>
            {chips(stack)}
          </span>
        </span>
        {props.clock && (
          <UserTimer
            key={props.clock.startedAt}
            clock={props.clock}
            paused={props.paused ?? false}
            haptics={props.haptics ?? false}
            onWarning={props.onTimerWarning}
          />
        )}
        {isButton && (
          <span className={styles.dealer} role="img" aria-label={strings.table.dealer}>
            {strings.table.dealerShort}
          </span>
        )}
      </div>
      {props.madeHand && (
        <span className={styles.madeHand} data-testid="made-hand">
          {props.madeHand}
        </span>
      )}
      {props.thinking && (
        <span className={styles.thinking} role="status" aria-label={strings.table.thinking(name)}>
          <span />
          <span />
          <span />
        </span>
      )}
      {props.style && <span className={styles.badge}>{strings.styleBadges[props.style]}</span>}
      {props.away && <span className={styles.status}>{strings.table.status.away}</span>}
      {status && <span className={styles.status}>{status}</span>}
      {!status && lastAction && <span className={styles.action}>{actionLabel(lastAction)}</span>}
      {seat.position && <span className={styles.position}>{seat.position}</span>}
    </div>
  );
}

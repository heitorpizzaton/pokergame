/**
 * The table's DOM HUD (AGENTS.md §20.2), shared by both renderers: seats, bets, chip flights,
 * pot, board and result banners. Positions come from the renderer's layout; nothing here decides
 * anything about the game.
 */
import type { CSSProperties } from 'react';
import type { GameController, TableSnapshot } from '../../app/game-controller.ts';
import type { Settings } from '../../app/settings.ts';
import type { Card } from '../../core/cards/index.ts';
import { formatBigBlinds, formatChips, strings } from '../../i18n/index.ts';
import { sound } from '../audio/useTableEffects.ts';
import { Icon } from '../icons.tsx';
import styles from '../screens/TableScreen.module.css';
import { ChipStack } from './ChipStack.tsx';
import { PlayingCard } from './PlayingCard.tsx';
import { betPosition, potPosition, visualSlot } from './hud-layout.ts';
import type { SeatPosition, TableLayout } from './renderer.ts';
import { resultLines } from './result-lines.ts';
import { Seat } from './Seat.tsx';

/** Delay between hole cards in the deal animation (the controller waits for it). */
const DEAL_STAGGER_MS = 70;
/** Board cards turn over after the burn card. */
const BURN_MS = 150;
const FLOP_STAGGER_MS = 90;

function playTimerWarning(): void {
  sound.play('timerWarning');
}

/** CSS variables for a flight between two table positions (container-query units). */
function flight(from: SeatPosition, to: SeatPosition, extra: CSSProperties = {}): CSSProperties {
  return {
    left: `${to.x}%`,
    top: `${to.y}%`,
    '--from-x': `${from.x - to.x}cqw`,
    '--from-y': `${from.y - to.y}cqh`,
    ...extra,
  } as CSSProperties;
}

export function TableLayer({
  snapshot: snap,
  settings,
  controller,
  layout,
}: {
  readonly snapshot: TableSnapshot;
  readonly settings: Settings;
  readonly controller: GameController;
  readonly layout: TableLayout;
}) {
  const { view, userSeat } = snap;
  const count = view.seats.length;
  const posOf = (seat: number): SeatPosition =>
    layout.seats[visualSlot(seat, userSeat, count)] ?? { x: 50, y: 50 };
  const center = layout.center;
  const pot = potPosition(center);
  const dealer = posOf(view.button);
  const showResult = snap.phase === 'handResult' || (snap.phase === 'watching' && snap.result);
  const winners = new Set(showResult ? (snap.result?.winners.map((w) => w.seat) ?? []) : []);
  const best = new Set<Card>(showResult ? (snap.result?.bestFive ?? []) : []);
  const shown = view.board.slice(0, snap.boardShown);
  const rabbit = typeof snap.rabbit === 'object' && snap.rabbit !== null ? snap.rabbit : [];
  const chips = (amount: number) =>
    settings.stackInBigBlinds ? formatBigBlinds(amount, view.bigBlind) : formatChips(amount);
  const collectedPot = view.pots.reduce((sum, p) => sum + p.amount, 0);
  const dealDelays = (seat: number): number[] =>
    snap.dealOrder.flatMap((s, i) => (s === seat ? [i * DEAL_STAGGER_MS] : []));
  const flipDelay = (i: number): number => BURN_MS + (i < 3 ? i * FLOP_STAGGER_MS : 0);

  return (
    <>
      {snap.commitment && (
        <span
          className={styles.commitment}
          role="note"
          title={snap.commitment}
          aria-label={strings.table.commitment(snap.commitment)}
          data-testid="commitment"
        >
          <Icon name="lock" size={12} />
          {snap.commitment.slice(0, 8)}
        </span>
      )}

      {snap.away && (
        <div className={styles.away} role="status">
          <span>{strings.table.away}</span>
          <button
            type="button"
            className={styles.textButton}
            onClick={(e) => {
              e.stopPropagation();
              controller.setAway(false);
            }}
          >
            {strings.table.back}
          </button>
        </div>
      )}

      {view.seats.map((seat) => {
        const pos = posOf(seat.seat);
        return (
          <Seat
            key={seat.seat}
            seat={seat}
            isUser={seat.seat === userSeat}
            isButton={seat.seat === view.button && seat.status !== 'eliminated'}
            isActing={view.toAct === seat.seat && snap.phase !== 'dealing'}
            isWinner={winners.has(seat.seat)}
            lastAction={snap.lastActions[seat.seat]}
            holeCards={seat.seat === userSeat ? view.holeCards : null}
            x={pos.x}
            y={pos.y}
            bigBlind={settings.stackInBigBlinds ? view.bigBlind : null}
            style={settings.showNpcStyles ? (snap.styles[seat.seat] ?? null) : null}
            fourColor={settings.fourColorDeck}
            clock={seat.seat === userSeat ? snap.userClock : null}
            haptics={settings.haptics}
            away={seat.seat === userSeat && snap.away}
            paused={snap.paused}
            onTimerWarning={playTimerWarning}
            deal={{
              delays: dealDelays(seat.seat),
              fromX: dealer.x - pos.x,
              fromY: dealer.y - pos.y,
            }}
            handNumber={view.handNumber}
            highlight={best}
          />
        );
      })}

      {/* Bets on the betting line, slid in from each seat. */}
      {view.seats.map((seat) => {
        // Once the hand is decided, every bet has gone into the pot.
        if (seat.committed <= 0 || snap.result !== null) return null;
        const from = posOf(seat.seat);
        return (
          <ChipStack
            key={`bet-${view.handNumber}-${view.street ?? ''}-${seat.seat}`}
            amount={seat.committed}
            smallBlind={view.smallBlind}
            bigBlind={view.bigBlind}
            label={chips(seat.committed)}
            className={`${styles.chips} ${styles.betIn}`}
            style={flight(from, betPosition(from, center, seat.seat === userSeat))}
            testId={`bet-${seat.seat}`}
          />
        );
      })}

      {/* At the end of a street, the bets gather into the pot. */}
      {snap.collected?.bets.map((bet) => {
        const at = betPosition(posOf(bet.seat), center, bet.seat === userSeat);
        return (
          <ChipStack
            key={`collect-${snap.collected?.id ?? 0}-${bet.seat}`}
            amount={bet.amount}
            smallBlind={view.smallBlind}
            bigBlind={view.bigBlind}
            label={null}
            className={`${styles.chips} ${styles.toPot}`}
            style={flight(at, pot)}
          />
        );
      })}

      {/* The pot slides to the winners. */}
      {showResult &&
        snap.result?.winners.map((w) => (
          <ChipStack
            key={`win-${view.handNumber}-${w.seat}`}
            amount={w.amount}
            smallBlind={view.smallBlind}
            bigBlind={view.bigBlind}
            label={null}
            className={`${styles.chips} ${styles.toWinner}`}
            style={flight(pot, posOf(w.seat))}
          />
        ))}

      <div
        className={styles.potArea}
        style={{ left: `${center.x}%`, top: `calc(${center.y}% - 36px)` }}
      >
        {collectedPot > 0 && !showResult && (
          <ChipStack
            amount={collectedPot}
            smallBlind={view.smallBlind}
            bigBlind={view.bigBlind}
            label={strings.table.potTotal(chips(collectedPot))}
            testId="pot"
          />
        )}
        <Pots snapshot={snap} />
        <ResultBanner
          snapshot={snap}
          onContinue={() => {
            controller.skipWait();
          }}
        />
        {snap.rabbit === 'available' && snap.phase === 'handResult' && (
          <button
            type="button"
            className={styles.textButton}
            data-testid="rabbit-hunt"
            onClick={(e) => {
              e.stopPropagation();
              controller.revealRabbit();
            }}
          >
            {strings.table.rabbitHunt}
          </button>
        )}
      </div>

      <div className={styles.center} style={{ left: `${center.x}%`, top: `${center.y}%` }}>
        <div
          className={styles.board}
          role="group"
          aria-label={strings.table.board}
          data-testid="board"
        >
          {snap.boardShown >= 3 && (
            <span
              key={`burn-${view.handNumber}-${snap.boardShown}`}
              className={styles.burn}
              style={
                {
                  '--from-x': `${dealer.x - center.x}cqw`,
                  '--from-y': `${dealer.y - center.y}cqh`,
                } as CSSProperties
              }
              aria-hidden="true"
            />
          )}
          {Array.from({ length: 5 }, (_, i) => {
            const card = shown[i];
            if (card !== undefined) {
              return (
                <PlayingCard
                  key={card}
                  card={card}
                  size="medium"
                  fourColor={settings.fourColorDeck}
                  highlighted={best.has(card)}
                  enter="flip"
                  motion={{ '--delay': `${flipDelay(i)}ms` } as CSSProperties}
                />
              );
            }
            const extra = rabbit[i - shown.length];
            if (extra !== undefined) {
              return (
                <PlayingCard
                  key={`r${extra}`}
                  card={extra}
                  size="medium"
                  dimmed
                  fourColor={settings.fourColorDeck}
                  enter="flip"
                  motion={
                    { '--delay': `${(i - shown.length) * FLOP_STAGGER_MS}ms` } as CSSProperties
                  }
                />
              );
            }
            return <span key={`slot-${i}`} className={styles.slot} aria-hidden="true" />;
          })}
        </div>
        {rabbit.length > 0 && (
          <span className={styles.rabbitLabel}>{strings.table.rabbitCards}</span>
        )}
      </div>
    </>
  );
}

function Pots({ snapshot }: { readonly snapshot: TableSnapshot }) {
  const pots = snapshot.view.pots;
  if (pots.length < 2) return null;
  return (
    <div className={styles.pots} data-testid="pots">
      {pots.map((pot, i) => (
        <span key={i} className={styles.pot}>
          {i === 0 ? strings.table.mainPot : strings.table.sidePot(i)}: {formatChips(pot.amount)}
        </span>
      ))}
    </div>
  );
}

function ResultBanner({
  snapshot,
  onContinue,
}: {
  readonly snapshot: TableSnapshot;
  readonly onContinue: () => void;
}) {
  if (snapshot.phase === 'runout') {
    return (
      <button
        type="button"
        className={`${styles.banner} ${styles.runoutBanner}`}
        onClick={(e) => {
          e.stopPropagation();
          onContinue();
        }}
      >
        {strings.table.runout}
      </button>
    );
  }
  if (snapshot.phase !== 'handResult' || !snapshot.result) return null;
  return (
    <button
      type="button"
      className={styles.banner}
      onClick={(e) => {
        e.stopPropagation();
        onContinue();
      }}
      data-testid="hand-result"
    >
      {resultLines(snapshot).map((line) => (
        <span key={line}>{line}</span>
      ))}
      <span className={styles.tapHint}>{strings.table.tapToContinue}</span>
    </button>
  );
}

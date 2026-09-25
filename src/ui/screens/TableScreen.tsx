import { type CSSProperties, useState, useSyncExternalStore } from 'react';
import { potInView } from '../../app/bet-sizing.ts';
import type { GameController, TableSnapshot } from '../../app/game-controller.ts';
import type { Settings } from '../../app/settings.ts';
import type { Card } from '../../core/cards/index.ts';
import { cardLabel, formatBigBlinds, formatChips, handName, strings } from '../../i18n/index.ts';
import type { EquityClient } from '../../workers/equity-client.ts';
import { sound, useTableEffects } from '../audio/useTableEffects.ts';
import { Icon } from '../icons.tsx';
import { ActionBar, PreActionBar } from '../table/ActionBar.tsx';
import { ChipStack } from '../table/ChipStack.tsx';
import { OddsPanel } from '../table/OddsPanel.tsx';
import { PlayingCard } from '../table/PlayingCard.tsx';
import { RunoutEquity } from '../table/RunoutEquity.tsx';
import { Seat } from '../table/Seat.tsx';
import {
  betPosition,
  potPosition,
  type SeatPosition,
  seatPositions,
  tableCenter,
  visualSlot,
} from '../table/seat-layout.ts';
import { useOrientation } from '../useOrientation.ts';
import { SummaryScreen } from './SummaryScreen.tsx';
import styles from './TableScreen.module.css';

interface Props {
  readonly controller: GameController;
  readonly settings: Settings;
  readonly onSettingsChange: (patch: Partial<Settings>) => void;
  readonly equity: EquityClient;
  readonly onExit: () => void;
  readonly onPlayAgain: () => void;
}

/** Delay between hole cards in the deal animation (the controller waits for it). */
const DEAL_STAGGER_MS = 70;
/** Board cards turn over after the burn card. */
const BURN_MS = 150;
const FLOP_STAGGER_MS = 90;

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

export function TableScreen({
  controller,
  settings,
  onSettingsChange,
  equity,
  onExit,
  onPlayAgain,
}: Props) {
  const snap = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const orientation = useOrientation();
  const [confirmQuit, setConfirmQuit] = useState(false);
  useTableEffects(controller, settings);

  if (snap.phase === 'userOut' || snap.phase === 'gameOver') {
    return (
      <SummaryScreen
        snapshot={snap}
        onWatch={() => {
          controller.watchToEnd();
        }}
        onPlayAgain={onPlayAgain}
        onMenu={onExit}
      />
    );
  }

  const { view, userSeat } = snap;
  const count = view.seats.length;
  const positions = seatPositions(count, orientation);
  const posOf = (seat: number): SeatPosition =>
    positions[visualSlot(seat, userSeat, count)] ?? { x: 50, y: 50 };
  const center = tableCenter(orientation);
  const pot = potPosition(center);
  const dealer = posOf(view.button);
  const showResult = snap.phase === 'handResult' || (snap.phase === 'watching' && snap.result);
  const winners = new Set(showResult ? (snap.result?.winners.map((w) => w.seat) ?? []) : []);
  const best = new Set<Card>(showResult ? (snap.result?.bestFive ?? []) : []);
  const user = view.seats[userSeat];
  const userInHand = user?.status === 'active';
  const handRunning = view.toAct !== null;
  const shown = view.board.slice(0, snap.boardShown);
  const rabbit = typeof snap.rabbit === 'object' && snap.rabbit !== null ? snap.rabbit : [];
  const chips = (amount: number) =>
    settings.stackInBigBlinds ? formatBigBlinds(amount, view.bigBlind) : formatChips(amount);
  const collectedPot = view.pots.reduce((sum, p) => sum + p.amount, 0);
  const runoutBoard = snap.phase === 'runout' || (showResult && snap.result?.showdown === true);
  const motionScale = settings.reducedMotion
    ? 0
    : snap.speed === 'instant'
      ? 0
      : snap.speed === 'fast'
        ? 0.55
        : 1;

  const dealDelays = (seat: number): number[] =>
    snap.dealOrder.flatMap((s, i) => (s === seat ? [i * DEAL_STAGGER_MS] : []));
  const flipDelay = (i: number): number => BURN_MS + (i < 3 ? i * FLOP_STAGGER_MS : 0);

  return (
    <main
      className={`${styles.screen} ${styles[orientation] ?? ''}`}
      data-testid="table-screen"
      data-phase={snap.phase}
      data-motion={settings.reducedMotion ? 'reduce' : undefined}
      style={{ '--anim-scale': motionScale } as CSSProperties}
    >
      <header className={styles.header}>
        <button
          type="button"
          className={styles.iconButton}
          aria-label={strings.table.pause}
          onClick={() => {
            controller.pause();
          }}
        >
          <Icon name="pause" />
        </button>
        <span className={styles.headerInfo}>
          <span data-testid="hand-number">{strings.table.handNumber(view.handNumber)}</span>
          <span className={styles.blinds}>
            {strings.table.blindsLabel(view.smallBlind, view.bigBlind)}
          </span>
        </span>
        {snap.phase === 'watching' ? (
          <button
            type="button"
            className={styles.textButton}
            onClick={() => {
              controller.skipToEnd();
            }}
          >
            {strings.summary.skip}
          </button>
        ) : (
          <span className={styles.headerButtons}>
            <button
              type="button"
              className={styles.iconButton}
              aria-label={settings.sound ? strings.table.mute : strings.table.unmute}
              aria-pressed={!settings.sound}
              data-testid="mute-toggle"
              onClick={() => {
                onSettingsChange({ sound: !settings.sound });
                sound.unlock();
              }}
            >
              <Icon name={settings.sound ? 'soundOn' : 'soundOff'} />
            </button>
            <button
              type="button"
              className={`${styles.iconButton} ${settings.oddsPanel ? styles.toggleOn : ''}`}
              aria-pressed={settings.oddsPanel}
              aria-label={strings.table.oddsToggle}
              data-testid="odds-toggle"
              onClick={() => {
                onSettingsChange({ oddsPanel: !settings.oddsPanel });
              }}
            >
              <span aria-hidden="true">%</span>
            </button>
          </span>
        )}
      </header>

      <section
        className={styles.tableArea}
        aria-label={strings.table.tableLabel}
        onClick={() => {
          controller.skipWait();
        }}
      >
        <div className={styles.felt} aria-hidden="true">
          <div className={styles.feltLine} />
        </div>

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
              onTimerWarning={() => sound.play('timerWarning')}
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
          if (seat.committed <= 0) return null;
          const from = posOf(seat.seat);
          return (
            <ChipStack
              key={`bet-${view.handNumber}-${view.street ?? ''}-${seat.seat}`}
              amount={seat.committed}
              smallBlind={view.smallBlind}
              bigBlind={view.bigBlind}
              label={chips(seat.committed)}
              className={`${styles.chips} ${styles.betIn}`}
              style={flight(from, betPosition(from, center))}
              testId={`bet-${seat.seat}`}
            />
          );
        })}

        {/* At the end of a street, the bets gather into the pot. */}
        {snap.collected?.bets.map((bet) => {
          const at = betPosition(posOf(bet.seat), center);
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

        <div className={styles.potArea} style={{ left: `${pot.x}%`, top: `${pot.y}%` }}>
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
      </section>

      <footer className={styles.footer}>
        {settings.oddsPanel && runoutBoard && (
          <RunoutEquity view={view} board={shown} client={equity} userSeat={userSeat} />
        )}
        {settings.oddsPanel &&
          !runoutBoard &&
          userInHand &&
          view.holeCards &&
          view.street !== null && (
            <OddsPanel
              view={view}
              board={shown}
              client={equity}
              pot={potInView(view)}
              fourColor={settings.fourColorDeck}
            />
          )}
        {snap.phase === 'userTurn' && view.legal && !snap.away ? (
          <ActionBar
            key={`${view.handNumber}-${view.actions.length}-${view.street ?? ''}`}
            sizing={{
              legal: view.legal,
              street: view.street ?? 'preflop',
              bigBlind: view.bigBlind,
              smallBlind: view.smallBlind,
              pot: potInView(view),
              currentBet: view.currentBet,
            }}
            confirmAllIn={settings.confirmAllIn}
            onAct={(action) => {
              controller.act(action);
            }}
          />
        ) : userInHand && handRunning ? (
          <PreActionBar
            value={snap.preAction}
            facingBet={view.currentBet > user.committed}
            onChange={(value) => {
              controller.setPreAction(value);
            }}
          />
        ) : (
          <div className={styles.footerSpacer} />
        )}
      </footer>

      <div className="sr-only" role="status" aria-live="polite" data-testid="announcer">
        {announcement(snap)}
      </div>

      {snap.paused && (
        <div
          className={styles.overlay}
          role="dialog"
          aria-modal="true"
          aria-labelledby="pause-title"
        >
          <div className={styles.dialog}>
            <h2 id="pause-title">{strings.pause.title}</h2>
            {confirmQuit ? (
              <>
                <p>{strings.pause.confirmQuit}</p>
                <div className={styles.dialogButtons}>
                  <button
                    type="button"
                    className={styles.secondary}
                    onClick={() => {
                      setConfirmQuit(false);
                    }}
                  >
                    {strings.pause.confirmQuitNo}
                  </button>
                  <button type="button" className={styles.danger} onClick={onExit}>
                    {strings.pause.confirmQuitYes}
                  </button>
                </div>
              </>
            ) : (
              <>
                <fieldset className={styles.speed}>
                  <legend>{strings.pause.speed}</legend>
                  {(['normal', 'fast'] as const).map((speed) => (
                    <label key={speed}>
                      <input
                        type="radio"
                        name="speed"
                        checked={snap.speed === speed}
                        onChange={() => {
                          controller.setSpeed(speed);
                        }}
                      />
                      {speed === 'normal' ? strings.pause.speedNormal : strings.pause.speedFast}
                    </label>
                  ))}
                </fieldset>
                <div className={styles.dialogButtons}>
                  <button
                    type="button"
                    className={styles.secondary}
                    onClick={() => {
                      setConfirmQuit(true);
                    }}
                  >
                    {strings.pause.quit}
                  </button>
                  <button
                    type="button"
                    className={styles.primary}
                    onClick={() => {
                      controller.resume();
                    }}
                  >
                    {strings.pause.resume}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </main>
  );
}

/** Screen reader announcements (AGENTS.md §12): the user's turn and each hand's result. */
function announcement(snap: TableSnapshot): string {
  const { view } = snap;
  if (snap.phase === 'userTurn' && view.holeCards && !snap.away) {
    const cards = view.holeCards.map(cardLabel).join(' e ');
    const call =
      view.legal && view.legal.callAmount > 0
        ? strings.actions.call(formatChips(view.legal.callAmount))
        : null;
    return strings.table.yourTurnWith(cards, call);
  }
  if (snap.phase === 'handResult') return resultLines(snap).join('. ');
  return '';
}

function resultLines(snapshot: TableSnapshot): string[] {
  return (snapshot.result?.winners ?? []).map((w) => {
    const name = snapshot.view.seats[w.seat]?.name ?? '';
    const amount = formatChips(w.amount);
    const text =
      w.seat === snapshot.userSeat
        ? strings.table.youWin(amount)
        : strings.table.wins(name, amount);
    return w.hand !== null ? `${text} · ${handName(w.hand)}` : text;
  });
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

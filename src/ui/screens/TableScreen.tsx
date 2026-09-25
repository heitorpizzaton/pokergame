import { useState, useSyncExternalStore } from 'react';
import { potInView } from '../../app/bet-sizing.ts';
import type { GameController, TableSnapshot } from '../../app/game-controller.ts';
import type { Settings } from '../../app/settings.ts';
import { formatChips, handName, strings } from '../../i18n/index.ts';
import type { EquityClient } from '../../workers/equity-client.ts';
import { ActionBar, PreActionBar } from '../table/ActionBar.tsx';
import { OddsPanel } from '../table/OddsPanel.tsx';
import { PlayingCard } from '../table/PlayingCard.tsx';
import { Seat } from '../table/Seat.tsx';
import { seatPositions, visualSlot } from '../table/seat-layout.ts';
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
  const positions = seatPositions(view.seats.length, orientation);
  const winners = new Set(
    snap.phase === 'handResult' ? (snap.result?.winners.map((w) => w.seat) ?? []) : [],
  );
  const user = view.seats[userSeat];
  const userInHand = user?.status === 'active';
  const handRunning = view.toAct !== null;

  return (
    <main
      className={`${styles.screen} ${styles[orientation] ?? ''}`}
      data-testid="table-screen"
      data-phase={snap.phase}
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
          <span aria-hidden="true">❚❚</span>
        </button>
        <span className={styles.headerInfo}>
          <span data-testid="hand-number">{strings.table.handNumber(view.handNumber)}</span>
          <span>{strings.table.blindsLabel(view.smallBlind, view.bigBlind)}</span>
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
              onClick={() => {
                onSettingsChange({ sound: !settings.sound });
              }}
            >
              <span aria-hidden="true">{settings.sound ? '🔊' : '🔇'}</span>
            </button>
            <button
              type="button"
              className={`${styles.textButton} ${settings.oddsPanel ? styles.toggleOn : ''}`}
              aria-pressed={settings.oddsPanel}
              data-testid="odds-toggle"
              onClick={() => {
                onSettingsChange({ oddsPanel: !settings.oddsPanel });
              }}
            >
              %
            </button>
          </span>
        )}
      </header>

      <section className={styles.tableArea} aria-live="polite">
        <div className={styles.felt} />
        {view.seats.map((seat) => {
          const pos = positions[visualSlot(seat.seat, userSeat, view.seats.length)] ?? {
            x: 50,
            y: 50,
          };
          return (
            <Seat
              key={seat.seat}
              seat={seat}
              isUser={seat.seat === userSeat}
              isButton={seat.seat === view.button && seat.status !== 'eliminated'}
              isActing={view.toAct === seat.seat}
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
            />
          );
        })}
        <div className={styles.center}>
          <Pots snapshot={snap} />
          <div className={styles.board} aria-label={strings.table.board} data-testid="board">
            {view.board.slice(0, snap.boardShown).map((card) => (
              <PlayingCard
                key={card}
                card={card}
                size="medium"
                fourColor={settings.fourColorDeck}
              />
            ))}
            {typeof snap.rabbit === 'object' &&
              snap.rabbit?.map((card) => (
                <PlayingCard
                  key={`r${card}`}
                  card={card}
                  size="medium"
                  dimmed
                  fourColor={settings.fourColorDeck}
                />
              ))}
          </div>
          {typeof snap.rabbit === 'object' && snap.rabbit !== null && (
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
              onClick={() => {
                controller.revealRabbit();
              }}
            >
              {strings.table.rabbitHunt}
            </button>
          )}
        </div>
      </section>

      <footer className={styles.footer}>
        {snap.away && (
          <div className={styles.away} role="status">
            <span>{strings.table.away}</span>
            <button
              type="button"
              className={styles.textButton}
              onClick={() => {
                controller.setAway(false);
              }}
            >
              {strings.table.back}
            </button>
          </div>
        )}
        {settings.oddsPanel && userInHand && view.holeCards && view.street !== null && (
          <OddsPanel
            view={view}
            board={view.board.slice(0, snap.boardShown)}
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

function Pots({ snapshot }: { readonly snapshot: TableSnapshot }) {
  const pots = snapshot.view.pots;
  if (pots.length === 0) return <div className={styles.pots} />;
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
      <button type="button" className={styles.banner} onClick={onContinue}>
        {strings.table.runout}
      </button>
    );
  }
  if (snapshot.phase !== 'handResult' || !snapshot.result) return null;
  const lines = snapshot.result.winners.map((w) => {
    const name = snapshot.view.seats[w.seat]?.name ?? '';
    const amount = formatChips(w.amount);
    const text =
      w.seat === snapshot.userSeat
        ? strings.table.youWin(amount)
        : strings.table.wins(name, amount);
    return w.hand !== null ? `${text} · ${handName(w.hand)}` : text;
  });
  return (
    <button type="button" className={styles.banner} onClick={onContinue} data-testid="hand-result">
      {lines.map((line) => (
        <span key={line}>{line}</span>
      ))}
    </button>
  );
}

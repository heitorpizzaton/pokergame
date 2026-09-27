import { lazy, Suspense, useState, useSyncExternalStore, type CSSProperties } from 'react';
import { potInView } from '../../app/bet-sizing.ts';
import type { GameController, TableSnapshot } from '../../app/game-controller.ts';
import type { Settings } from '../../app/settings.ts';
import { cardLabel, formatChips, strings } from '../../i18n/index.ts';
import type { EquityClient } from '../../workers/equity-client.ts';
import { sound, useTableEffects } from '../audio/useTableEffects.ts';
import { Icon } from '../icons.tsx';
import { ActionBar, PreActionBar } from '../table/ActionBar.tsx';
import { OddsPanel } from '../table/OddsPanel.tsx';
import type { TableLayout } from '../table/renderer.ts';
import { RunoutEquity } from '../table/RunoutEquity.tsx';
import { resultLines } from '../table/result-lines.ts';
import { TableLayer } from '../table/TableLayer.tsx';
import { useTableStage } from '../table/useTableStage.ts';
import { Felt } from '../table2d/Felt.tsx';
import { layout2d } from '../table2d/seat-layout.ts';
import { useOrientation } from '../useOrientation.ts';
import { SummaryScreen } from './SummaryScreen.tsx';
import styles from './TableScreen.module.css';

/** The 3D table is a separate chunk: menus and setup never download it (AGENTS.md §20.2). */
const Table3D = lazy(() => import('../table3d/Table3D.tsx'));

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
  const [layout3d, setLayout3d] = useState<TableLayout | null>(null);
  const { stage, lowerTo, fallBack, toast } = useTableStage(settings.graphics);
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
  const showResult = snap.phase === 'handResult' || (snap.phase === 'watching' && snap.result);
  const user = view.seats[userSeat];
  const userInHand = user?.status === 'active';
  const handRunning = view.toAct !== null;
  const shown = view.board.slice(0, snap.boardShown);
  const runoutBoard = snap.phase === 'runout' || (showResult && snap.result?.showdown === true);
  const motionScale = settings.reducedMotion
    ? 0
    : snap.speed === 'instant'
      ? 0
      : snap.speed === 'fast'
        ? 0.55
        : 1;

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
        className={`${styles.tableArea} ${stage.kind === '3d' ? styles.tableArea3d : ''}`}
        aria-label={strings.table.tableLabel}
        data-renderer={stage.kind === '3d' && layout3d ? '3d' : '2d'}
        onClick={() => {
          controller.skipWait();
        }}
      >
        {stage.kind === '3d' ? (
          <Suspense fallback={<Felt />}>
            <Table3D
              snapshot={snap}
              orientation={orientation}
              tier={stage.tier}
              reducedMotion={settings.reducedMotion}
              onLayout={setLayout3d}
              onTierDrop={lowerTo}
              onFailure={fallBack}
            />
          </Suspense>
        ) : (
          <Felt />
        )}
        {stage.kind === '3d' && !layout3d && (
          <span className={styles.loading3d} role="status">
            {strings.table.loading3d}
          </span>
        )}
        <TableLayer
          snapshot={snap}
          settings={settings}
          controller={controller}
          layout={stage.kind === '3d' && layout3d ? layout3d : layout2d(count, orientation)}
        />
        {toast && (
          <span className={styles.graphicsToast} role="status" data-testid="graphics-toast">
            {toast}
          </span>
        )}
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
              expanded={settings.oddsExpanded}
              onExpandedChange={(expanded) => {
                onSettingsChange({ oddsExpanded: expanded });
              }}
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

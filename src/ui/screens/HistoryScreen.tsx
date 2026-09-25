import { useEffect, useMemo, useState } from 'react';
import { formatCards } from '../../core/cards/index.ts';
import type { PublicSeat } from '../../core/view/index.ts';
import {
  type HandRecord,
  type HistoryStore,
  type ReplayFrame,
  replayFrames,
  sessionToPokerStarsText,
  streetStart,
  toPokerStarsText,
} from '../../history/index.ts';
import { formatChips, handName, strings } from '../../i18n/index.ts';
import { PlayingCard } from '../table/PlayingCard.tsx';
import { Seat } from '../table/Seat.tsx';
import { seatPositions, tableCenter, visualSlot } from '../table/seat-layout.ts';
import { FairnessPanel } from './FairnessPanel.tsx';
import styles from './Screens.module.css';
import tableStyles from './TableScreen.module.css';

const t = strings.history;

function download(filename: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Hand history list (AGENTS.md §10.2). */
export function HistoryScreen({
  store,
  onBack,
}: {
  readonly store: HistoryStore;
  readonly onBack: () => void;
}) {
  const [records, setRecords] = useState<HandRecord[] | null>(null);
  const [selected, setSelected] = useState<HandRecord | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => {
    void store.list().then(setRecords);
  }, [store]);

  if (selected) {
    return (
      <Replayer
        record={selected}
        onBack={() => {
          setSelected(null);
        }}
      />
    );
  }

  return (
    <main className={styles.screen} data-testid="history-screen">
      <section className={styles.panel}>
        <h1 className={styles.title}>{t.title}</h1>
        {records !== null && records.length === 0 && <p className={styles.hint}>{t.empty}</p>}
        <ul className={styles.list}>
          {(records ?? []).map((r) => (
            <li key={r.id}>
              <button
                type="button"
                className={styles.listItem}
                data-testid="history-item"
                onClick={() => {
                  setSelected(r);
                }}
              >
                <span>{t.hand(r.handNumber)}</span>
                <span>{r.userHole ? formatCards(r.userHole) : ''}</span>
                <span className={r.userNet > 0 ? styles.gain : r.userNet < 0 ? styles.loss : ''}>
                  {r.userNet > 0 ? '+' : ''}
                  {formatChips(r.userNet)}
                </span>
                <span className={styles.hint}>{t.pot(formatChips(r.potTotal))}</span>
              </button>
            </li>
          ))}
        </ul>
        <div className={styles.buttons}>
          {records && records.length > 0 && (
            <button
              type="button"
              className={styles.secondary}
              onClick={() => {
                download('mesa-viva-sessao.txt', sessionToPokerStarsText(records));
              }}
            >
              {t.exportSession}
            </button>
          )}
          {records &&
            records.length > 0 &&
            (confirmClear ? (
              <div className={styles.row}>
                <span className={styles.hint}>{t.confirmClear}</span>
                <button
                  type="button"
                  className={styles.secondary}
                  onClick={() => {
                    setConfirmClear(false);
                  }}
                >
                  {strings.table.cancel}
                </button>
                <button
                  type="button"
                  className={styles.primary}
                  onClick={() => {
                    void store.clear().then(() => {
                      setRecords([]);
                      setConfirmClear(false);
                    });
                  }}
                >
                  {strings.table.confirm}
                </button>
              </div>
            ) : (
              <button
                type="button"
                className={styles.secondary}
                onClick={() => {
                  setConfirmClear(true);
                }}
              >
                {t.clear}
              </button>
            ))}
          <button type="button" className={styles.primary} onClick={onBack}>
            {t.back}
          </button>
        </div>
      </section>
    </main>
  );
}

function describe(frame: ReplayFrame, record: HandRecord): string {
  const name = (seat: number) =>
    seat === record.userSeat
      ? strings.table.you
      : (record.seats.find((s) => s.seat === seat)?.name ?? '');
  const step = frame.step;
  switch (step.kind) {
    case 'start':
      return t.step.start;
    case 'street':
      return `${t.streets[step.street]}: ${formatCards(step.cards)}`;
    case 'showdown':
      return t.step.showdown;
    case 'result': {
      const lines = record.awards.flatMap((a) =>
        a.winners.map((w) => {
          const text = strings.table.wins(name(w.seat), formatChips(w.amount));
          return a.value !== null ? `${text} · ${handName(a.value)}` : text;
        }),
      );
      return lines.join(' / ');
    }
    case 'action': {
      const a = step.action;
      const la = strings.table.lastAction;
      const text =
        a.kind === 'fold'
          ? la.fold
          : a.kind === 'check'
            ? la.check
            : a.kind === 'call'
              ? la.call(formatChips(a.amount))
              : a.kind === 'bet'
                ? la.bet(formatChips(a.to))
                : la.raise(formatChips(a.to));
      return `${name(a.seat)}: ${text}`;
    }
  }
}

/** Step-by-step replay of one hand with the table components (AGENTS.md §10.2). */
function Replayer({
  record,
  onBack,
}: {
  readonly record: HandRecord;
  readonly onBack: () => void;
}) {
  const frames = useMemo(() => replayFrames(record), [record]);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [proofOpen, setProofOpen] = useState(false);
  const frame = frames[index] ?? frames[0];

  useEffect(() => {
    if (!playing || index >= frames.length - 1) return;
    const id = setTimeout(() => {
      const next = Math.min(frames.length - 1, index + 1);
      setIndex(next);
      if (next >= frames.length - 1) setPlaying(false);
    }, 900);
    return () => {
      clearTimeout(id);
    };
  }, [playing, index, frames.length]);

  if (!frame) return null;
  const n = record.finalStacks.length;
  const positions = seatPositions(n, 'portrait');
  const center = tableCenter('portrait');
  const streets = (['preflop', 'flop', 'turn', 'river'] as const).filter(
    (s) => streetStart(frames, s) >= 0,
  );

  return (
    <main className={tableStyles.screen} data-testid="replayer">
      <header className={tableStyles.header}>
        <button type="button" className={tableStyles.textButton} onClick={onBack}>
          {t.back}
        </button>
        <span className={tableStyles.headerInfo}>
          {t.replayer} · {t.hand(record.handNumber)}
        </span>
        <button
          type="button"
          className={tableStyles.textButton}
          onClick={() => {
            download(`mesa-viva-mao-${record.handNumber}.txt`, toPokerStarsText(record));
          }}
        >
          {t.exportHand}
        </button>
      </header>
      <section className={tableStyles.tableArea}>
        <div className={tableStyles.felt} />
        {frame.seats.map((s) => {
          const recordSeat = record.seats.find((x) => x.seat === s.seat);
          const pos = positions[visualSlot(s.seat, record.userSeat, n)] ?? { x: 50, y: 50 };
          const seat: PublicSeat = {
            seat: s.seat,
            name: s.name,
            stack: s.stack,
            status: s.folded ? 'folded' : 'active',
            committed: s.committed,
            committedTotal: 0,
            position: recordSeat?.position ?? null,
            shownCards: s.seat === record.userSeat ? null : s.cards,
            hasCards: !s.folded,
          };
          return (
            <Seat
              key={s.seat}
              seat={seat}
              isUser={s.seat === record.userSeat}
              isButton={s.seat === record.button}
              isActing={frame.step.kind === 'action' && frame.step.action.seat === s.seat}
              isWinner={frame.winners.includes(s.seat)}
              lastAction={s.lastAction ?? undefined}
              holeCards={s.seat === record.userSeat ? record.userHole : null}
              x={pos.x}
              y={pos.y}
            />
          );
        })}
        <div className={tableStyles.center} style={{ left: `${center.x}%`, top: `${center.y}%` }}>
          <div className={tableStyles.pots}>
            <span className={tableStyles.pot}>
              {strings.table.mainPot}: {formatChips(frame.pot)}
            </span>
          </div>
          <div className={tableStyles.board}>
            {frame.board.map((card) => (
              <PlayingCard key={card} card={card} size="medium" />
            ))}
          </div>
          <p className={tableStyles.banner} data-testid="replay-step">
            {describe(frame, record)}
          </p>
        </div>
      </section>
      <footer className={tableStyles.footer}>
        <div className={styles.row} style={{ padding: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            className={styles.secondary}
            aria-label={t.previous}
            disabled={index === 0}
            onClick={() => {
              setIndex((i) => Math.max(0, i - 1));
            }}
          >
            ◀
          </button>
          <button
            type="button"
            className={styles.primary}
            onClick={() => {
              setPlaying((p) => !p);
            }}
          >
            {playing ? t.pauseReplay : t.play}
          </button>
          <button
            type="button"
            className={styles.secondary}
            aria-label={t.next}
            data-testid="replay-next"
            disabled={index >= frames.length - 1}
            onClick={() => {
              setIndex((i) => Math.min(frames.length - 1, i + 1));
            }}
          >
            ▶
          </button>
        </div>
        <div className={styles.row} style={{ padding: '0 8px 8px' }}>
          <button
            type="button"
            className={styles.secondary}
            data-testid="fairness-open"
            onClick={() => {
              setProofOpen(true);
            }}
          >
            {strings.fairness.title}
          </button>
        </div>
        <div className={styles.row} style={{ padding: '0 8px 8px' }}>
          {streets.map((s) => (
            <button
              key={s}
              type="button"
              className={styles.secondary}
              onClick={() => {
                setIndex(streetStart(frames, s));
              }}
            >
              {t.streets[s]}
            </button>
          ))}
        </div>
      </footer>
      {proofOpen && (
        <FairnessPanel
          record={record}
          onClose={() => {
            setProofOpen(false);
          }}
        />
      )}
    </main>
  );
}

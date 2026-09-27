import { useEffect, useRef, useState } from 'react';
import type { Card } from '../../core/cards/index.ts';
import { assessCall, drawOdds, type EquityResult, preflopClass } from '../../core/equity/index.ts';
import { evaluate } from '../../core/eval/index.ts';
import type { PlayerView } from '../../core/view/index.ts';
import { formatPercent, handName, strings } from '../../i18n/index.ts';
import type { EquityClient } from '../../workers/equity-client.ts';
import { PlayingCard } from './PlayingCard.tsx';
import styles from './OddsPanel.module.css';

interface Props {
  readonly view: PlayerView;
  /** Board cards visible to the user right now. */
  readonly board: readonly Card[];
  readonly client: EquityClient;
  readonly pot: number;
  readonly fourColor: boolean;
  /** Expanded (full panel) or minimized (a pill); remembered in the settings (§19). */
  readonly expanded: boolean;
  readonly onExpandedChange: (expanded: boolean) => void;
}

const t = strings.odds;

/**
 * Odds panel (AGENTS.md §7.3). Uses only the user's cards and the visible board. Mounted only
 * when the setting is on, so nothing is computed when it is off.
 */
export function OddsPanel({
  view,
  board,
  client,
  pot,
  fourColor,
  expanded,
  onExpandedChange,
}: Props) {
  const swipeStart = useRef<number | null>(null);
  const hole = view.holeCards;
  const opponents = view.seats.filter((s) => s.seat !== view.seat && s.hasCards).length;
  const requestKey = `${hole?.join(',') ?? ''}|${board.join(',')}|${opponents}`;
  // Results are keyed by the request, so a stale answer is never shown for a new state.
  const [computed, setComputed] = useState<{ key: string; result: EquityResult } | null>(null);
  const equity = computed?.key === requestKey ? computed.result : null;

  useEffect(() => {
    if (hole?.length !== 2 || opponents === 0) return;
    let cancelled = false;
    const update = (result: EquityResult | null) => {
      if (!cancelled && result) setComputed({ key: requestKey, result });
    };
    void client.request({ hero: hole, board, opponents }, update).then(update);
    return () => {
      cancelled = true;
    };
    // The request depends only on the key (cards and number of opponents).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey, client]);

  if (hole?.length !== 2) return null;
  const preflop = board.length === 0 ? preflopClass(hole) : null;
  const made = board.length >= 3 ? handName(evaluate([...hole, ...board])) : null;
  const draws = drawOdds(hole, board);
  const call = view.legal && view.legal.callAmount > 0 ? view.legal.callAmount : 0;
  const assessment = call > 0 && equity ? assessCall(equity.equity, call, pot) : null;

  if (!expanded) {
    return (
      <button
        type="button"
        className={styles.pill}
        aria-expanded={false}
        title={t.expand}
        data-testid="odds-panel"
        data-state="minimized"
        onClick={() => {
          onExpandedChange(true);
        }}
      >
        <strong className={styles.equity} data-testid="odds-equity">
          {equity ? t.pill(formatPercent(equity.equity)) : t.computing}
        </strong>
        <span className={styles.chevron} aria-hidden="true">
          ▴
        </span>
      </button>
    );
  }

  return (
    <section
      className={styles.panel}
      aria-label={t.title}
      data-testid="odds-panel"
      data-state="expanded"
      // Swipe down (from the top of the panel's scroll) to minimize (§19). Touch events still
      // fire when the browser handles the gesture as a scroll; pointer events cover mice.
      onTouchStart={(e) => {
        swipeStart.current =
          e.currentTarget.scrollTop === 0 ? (e.touches[0]?.clientY ?? null) : null;
      }}
      onTouchEnd={(e) => {
        const start = swipeStart.current;
        swipeStart.current = null;
        const end = e.changedTouches[0]?.clientY;
        if (start !== null && end !== undefined && end - start > 40) onExpandedChange(false);
      }}
      onPointerDown={(e) => {
        if (e.pointerType === 'mouse') swipeStart.current = e.clientY;
      }}
      onPointerUp={(e) => {
        if (e.pointerType !== 'mouse') return;
        const start = swipeStart.current;
        swipeStart.current = null;
        if (start !== null && e.clientY - start > 40) onExpandedChange(false);
      }}
    >
      <div className={styles.summary}>
        <span className={styles.label}>{t.equityVsRandom}</span>
        <strong className={styles.equity} data-testid="odds-equity">
          {equity ? formatPercent(equity.equity) : t.computing}
        </strong>
        <span className={styles.meta}>{t.opponents(opponents)}</span>
        <button
          type="button"
          className={styles.minimize}
          aria-label={t.minimize}
          data-testid="odds-minimize"
          onClick={() => {
            onExpandedChange(false);
          }}
        >
          <span aria-hidden="true">–</span>
        </button>
      </div>
      {assessment && (
        <p className={assessment.positive ? styles.positive : styles.negative}>
          {t.potOdds}: {formatPercent(assessment.requiredEquity)} ·{' '}
          {assessment.positive ? t.positiveEv : t.negativeEv}
        </p>
      )}
      <div className={styles.details} data-testid="odds-details">
        {equity && (
          <p>
            {t.win} {formatPercent(equity.win)} · {t.tie} {formatPercent(equity.tie)} ·{' '}
            {equity.exact ? t.exact : t.estimate(formatPercent(equity.standardError * 1.96))}
          </p>
        )}
        {preflop && (
          <p>
            {t.startingHand}: <strong>{preflop.label}</strong> ·{' '}
            {t.percentile(formatPercent(preflop.topShare + preflop.combos / 1326))}
          </p>
        )}
        {made && (
          <p>
            {t.madeHand}: <strong>{made}</strong>
          </p>
        )}
        {assessment && (
          <p>
            {t.requiredEquity}: {formatPercent(assessment.requiredEquity)}
          </p>
        )}
        {draws && (
          <>
            <p>
              {draws.outs.length > 0 ? t.outs(draws.outs.length) : t.noOuts} · {t.improveNext}{' '}
              {formatPercent(draws.improveNextCard)} · {t.improveRiver}{' '}
              {formatPercent(draws.improveByRiver)}
            </p>
            {draws.outs.length > 0 && (
              <div className={styles.outs}>
                {draws.outs.map((c) => (
                  <PlayingCard key={c} card={c} size="small" fourColor={fourColor} />
                ))}
              </div>
            )}
            {draws.taintedOuts.length > 0 && (
              <details className={styles.advanced}>
                <summary>{t.advanced}</summary>
                <p>
                  {t.cleanOuts}: {draws.cleanOuts.length} · {t.taintedOuts}:{' '}
                  {draws.taintedOuts.length}
                </p>
              </details>
            )}
          </>
        )}
      </div>
    </section>
  );
}

import { useState } from 'react';
import type { PreAction } from '../../app/game-controller.ts';
import {
  clampTarget,
  type PresetId,
  type SizingContext,
  sizingPresets,
  sizingStep,
} from '../../app/bet-sizing.ts';
import type { PlayerAction } from '../../core/view/index.ts';
import { formatChips, strings } from '../../i18n/index.ts';
import styles from './ActionBar.module.css';

interface Props {
  readonly sizing: SizingContext;
  readonly onAct: (action: PlayerAction) => void;
  /** Ask before going all-in (setting, default off). */
  readonly confirmAllIn?: boolean;
}

const t = strings.actions;

function presetLabel(id: PresetId): string {
  switch (id) {
    case 'x2_5':
      return t.presets.timesBigBlind('2,5');
    case 'x3':
      return t.presets.timesBigBlind('3');
    case 'x4':
      return t.presets.timesBigBlind('4');
    case 'third':
      return t.presets.thirdPot;
    case 'half':
      return t.presets.halfPot;
    case 'twoThirds':
      return t.presets.twoThirdsPot;
    case 'threeQuarters':
      return t.presets.threeQuartersPot;
    case 'pot':
      return t.presets.pot;
    case 'allIn':
      return t.presets.allIn;
  }
}

/** Buttons and bet sizing for the user's turn (AGENTS.md §11.3). */
export function ActionBar({ sizing, onAct, confirmAllIn = false }: Props) {
  const { legal } = sizing;
  const [confirming, setConfirming] = useState(false);
  const aggressive = legal.canBet || legal.canRaise;
  const [target, setTarget] = useState(() => legal.minTo ?? 0);
  const presets = sizingPresets(sizing);
  const step = sizingStep(sizing, target);
  const set = (value: number) => {
    setTarget(clampTarget(sizing, value));
  };
  const isAllIn = legal.maxTo !== null && target >= legal.maxTo;

  const aggressiveAction = (): PlayerAction =>
    isAllIn ? { type: 'allIn' } : { type: legal.canBet ? 'bet' : 'raise', to: target };

  if (confirming && legal.maxTo !== null) {
    return (
      <div className={styles.bar} data-testid="action-bar" role="alertdialog">
        <p className={styles.range}>{strings.table.confirmAllIn(formatChips(legal.maxTo))}</p>
        <div className={styles.buttons}>
          <button
            type="button"
            className={`${styles.button} ${styles.fold}`}
            onClick={() => {
              setConfirming(false);
            }}
          >
            {strings.table.cancel}
          </button>
          <button
            type="button"
            className={`${styles.button} ${styles.raise}`}
            data-testid="confirm-all-in"
            onClick={() => {
              onAct({ type: 'allIn' });
            }}
          >
            {strings.table.confirm}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.bar} data-testid="action-bar">
      {aggressive && legal.minTo !== null && legal.maxTo !== null && (
        <div className={styles.sizing}>
          <div className={styles.presets}>
            {presets.map((p) => (
              <button
                key={p.id}
                type="button"
                className={`${styles.preset} ${target === p.to ? styles.presetActive : ''}`}
                data-testid={`preset-${p.id}`}
                onClick={() => {
                  set(p.to);
                }}
              >
                {presetLabel(p.id)}
              </button>
            ))}
          </div>
          <div className={styles.slider}>
            <button
              type="button"
              className={styles.step}
              aria-label={t.decrease}
              onClick={() => {
                set(target - step);
              }}
            >
              −
            </button>
            <input
              type="range"
              min={legal.minTo}
              max={legal.maxTo}
              step={1}
              value={target}
              aria-label={t.amount}
              onChange={(e) => {
                set(Number(e.target.value));
              }}
            />
            <button
              type="button"
              className={styles.step}
              aria-label={t.increase}
              onClick={() => {
                set(target + step);
              }}
            >
              +
            </button>
            <input
              className={styles.amount}
              type="number"
              inputMode="numeric"
              min={legal.minTo}
              max={legal.maxTo}
              value={target}
              aria-label={t.amount}
              onChange={(e) => {
                setTarget(Number(e.target.value) || 0);
              }}
              onBlur={() => {
                set(target);
              }}
            />
          </div>
          <div className={styles.range}>
            {t.legalRange(formatChips(legal.minTo), formatChips(legal.maxTo))}
          </div>
        </div>
      )}
      <div className={styles.buttons}>
        {legal.canFold && (
          <button
            type="button"
            className={`${styles.button} ${styles.fold}`}
            data-testid="act-fold"
            onClick={() => {
              onAct({ type: 'fold' });
            }}
          >
            {t.fold}
          </button>
        )}
        <button
          type="button"
          className={`${styles.button} ${styles.call}`}
          data-testid="act-call"
          onClick={() => {
            onAct(legal.canCheck ? { type: 'check' } : { type: 'call' });
          }}
        >
          {legal.canCheck ? t.check : t.call(formatChips(legal.callAmount))}
        </button>
        {aggressive && (
          <button
            type="button"
            className={`${styles.button} ${styles.raise}`}
            data-testid="act-raise"
            onClick={() => {
              const action = aggressiveAction();
              if (action.type === 'allIn' && confirmAllIn) setConfirming(true);
              else onAct(action);
            }}
          >
            {isAllIn
              ? t.allIn
              : legal.canBet
                ? t.bet(formatChips(target))
                : t.raise(formatChips(target))}
          </button>
        )}
      </div>
    </div>
  );
}

interface PreActionProps {
  readonly value: PreAction | null;
  readonly facingBet: boolean;
  readonly onChange: (value: PreAction | null) => void;
}

/** Pre-action checkboxes while waiting (AGENTS.md §11.3). */
export function PreActionBar({ value, facingBet, onChange }: PreActionProps) {
  const options: [PreAction, string][] = facingBet
    ? [
        ['checkFold', t.pre.checkFold],
        ['callAny', t.pre.callAny],
      ]
    : [
        ['checkFold', t.pre.checkFold],
        ['check', t.pre.check],
        ['callAny', t.pre.callAny],
      ];
  return (
    <div className={styles.bar} role="group" aria-label={t.pre.title} data-testid="pre-action-bar">
      <div className={styles.buttons}>
        {options.map(([id, label]) => (
          <label key={id} className={`${styles.pre} ${value === id ? styles.preActive : ''}`}>
            <input
              type="checkbox"
              checked={value === id}
              onChange={(e) => {
                onChange(e.target.checked ? id : null);
              }}
            />
            {label}
          </label>
        ))}
      </div>
    </div>
  );
}

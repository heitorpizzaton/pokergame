import { useState } from 'react';
import {
  BUY_IN_PRESETS,
  checkSetup,
  clampPlayers,
  type GameSetup,
  MAX_PLAYERS,
  MIN_PLAYERS,
} from '../../app/setup.ts';
import { formatBigBlinds, formatChips, strings } from '../../i18n/index.ts';
import { seatPositions } from '../table/seat-layout.ts';
import styles from './Screens.module.css';

interface Props {
  readonly initial: GameSetup;
  readonly onStart: (setup: GameSetup) => void;
  readonly onBack: () => void;
}

const t = strings.setup;

export function SetupScreen({ initial, onStart, onBack }: Props) {
  const [setup, setSetup] = useState(initial);
  const check = checkSetup(setup);
  const update = (patch: Partial<GameSetup>) => {
    setSetup((s) => ({ ...s, ...patch }));
  };
  const numeric = (value: string): number => (value.trim() === '' ? NaN : Number(value));

  return (
    <main className={styles.screen} data-testid="setup-screen">
      <section className={styles.panel}>
        <h1 className={styles.title}>{t.title}</h1>

        <fieldset className={styles.field}>
          <legend>{t.players}</legend>
          <div className={styles.row}>
            <button
              type="button"
              className={styles.stepper}
              aria-label={t.fewer}
              disabled={setup.players <= MIN_PLAYERS}
              onClick={() => {
                update({ players: clampPlayers(setup.players - 1) });
              }}
            >
              −
            </button>
            <output className={styles.count} data-testid="player-count">
              {setup.players}
            </output>
            <button
              type="button"
              className={styles.stepper}
              aria-label={t.more}
              disabled={setup.players >= MAX_PLAYERS}
              onClick={() => {
                update({ players: clampPlayers(setup.players + 1) });
              }}
            >
              +
            </button>
            <span className={styles.hint}>{t.playersHint(setup.players)}</span>
          </div>
          <div className={styles.preview} aria-hidden="true">
            <div className={styles.previewFelt} />
            {seatPositions(setup.players, 'landscape').map((p, i) => (
              <span
                key={i}
                className={`${styles.previewSeat} ${i === 0 ? styles.previewUser : ''}`}
                style={{ left: `${p.x}%`, top: `${p.y}%` }}
              />
            ))}
          </div>
        </fieldset>

        <fieldset className={styles.field}>
          <legend>{t.buyIn}</legend>
          <div className={styles.chips}>
            {BUY_IN_PRESETS.map((amount) => (
              <button
                key={amount}
                type="button"
                className={`${styles.chip} ${setup.startingStack === amount ? styles.chipActive : ''}`}
                aria-pressed={setup.startingStack === amount}
                onClick={() => {
                  update({ startingStack: amount });
                }}
              >
                {formatChips(amount)}
              </button>
            ))}
          </div>
          <input
            className={styles.input}
            type="number"
            inputMode="numeric"
            min={1}
            aria-label={t.customBuyIn}
            placeholder={t.customBuyIn}
            value={Number.isNaN(setup.startingStack) ? '' : setup.startingStack}
            onChange={(e) => {
              update({ startingStack: numeric(e.target.value) });
            }}
          />
        </fieldset>

        <fieldset className={styles.field}>
          <legend>{t.blinds}</legend>
          <div className={styles.blinds}>
            <label>
              {t.smallBlind}
              <input
                className={styles.input}
                type="number"
                inputMode="numeric"
                min={1}
                value={Number.isNaN(setup.smallBlind) ? '' : setup.smallBlind}
                onChange={(e) => {
                  update({ smallBlind: numeric(e.target.value) });
                }}
              />
            </label>
            <label>
              {t.bigBlind}
              <input
                className={styles.input}
                type="number"
                inputMode="numeric"
                min={2}
                value={Number.isNaN(setup.bigBlind) ? '' : setup.bigBlind}
                onChange={(e) => {
                  update({ bigBlind: numeric(e.target.value) });
                }}
              />
            </label>
          </div>
          {check.errors.length === 0 && (
            <p className={styles.hint}>
              {t.stackInBigBlinds(formatBigBlinds(setup.startingStack, setup.bigBlind))}
            </p>
          )}
          {check.errors.map((e) => (
            <p key={e} className={styles.error} role="alert">
              {t.errors[e]}
            </p>
          ))}
          {check.warnings.map((w) => (
            <p key={w} className={styles.warning}>
              {t.warnings[w]}
            </p>
          ))}
        </fieldset>

        <fieldset className={styles.field}>
          <legend>{t.opponents}</legend>
          <label className={styles.radio}>
            <input type="radio" name="opponents" checked readOnly />
            {t.randomMix}
          </label>
          <span className={styles.hint}>{t.randomMixHint}</span>
        </fieldset>

        <div className={styles.buttons}>
          <button
            type="button"
            className={styles.primary}
            disabled={check.errors.length > 0}
            onClick={() => {
              onStart(setup);
            }}
          >
            {t.start}
          </button>
          <button type="button" className={styles.secondary} onClick={onBack}>
            {t.back}
          </button>
        </div>
      </section>
    </main>
  );
}

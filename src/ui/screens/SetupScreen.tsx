import { type ReactNode, useState } from 'react';
import { OPPONENT_LEVELS, STYLE_IDS, type StyleId } from '../../ai/index.ts';
import { BLIND_LEVEL_CHOICES, DEFAULT_LEVEL_HANDS } from '../../app/blind-schedule.ts';
import {
  BLIND_DEPTHS,
  type BlindDepth,
  blindsForDepth,
  BUY_IN_PRESETS,
  checkSetup,
  clampPlayers,
  type GameSetup,
  MAX_PLAYERS,
  MIN_PLAYERS,
  opponentStyles,
} from '../../app/setup.ts';
import { formatBigBlinds, formatChips, strings } from '../../i18n/index.ts';
import { Icon } from '../icons.tsx';
import { dealerPosition, seatPositions } from '../table/seat-layout.ts';
import styles from './SetupScreen.module.css';

interface Props {
  readonly initial: GameSetup;
  readonly onStart: (setup: GameSetup) => void;
  readonly onBack: () => void;
}

const t = strings.setup;
const DEPTHS = Object.keys(BLIND_DEPTHS) as BlindDepth[];

/** One card of the form, with a heading. */
function Section({
  title,
  children,
  testId,
}: {
  readonly title: string;
  readonly children: ReactNode;
  readonly testId?: string;
}) {
  return (
    <fieldset className={styles.section} data-testid={testId}>
      <legend className={styles.sectionTitle}>{title}</legend>
      {children}
    </fieldset>
  );
}

/** A segmented control built from real radio inputs (keyboard and screen readers work as usual). */
function Segmented<T extends string>({
  name,
  options,
  value,
  onChange,
}: {
  readonly name: string;
  readonly options: readonly { readonly value: T; readonly label: string }[];
  readonly value: T;
  readonly onChange: (value: T) => void;
}) {
  return (
    <div className={styles.segmented}>
      {options.map((o) => (
        <label key={o.value} className={styles.segment}>
          <input
            type="radio"
            name={name}
            checked={value === o.value}
            onChange={() => {
              onChange(o.value);
            }}
          />
          <span>{o.label}</span>
        </label>
      ))}
    </div>
  );
}

export function SetupScreen({ initial, onStart, onBack }: Props) {
  const [setup, setSetup] = useState(initial);
  const check = checkSetup(setup);
  const update = (patch: Partial<GameSetup>) => {
    setSetup((s) => ({ ...s, ...patch }));
  };
  const numeric = (value: string): number => (value.trim() === '' ? NaN : Number(value));
  const valid = check.errors.length === 0;
  const isPreset = (BUY_IN_PRESETS as readonly number[]).includes(setup.startingStack);

  return (
    <main className={styles.page} data-testid="setup-screen">
      <header className={styles.top}>
        <button type="button" className={styles.back} aria-label={t.back} onClick={onBack}>
          <Icon name="back" />
        </button>
        <h1 className={styles.title}>{t.title}</h1>
      </header>

      <div className={styles.content}>
        <Section title={t.table}>
          <div className={styles.preview} aria-hidden="true">
            <div className={styles.previewTable} />
            <span
              className={styles.previewDealer}
              style={{
                left: `${dealerPosition('landscape').x}%`,
                top: `${dealerPosition('landscape').y}%`,
              }}
            />
            {seatPositions(setup.players, 'landscape').map((p, i) => (
              <span
                key={i}
                className={`${styles.previewSeat} ${i === 0 ? styles.previewUser : ''}`}
                style={{ left: `${p.x}%`, top: `${p.y}%` }}
              />
            ))}
          </div>
          <div className={styles.stepperRow}>
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
            <div className={styles.countBox}>
              <output className={styles.count} data-testid="player-count">
                {setup.players}
              </output>
              <span className={styles.countLabel}>{t.playerCount(setup.players)}</span>
            </div>
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
          </div>
          <p className={styles.hint}>{t.playersHint(setup.players)}</p>
        </Section>

        <Section title={t.buyIn}>
          <div className={styles.grid4}>
            {BUY_IN_PRESETS.map((amount) => (
              <button
                key={amount}
                type="button"
                className={styles.option}
                aria-pressed={setup.startingStack === amount}
                onClick={() => {
                  update({ startingStack: amount });
                }}
              >
                {formatChips(amount)}
              </button>
            ))}
          </div>
          <label className={`${styles.inputGroup} ${isPreset ? '' : styles.inputActive}`}>
            <span className={styles.inputLabel}>{t.customBuyIn}</span>
            <input
              className={styles.input}
              type="number"
              inputMode="numeric"
              min={1}
              aria-label={t.customBuyIn}
              value={Number.isNaN(setup.startingStack) ? '' : setup.startingStack}
              onChange={(e) => {
                update({ startingStack: numeric(e.target.value) });
              }}
            />
            <span className={styles.unit}>{t.chipsUnit}</span>
          </label>
        </Section>

        <Section title={t.blinds}>
          <div className={styles.grid4}>
            {DEPTHS.map((depth) => {
              const blinds = blindsForDepth(setup.startingStack, BLIND_DEPTHS[depth]);
              const active =
                blinds !== null &&
                blinds.smallBlind === setup.smallBlind &&
                blinds.bigBlind === setup.bigBlind;
              return (
                <button
                  key={depth}
                  type="button"
                  className={`${styles.option} ${styles.optionTall}`}
                  aria-pressed={active}
                  disabled={blinds === null}
                  onClick={() => {
                    if (blinds) update(blinds);
                  }}
                >
                  <span>{t.blindDepths[depth]}</span>
                  <small>{blinds ? t.blindPair(blinds.smallBlind, blinds.bigBlind) : '—'}</small>
                </button>
              );
            })}
          </div>
          <div className={styles.blindInputs}>
            <label className={styles.inputGroup}>
              <span className={styles.inputLabel}>{t.smallBlind}</span>
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
            <label className={styles.inputGroup}>
              <span className={styles.inputLabel}>{t.bigBlind}</span>
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
          {valid && (
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

          <div className={styles.divider} />
          <div className={styles.group} data-testid="blind-structure">
            <span className={styles.groupLabel}>{t.blindStructure}</span>
            <Segmented
              name="blind-structure"
              value={setup.blindLevelHands === null ? 'fixed' : 'rising'}
              options={[
                { value: 'fixed', label: t.fixedBlinds },
                { value: 'rising', label: t.risingBlinds },
              ]}
              onChange={(v) => {
                update({ blindLevelHands: v === 'fixed' ? null : DEFAULT_LEVEL_HANDS });
              }}
            />
            {setup.blindLevelHands !== null && (
              <>
                <div className={styles.grid4} role="group" aria-label={t.levelHands}>
                  {BLIND_LEVEL_CHOICES.map((n) => (
                    <button
                      key={n}
                      type="button"
                      className={styles.option}
                      aria-pressed={setup.blindLevelHands === n}
                      onClick={() => {
                        update({ blindLevelHands: n });
                      }}
                    >
                      {t.everyHands(n)}
                    </button>
                  ))}
                </div>
                <p className={styles.hint}>{t.risingHint}</p>
              </>
            )}
          </div>
        </Section>

        <Section title={t.opponents}>
          <Segmented
            name="opponents"
            value={setup.opponents === 'random' ? 'random' : 'choose'}
            options={[
              { value: 'random', label: t.randomMix },
              { value: 'choose', label: t.chooseStyles },
            ]}
            onChange={(v) => {
              update({
                opponents:
                  v === 'random'
                    ? 'random'
                    : Array.from({ length: setup.players - 1 }, () => 'tag' as const),
              });
            }}
          />
          {setup.opponents === 'random' ? (
            <div className={styles.group}>
              <span className={styles.groupLabel}>{t.opponentLevel}</span>
              <div className={styles.grid3} role="group" aria-label={t.opponentLevel}>
                {OPPONENT_LEVELS.map((level) => (
                  <button
                    key={level}
                    type="button"
                    className={styles.option}
                    aria-pressed={setup.opponentLevel === level}
                    onClick={() => {
                      update({ opponentLevel: level });
                    }}
                  >
                    {t.opponentLevels[level]}
                  </button>
                ))}
              </div>
              <p className={styles.hint}>{t.opponentLevelHints[setup.opponentLevel]}</p>
            </div>
          ) : (
            <div className={styles.styleList}>
              {(opponentStyles(setup) as readonly StyleId[]).map((style, i) => (
                <label key={i} className={styles.styleRow}>
                  <span>{t.opponentLabel(i + 1)}</span>
                  <select
                    className={styles.select}
                    value={style}
                    onChange={(e) => {
                      const next = [...(opponentStyles(setup) as readonly StyleId[])];
                      next[i] = e.target.value as StyleId;
                      update({ opponents: next });
                    }}
                  >
                    {STYLE_IDS.map((id) => (
                      <option key={id} value={id}>
                        {strings.styles[id]}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          )}
        </Section>
      </div>

      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <p className={styles.summary} data-testid="setup-summary">
            {valid
              ? t.summary(setup.players, setup.startingStack, setup.smallBlind, setup.bigBlind)
              : t.fixErrors}
          </p>
          <button
            type="button"
            className={styles.start}
            disabled={!valid}
            onClick={() => {
              onStart({ ...setup, opponents: opponentStyles(setup) });
            }}
          >
            {t.start}
          </button>
        </div>
      </footer>
    </main>
  );
}

import { type CSSProperties, useSyncExternalStore } from 'react';
import {
  ACCENT_COLORS,
  type ActionTimer,
  CARD_BACK_COLORS,
  FELT_COLORS,
  type Settings,
  type SettingsStore,
  THEME_SETTINGS,
} from '../../app/settings.ts';
import { strings } from '../../i18n/index.ts';
import styles from './Screens.module.css';

const t = strings.settings;

type BooleanKey = {
  [K in keyof Settings]: Settings[K] extends boolean ? K : never;
}[keyof Settings];

function Toggle({
  store,
  field,
  label,
}: {
  readonly store: SettingsStore;
  readonly field: BooleanKey;
  readonly label: string;
}) {
  const settings = useSyncExternalStore(store.subscribe, store.get);
  return (
    <label className={styles.toggle}>
      <span>{label}</span>
      <input
        type="checkbox"
        role="switch"
        checked={settings[field]}
        onChange={(e) => {
          store.update({ [field]: e.target.checked });
        }}
      />
    </label>
  );
}

/** A row of color swatches backed by radio inputs (AGENTS.md §32.3). */
function Swatches<T extends string>({
  label,
  name,
  options,
  value,
  names,
  onChange,
}: {
  readonly label: string;
  readonly name: 'felt' | 'cardback' | 'accent';
  readonly options: readonly T[];
  readonly value: T;
  readonly names: Readonly<Record<T, string>>;
  readonly onChange: (value: T) => void;
}) {
  return (
    <div className={styles.swatchField} role="radiogroup" aria-label={label}>
      <span className={styles.swatchLabel}>
        {label}
        <span className={styles.swatchValue}>{names[value]}</span>
      </span>
      <div className={styles.swatches}>
        {options.map((option) => (
          <label
            key={option}
            className={styles.swatch}
            style={{ '--swatch': `var(--swatch-${name}-${option})` } as CSSProperties}
            title={names[option]}
          >
            <input
              type="radio"
              name={name}
              aria-label={names[option]}
              checked={value === option}
              onChange={() => {
                onChange(option);
              }}
            />
          </label>
        ))}
      </div>
    </div>
  );
}

/** Settings screen (AGENTS.md §11.7). */
export function SettingsScreen({
  store,
  onBack,
}: {
  readonly store: SettingsStore;
  readonly onBack: () => void;
}) {
  const settings = useSyncExternalStore(store.subscribe, store.get);
  const timers: readonly ActionTimer[] = ['off', 15, 20, 30];
  return (
    <main className={styles.screen} data-testid="settings-screen">
      <section className={styles.panel}>
        <h1 className={styles.title}>{t.title}</h1>

        <fieldset className={styles.field}>
          <legend>{t.sections.appearance}</legend>
          <label className={styles.toggle}>
            <span>{t.theme}</span>
            <select
              className={styles.select}
              value={settings.theme}
              data-testid="theme-setting"
              onChange={(e) => {
                const value = THEME_SETTINGS.find((v) => v === e.target.value);
                if (value) store.update({ theme: value });
              }}
            >
              {THEME_SETTINGS.map((v) => (
                <option key={v} value={v}>
                  {t.themeOptions[v]}
                </option>
              ))}
            </select>
          </label>
          <Swatches
            label={t.felt}
            name="felt"
            options={FELT_COLORS}
            value={settings.felt}
            names={t.feltOptions}
            onChange={(felt) => {
              store.update({ felt });
            }}
          />
          <Swatches
            label={t.cardBack}
            name="cardback"
            options={CARD_BACK_COLORS}
            value={settings.cardBack}
            names={t.cardBackOptions}
            onChange={(cardBack) => {
              store.update({ cardBack });
            }}
          />
          <Swatches
            label={t.accent}
            name="accent"
            options={ACCENT_COLORS}
            value={settings.accent}
            names={t.accentOptions}
            onChange={(accent) => {
              store.update({ accent });
            }}
          />
        </fieldset>

        <fieldset className={styles.field}>
          <legend>{t.sections.help}</legend>
          <Toggle store={store} field="oddsPanel" label={t.oddsPanel} />
          <Toggle store={store} field="rabbitHunt" label={t.rabbitHunt} />
          <Toggle store={store} field="handHistory" label={t.handHistory} />
          <Toggle store={store} field="showNpcStyles" label={t.showNpcStyles} />
        </fieldset>

        <fieldset className={styles.field}>
          <legend>{t.sections.time}</legend>
          <label className={styles.toggle}>
            <span>{t.actionTimer}</span>
            <select
              className={styles.select}
              value={String(settings.actionTimer)}
              onChange={(e) => {
                const v = e.target.value;
                store.update({ actionTimer: v === 'off' ? 'off' : (Number(v) as ActionTimer) });
              }}
            >
              {timers.map((timer) => (
                <option key={timer} value={String(timer)}>
                  {timer === 'off' ? t.timerOff : t.seconds(timer)}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.toggle}>
            <span>{t.npcSpeed}</span>
            <select
              className={styles.select}
              value={settings.npcSpeed}
              onChange={(e) => {
                store.update({ npcSpeed: e.target.value === 'fast' ? 'fast' : 'normal' });
              }}
            >
              <option value="normal">{strings.pause.speedNormal}</option>
              <option value="fast">{strings.pause.speedFast}</option>
            </select>
          </label>
        </fieldset>

        <fieldset className={styles.field}>
          <legend>{t.sections.cards}</legend>
          <Toggle store={store} field="stackInBigBlinds" label={t.stackInBigBlinds} />
          <Toggle store={store} field="fourColorDeck" label={t.fourColorDeck} />
          <Toggle store={store} field="autoMuck" label={t.autoMuck} />
          <Toggle store={store} field="confirmAllIn" label={t.confirmAllIn} />
        </fieldset>

        <fieldset className={styles.field}>
          <legend>{t.sections.sound}</legend>
          <Toggle store={store} field="sound" label={t.sound} />
          <label className={styles.toggle}>
            <span>{t.volume}</span>
            <input
              type="range"
              min={0}
              max={100}
              value={settings.volume}
              onChange={(e) => {
                store.update({ volume: Number(e.target.value) });
              }}
            />
          </label>
          <Toggle store={store} field="haptics" label={t.haptics} />
          <Toggle store={store} field="reducedMotion" label={t.reducedMotion} />
        </fieldset>

        <div className={styles.buttons}>
          <button
            type="button"
            className={styles.secondary}
            onClick={() => {
              store.reset();
            }}
          >
            {t.reset}
          </button>
          <button type="button" className={styles.primary} onClick={onBack}>
            {t.back}
          </button>
        </div>
      </section>
    </main>
  );
}

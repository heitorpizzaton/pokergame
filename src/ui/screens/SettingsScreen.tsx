import { useSyncExternalStore } from 'react';
import type { ActionTimer, Settings, SettingsStore } from '../../app/settings.ts';
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

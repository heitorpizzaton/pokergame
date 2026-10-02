/** User settings (AGENTS.md §11.7), persisted in localStorage. */
export type ActionTimer = 'off' | 15 | 20 | 30;
export type NpcSpeedSetting = 'normal' | 'fast';
/** Color theme (AGENTS.md §30.2): follow the device, or force light or dark. */
export type ThemeSetting = 'auto' | 'light' | 'dark';
export const THEME_SETTINGS: readonly ThemeSetting[] = ['auto', 'light', 'dark'];
/** Personalisation (AGENTS.md §32.3): felt, card backs and the accent of menus and buttons. */
export type FeltColor = 'green' | 'blue' | 'red' | 'purple' | 'graphite';
export const FELT_COLORS: readonly FeltColor[] = ['green', 'blue', 'red', 'purple', 'graphite'];
export type CardBackColor = 'red' | 'blue' | 'green' | 'black';
export const CARD_BACK_COLORS: readonly CardBackColor[] = ['red', 'blue', 'green', 'black'];
export type AccentColor = 'gold' | 'emerald' | 'sapphire' | 'ruby';
export const ACCENT_COLORS: readonly AccentColor[] = ['gold', 'emerald', 'sapphire', 'ruby'];

export interface Settings {
  /** Odds panel on/off (AGENTS.md §19). Off: no probability is computed for display. */
  readonly oddsPanel: boolean;
  /** Odds panel expanded, or minimized to a pill (the default), remembered between games. */
  readonly oddsExpanded: boolean;
  readonly handHistory: boolean;
  readonly rabbitHunt: boolean;
  readonly actionTimer: ActionTimer;
  readonly npcSpeed: NpcSpeedSetting;
  readonly showNpcStyles: boolean;
  readonly stackInBigBlinds: boolean;
  readonly fourColorDeck: boolean;
  readonly autoMuck: boolean;
  readonly confirmAllIn: boolean;
  readonly sound: boolean;
  /** 0–100. */
  readonly volume: number;
  readonly haptics: boolean;
  readonly reducedMotion: boolean;
  readonly theme: ThemeSetting;
  readonly felt: FeltColor;
  readonly cardBack: CardBackColor;
  readonly accent: AccentColor;
  /** The first-game tips were seen and dismissed (AGENTS.md §31.2.4). */
  readonly tipsSeen: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  oddsPanel: true,
  oddsExpanded: false,
  handHistory: false,
  rabbitHunt: true,
  actionTimer: 20,
  npcSpeed: 'normal',
  showNpcStyles: false,
  stackInBigBlinds: false,
  fourColorDeck: false,
  autoMuck: true,
  confirmAllIn: false,
  sound: true,
  volume: 70,
  haptics: true,
  reducedMotion: false,
  theme: 'auto',
  felt: 'green',
  cardBack: 'red',
  accent: 'gold',
  // The seeded end-to-end build starts at the table directly; its tips test opts in.
  tipsSeen: import.meta.env.MODE === 'e2e',
};

const STORAGE_KEY = 'mesa-viva:settings';
const TIMERS: readonly ActionTimer[] = ['off', 15, 20, 30];

/** Reads settings, keeping only valid values and falling back to defaults field by field. */
export function loadSettings(storage: Pick<Storage, 'getItem'> | null): Settings {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const bool = (key: keyof Settings): boolean =>
      typeof parsed[key] === 'boolean' ? parsed[key] : (DEFAULT_SETTINGS[key] as boolean);
    const timer = TIMERS.find((t) => t === parsed.actionTimer) ?? DEFAULT_SETTINGS.actionTimer;
    const volume = Number(parsed.volume);
    return {
      oddsPanel: bool('oddsPanel'),
      oddsExpanded: bool('oddsExpanded'),
      handHistory: bool('handHistory'),
      rabbitHunt: bool('rabbitHunt'),
      actionTimer: timer,
      npcSpeed: parsed.npcSpeed === 'fast' ? 'fast' : 'normal',
      showNpcStyles: bool('showNpcStyles'),
      stackInBigBlinds: bool('stackInBigBlinds'),
      fourColorDeck: bool('fourColorDeck'),
      autoMuck: bool('autoMuck'),
      confirmAllIn: bool('confirmAllIn'),
      sound: bool('sound'),
      volume: Number.isFinite(volume)
        ? Math.min(100, Math.max(0, Math.round(volume)))
        : DEFAULT_SETTINGS.volume,
      haptics: bool('haptics'),
      reducedMotion: bool('reducedMotion'),
      theme: THEME_SETTINGS.find((t) => t === parsed.theme) ?? DEFAULT_SETTINGS.theme,
      felt: FELT_COLORS.find((c) => c === parsed.felt) ?? DEFAULT_SETTINGS.felt,
      cardBack: CARD_BACK_COLORS.find((c) => c === parsed.cardBack) ?? DEFAULT_SETTINGS.cardBack,
      accent: ACCENT_COLORS.find((c) => c === parsed.accent) ?? DEFAULT_SETTINGS.accent,
      tipsSeen: bool('tipsSeen'),
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(storage: Pick<Storage, 'setItem'> | null, settings: Settings): void {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Settings are a convenience; failing to persist them must not break the game.
  }
}

/** A tiny observable store so the table, header toggle and Settings screen stay in sync. */
export class SettingsStore {
  #settings: Settings;
  readonly #storage: Pick<Storage, 'getItem' | 'setItem'> | null;
  readonly #listeners = new Set<() => void>();

  constructor(storage: Pick<Storage, 'getItem' | 'setItem'> | null) {
    this.#storage = storage;
    this.#settings = loadSettings(storage);
  }

  readonly subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  readonly get = (): Settings => this.#settings;

  update(patch: Partial<Settings>): void {
    this.#settings = { ...this.#settings, ...patch };
    saveSettings(this.#storage, this.#settings);
    for (const l of this.#listeners) l();
  }

  reset(): void {
    // "Restaurar padrões" keeps the tips dismissed; "Como jogar" can show them again.
    this.update({ ...DEFAULT_SETTINGS, tipsSeen: this.#settings.tipsSeen });
  }
}

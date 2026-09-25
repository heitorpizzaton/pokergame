import type { GameConfig } from '../core/engine/index.ts';

/** What the user chooses on the Setup screen (AGENTS.md §5.1). */
export interface GameSetup {
  readonly players: number;
  readonly startingStack: number;
  readonly smallBlind: number;
  readonly bigBlind: number;
}

export const DEFAULT_SETUP: GameSetup = {
  players: 6,
  startingStack: 10_000,
  smallBlind: 50,
  bigBlind: 100,
};

export const BUY_IN_PRESETS = [1_000, 5_000, 10_000, 50_000] as const;
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 9;

export type SetupError = 'integer' | 'smallBlindMin' | 'bigBlindAboveSmall' | 'stackTooShort';
export type SetupWarning = 'shortStack' | 'bigBlindSuggestion';

export interface SetupCheck {
  readonly errors: readonly SetupError[];
  readonly warnings: readonly SetupWarning[];
}

export function checkSetup(setup: GameSetup): SetupCheck {
  const errors: SetupError[] = [];
  const warnings: SetupWarning[] = [];
  const { startingStack, smallBlind, bigBlind } = setup;
  if (![startingStack, smallBlind, bigBlind].every((v) => Number.isSafeInteger(v))) {
    return { errors: ['integer'], warnings };
  }
  if (smallBlind < 1) errors.push('smallBlindMin');
  if (bigBlind <= smallBlind) errors.push('bigBlindAboveSmall');
  if (bigBlind > 0 && startingStack < 10 * bigBlind) errors.push('stackTooShort');
  if (errors.length === 0) {
    if (startingStack < 20 * bigBlind) warnings.push('shortStack');
    if (bigBlind < 2 * smallBlind) warnings.push('bigBlindSuggestion');
  }
  return { errors, warnings };
}

export function clampPlayers(n: number): number {
  return Math.min(MAX_PLAYERS, Math.max(MIN_PLAYERS, Math.round(n)));
}

/** Seat 0 is always the user. */
export function toEngineConfig(
  setup: GameSetup,
  opponentNames: readonly string[],
  userName: string,
): GameConfig {
  return {
    players: [
      { name: userName, autoMuck: true },
      ...opponentNames.slice(0, setup.players - 1).map((name) => ({ name, autoMuck: true })),
    ],
    startingStack: setup.startingStack,
    smallBlind: setup.smallBlind,
    bigBlind: setup.bigBlind,
  };
}

const STORAGE_KEY = 'mesa-viva:last-setup';

/** The last setup the user started a game with (AGENTS.md §11.7), or the defaults. */
export function loadLastSetup(storage: Pick<Storage, 'getItem'> | null): GameSetup {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETUP;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const setup: GameSetup = {
      players: clampPlayers(Number(parsed.players ?? DEFAULT_SETUP.players)),
      startingStack: Number(parsed.startingStack ?? DEFAULT_SETUP.startingStack),
      smallBlind: Number(parsed.smallBlind ?? DEFAULT_SETUP.smallBlind),
      bigBlind: Number(parsed.bigBlind ?? DEFAULT_SETUP.bigBlind),
    };
    return checkSetup(setup).errors.length === 0 ? setup : DEFAULT_SETUP;
  } catch {
    return DEFAULT_SETUP;
  }
}

export function saveLastSetup(storage: Pick<Storage, 'setItem'> | null, setup: GameSetup): void {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(setup));
  } catch {
    // Storage can be unavailable (private mode, blocked site data); the setup is a convenience.
  }
}

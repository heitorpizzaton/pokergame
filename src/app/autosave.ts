import type { SavedGame } from './game-controller.ts';

const KEY = 'mesa-viva:autosave';

/** The saved game, if any (AGENTS.md §5.8). Invalid or foreign data is ignored. */
export function loadAutosave(storage: Pick<Storage, 'getItem'> | null): SavedGame | null {
  try {
    const raw = storage?.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SavedGame>;
    if (parsed.version !== 1 || parsed.state?.hand !== null) return null;
    return parsed as SavedGame;
  } catch {
    return null;
  }
}

export function saveAutosave(storage: Pick<Storage, 'setItem'> | null, save: SavedGame): void {
  try {
    storage?.setItem(KEY, JSON.stringify(save));
  } catch {
    // A full or blocked storage must not stop the game.
  }
}

export function clearAutosave(storage: Pick<Storage, 'removeItem'> | null): void {
  try {
    storage?.removeItem(KEY);
  } catch {
    // Nothing to do.
  }
}

import { lazy, Suspense, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { randomStyles, type StyleId } from '../ai/index.ts';
import { CryptoRng } from '../core/rng/index.ts';
import {
  buildHandRecord,
  type HistoryStore,
  IndexedDbHistoryStore,
  MemoryHistoryStore,
} from '../history/index.ts';
import { strings } from '../i18n/index.ts';
import { MenuScreen } from '../ui/screens/MenuScreen.tsx';
import { SettingsScreen } from '../ui/screens/SettingsScreen.tsx';
import { SetupScreen } from '../ui/screens/SetupScreen.tsx';
import { TableScreen } from '../ui/screens/TableScreen.tsx';
import { type AiWorkerLike, WorkerNpcDriver } from '../workers/ai-client.ts';
import { EquityClient, type EquityWorkerLike } from '../workers/equity-client.ts';
import { createEquityHandler } from '../workers/equity-protocol.ts';
import { clearAutosave, loadAutosave, saveAutosave } from './autosave.ts';
import {
  GameController,
  type SavedGame,
  type Speed,
  type TimerSettings,
} from './game-controller.ts';
import { pickNames } from './names.ts';
import { LocalNpcDriver, type NpcDriver, type NpcSeat } from './npc-driver.ts';
import type { RngFactory } from './rng-factory.ts';
import { type Settings, SettingsStore } from './settings.ts';
import { type GameSetup, loadLastSetup, saveLastSetup, toEngineConfig } from './setup.ts';

// AGENTS.md §12: history and the replayer are not part of the initial bundle.
const HistoryScreen = lazy(() =>
  import('../ui/screens/HistoryScreen.tsx').then((m) => ({ default: m.HistoryScreen })),
);
const GuideScreen = lazy(() =>
  import('../ui/screens/GuideScreen.tsx').then((m) => ({ default: m.GuideScreen })),
);

type Screen =
  | { readonly name: 'menu' }
  | { readonly name: 'setup' }
  | { readonly name: 'settings' }
  | { readonly name: 'history' }
  | { readonly name: 'guide' }
  | { readonly name: 'table'; readonly controller: GameController; readonly setup: GameSetup };

function storage(): Storage | null {
  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
}

const params = new URLSearchParams(globalThis.location.search);

/** `?speed=fast|instant` overrides the NPC speed (used by end-to-end tests). */
function speedFor(settings: Settings): Speed {
  const param = params.get('speed');
  return param === 'fast' || param === 'instant' ? param : settings.npcSpeed;
}

/** `?timerMs=…&bankMs=…` overrides the timer (end-to-end tests of the time bank). */
function timerFor(settings: Settings): TimerSettings {
  const timerMs = Number(params.get('timerMs'));
  const bankMs = Number(params.get('bankMs'));
  if (timerMs > 0) return { actionMs: timerMs, bankMs: bankMs >= 0 ? bankMs : 30_000 };
  return {
    actionMs: settings.actionTimer === 'off' ? null : settings.actionTimer * 1000,
    bankMs: 30_000,
  };
}

/** NPC brains in a module worker when available, otherwise in-process. */
function createDriver(seats: readonly NpcSeat[], rngs: RngFactory): NpcDriver {
  try {
    if (rngs.workers && typeof Worker !== 'undefined') {
      const worker = new Worker(new URL('../workers/ai.worker.ts', import.meta.url), {
        type: 'module',
      });
      return new WorkerNpcDriver(worker as unknown as AiWorkerLike, seats);
    }
  } catch {
    // Fall through to in-process brains.
  }
  return new LocalNpcDriver(seats, (seat) => rngs.brain(seat));
}

function createEquityClient(): EquityClient {
  try {
    if (typeof Worker !== 'undefined') {
      const worker = new Worker(new URL('../workers/equity.worker.ts', import.meta.url), {
        type: 'module',
      });
      return new EquityClient(worker as unknown as EquityWorkerLike);
    }
  } catch {
    // Fall through to an in-process handler.
  }
  const local: EquityWorkerLike = {
    onmessage: null,
    postMessage: (message) => void handle(message),
    terminate: () => undefined,
  };
  const handle = createEquityHandler(
    (response) => local.onmessage?.({ data: response }),
    new CryptoRng(),
  );
  return new EquityClient(local);
}

function createHistoryStore(): HistoryStore {
  try {
    if (typeof indexedDB !== 'undefined') return new IndexedDbHistoryStore();
  } catch {
    // Private modes can block IndexedDB.
  }
  return new MemoryHistoryStore();
}

function setupFromSave(save: SavedGame): GameSetup {
  const { config } = save.state;
  return {
    players: config.players.length,
    startingStack: config.startingStack,
    smallBlind: config.smallBlind,
    bigBlind: config.bigBlind,
    opponents: save.styles.filter((s): s is StyleId => s !== null),
  };
}

export function App({ rngs }: { readonly rngs: RngFactory }) {
  const settingsStore = useMemo(() => new SettingsStore(storage()), []);
  const settings = useSyncExternalStore(settingsStore.subscribe, settingsStore.get);
  const history = useMemo(() => createHistoryStore(), []);
  const equity = useMemo(() => createEquityClient(), []);
  const sessionId = useMemo(() => new Date().toISOString(), []);
  const [screen, setScreen] = useState<Screen>({ name: 'menu' });
  const [autosave, setAutosave] = useState(() => loadAutosave(storage()));

  const buildController = (setup: GameSetup, restore?: SavedGame): GameController => {
    const deckRng = rngs.deck();
    const npcRng = rngs.npc();
    const styles: (StyleId | null)[] = restore
      ? [...restore.styles]
      : [
          null,
          ...(setup.opponents === 'random'
            ? randomStyles(setup.players - 1, npcRng)
            : [...setup.opponents]),
        ];
    const names = restore
      ? restore.state.seats.map((s) => s.name)
      : [strings.table.you, ...pickNames(setup.players - 1, npcRng)];
    const seats = styles.flatMap((style, seat) => (style ? [{ seat, style }] : []));
    const current = settingsStore.get();
    return new GameController({
      config: toEngineConfig(setup, names.slice(1), names[0] ?? strings.table.you),
      deckRng,
      npcRng,
      speed: speedFor(current),
      driver: createDriver(seats, rngs),
      styles,
      timer: timerFor(current),
      rabbitHunt: current.rabbitHunt,
      ...(restore ? { restore } : {}),
      onSave: (save) => {
        saveAutosave(storage(), save);
      },
      onGameOver: () => {
        clearAutosave(storage());
        setAutosave(null);
      },
      onHandComplete: (hand) => {
        if (settingsStore.get().handHistory) void history.add(buildHandRecord(hand, sessionId));
      },
    });
  };

  // Keep a running game in sync with settings changed mid-game.
  const controller = screen.name === 'table' ? screen.controller : null;
  useEffect(() => {
    if (!controller) return;
    if (!params.get('speed')) controller.setSpeed(settings.npcSpeed);
    controller.setTimer(timerFor(settings));
    controller.setRabbitHunt(settings.rabbitHunt);
    controller.setAutoMuck(settings.autoMuck);
  }, [controller, settings]);

  useEffect(() => {
    if (!controller) return;
    controller.start();
    return () => {
      controller.suspend();
    };
  }, [controller]);

  const startGame = (setup: GameSetup) => {
    saveLastSetup(storage(), setup);
    if (screen.name === 'table') screen.controller.dispose();
    setScreen({ name: 'table', controller: buildController(setup), setup });
  };

  const toMenu = () => {
    if (screen.name === 'table') screen.controller.dispose();
    setAutosave(loadAutosave(storage()));
    setScreen({ name: 'menu' });
  };

  switch (screen.name) {
    case 'menu':
      return (
        <MenuScreen
          onNewGame={() => {
            setScreen({ name: 'setup' });
          }}
          onContinue={
            autosave
              ? () => {
                  const setup = setupFromSave(autosave);
                  setScreen({ name: 'table', controller: buildController(setup, autosave), setup });
                }
              : null
          }
          onHistory={
            settings.handHistory
              ? () => {
                  setScreen({ name: 'history' });
                }
              : null
          }
          onSettings={() => {
            setScreen({ name: 'settings' });
          }}
          onGuide={() => {
            setScreen({ name: 'guide' });
          }}
        />
      );
    case 'setup':
      return (
        <SetupScreen
          initial={loadLastSetup(storage())}
          onStart={startGame}
          onBack={() => {
            setScreen({ name: 'menu' });
          }}
        />
      );
    case 'settings':
      return <SettingsScreen store={settingsStore} onBack={toMenu} />;
    case 'history':
      return (
        <Suspense fallback={null}>
          <HistoryScreen store={history} onBack={toMenu} />
        </Suspense>
      );
    case 'guide':
      return (
        <Suspense fallback={null}>
          <GuideScreen onBack={toMenu} fourColor={settings.fourColorDeck} />
        </Suspense>
      );
    case 'table':
      return (
        <TableScreen
          controller={screen.controller}
          settings={settings}
          onSettingsChange={(patch) => {
            settingsStore.update(patch);
          }}
          equity={equity}
          onExit={toMenu}
          onPlayAgain={() => {
            startGame(screen.setup);
          }}
        />
      );
  }
}

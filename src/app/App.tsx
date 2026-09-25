import { useEffect, useState } from 'react';
import { randomStyles } from '../ai/index.ts';
import { CryptoRng } from '../core/rng/index.ts';
import { strings } from '../i18n/index.ts';
import { MenuScreen } from '../ui/screens/MenuScreen.tsx';
import { SetupScreen } from '../ui/screens/SetupScreen.tsx';
import { TableScreen } from '../ui/screens/TableScreen.tsx';
import { type AiWorkerLike, WorkerNpcDriver } from '../workers/ai-client.ts';
import { GameController, type Speed } from './game-controller.ts';
import { LocalNpcDriver, type NpcDriver, type NpcSeat } from './npc-driver.ts';
import { pickNames } from './names.ts';
import { type GameSetup, loadLastSetup, saveLastSetup, toEngineConfig } from './setup.ts';

type Screen =
  | { readonly name: 'menu' }
  | { readonly name: 'setup' }
  | { readonly name: 'table'; readonly controller: GameController; readonly setup: GameSetup };

function storage(): Storage | null {
  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
}

/** `?speed=fast` or `?speed=instant` (used by end-to-end tests) overrides the NPC speed. */
function initialSpeed(): Speed {
  const param = new URLSearchParams(globalThis.location.search).get('speed');
  return param === 'fast' || param === 'instant' ? param : 'normal';
}

/** NPC brains in a module worker when available, otherwise in-process. */
function createDriver(seats: readonly NpcSeat[]): NpcDriver {
  try {
    if (typeof Worker !== 'undefined') {
      const worker = new Worker(new URL('../workers/ai.worker.ts', import.meta.url), {
        type: 'module',
      });
      return new WorkerNpcDriver(worker as unknown as AiWorkerLike, seats);
    }
  } catch {
    // Fall through to in-process brains.
  }
  return new LocalNpcDriver(seats, () => new CryptoRng());
}

function createController(setup: GameSetup): GameController {
  const npcRng = new CryptoRng();
  const names = pickNames(setup.players - 1, npcRng);
  const styles =
    setup.opponents === 'random' ? randomStyles(setup.players - 1, npcRng) : [...setup.opponents];
  const seats = styles.map((style, i) => ({ seat: i + 1, style }));
  return new GameController({
    config: toEngineConfig(setup, names, strings.table.you),
    deckRng: new CryptoRng(),
    npcRng,
    speed: initialSpeed(),
    driver: createDriver(seats),
    styles: [null, ...styles],
  });
}

export function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'menu' });

  useEffect(() => {
    if (screen.name !== 'table') return;
    screen.controller.start();
    return () => {
      screen.controller.suspend();
    };
  }, [screen]);

  const startGame = (setup: GameSetup) => {
    saveLastSetup(storage(), setup);
    setScreen({ name: 'table', controller: createController(setup), setup });
  };

  switch (screen.name) {
    case 'menu':
      return (
        <MenuScreen
          onNewGame={() => {
            setScreen({ name: 'setup' });
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
    case 'table':
      return (
        <TableScreen
          controller={screen.controller}
          onExit={() => {
            setScreen({ name: 'menu' });
          }}
          onPlayAgain={() => {
            startGame(screen.setup);
          }}
        />
      );
  }
}

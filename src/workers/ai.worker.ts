/// <reference lib="webworker" />
import { LocalNpcDriver } from '../app/npc-driver.ts';
import { CryptoRng } from '../core/rng/index.ts';
import type { AiWorkerRequest, AiWorkerResponse } from './ai-protocol.ts';

// NPC brains run off the main thread so decisions never freeze the UI (AGENTS.md §8.4). Each
// brain has its own secure RNG stream, independent of the deck (AGENTS.md §6).
const scope = globalThis as unknown as DedicatedWorkerGlobalScope;
let driver: LocalNpcDriver | null = null;

scope.onmessage = (event: MessageEvent<AiWorkerRequest>) => {
  const message = event.data;
  switch (message.type) {
    case 'init':
      driver = new LocalNpcDriver(message.seats, () => new CryptoRng());
      break;
    case 'decide': {
      if (!driver) return;
      const response: AiWorkerResponse = {
        type: 'decision',
        id: message.id,
        action: driver.decide(message.seat, message.view),
      };
      scope.postMessage(response);
      break;
    }
    case 'observe':
      driver?.observeHandEnd(message.views);
      break;
  }
};

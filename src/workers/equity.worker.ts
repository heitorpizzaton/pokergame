/// <reference lib="webworker" />
import { CryptoRng } from '../core/rng/index.ts';
import { createEquityHandler, type EquityWorkerRequest } from './equity-protocol.ts';

// Equity runs off the main thread so the UI never blocks (AGENTS.md §3, §7.2).
const scope = globalThis as unknown as DedicatedWorkerGlobalScope;
const handle = createEquityHandler((message) => {
  scope.postMessage(message);
}, new CryptoRng());
scope.onmessage = (event: MessageEvent<EquityWorkerRequest>) => {
  void handle(event.data);
};

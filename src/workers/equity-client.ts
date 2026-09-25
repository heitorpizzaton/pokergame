import type { EquityRequest, EquityResult } from '../core/equity/index.ts';
import type { EquityWorkerRequest, EquityWorkerResponse } from './equity-protocol.ts';

/** The subset of the Worker API the client needs (lets tests run the handler in-process). */
export interface EquityWorkerLike {
  postMessage(message: EquityWorkerRequest): void;
  onmessage: ((event: { data: EquityWorkerResponse }) => void) | null;
  terminate(): void;
}

interface Pending {
  readonly id: number;
  readonly key: string;
  readonly resolve: (result: EquityResult | null) => void;
  readonly onProgress: ((result: EquityResult) => void) | undefined;
}

export function equityCacheKey(request: EquityRequest): string {
  const hero = [...request.hero].sort((a, b) => a - b).join(',');
  const board = [...request.board].sort((a, b) => a - b).join(',');
  return `${hero}|${board}|${request.opponents}`;
}

/**
 * Main-thread client for the equity worker. Results are cached per game state (hero cards, board,
 * number of opponents); a new request cancels the previous one, whose promise resolves to null.
 */
export class EquityClient {
  readonly #worker: EquityWorkerLike;
  readonly #cache = new Map<string, EquityResult>();
  #nextId = 1;
  #pending: Pending | null = null;

  constructor(worker: EquityWorkerLike) {
    this.#worker = worker;
    worker.onmessage = ({ data }) => {
      this.#receive(data);
    };
  }

  request(
    request: EquityRequest,
    onProgress?: (result: EquityResult) => void,
  ): Promise<EquityResult | null> {
    this.cancel();
    const key = equityCacheKey(request);
    const cached = this.#cache.get(key);
    if (cached) {
      onProgress?.(cached);
      return Promise.resolve(cached);
    }
    const id = this.#nextId++;
    return new Promise((resolve) => {
      this.#pending = { id, key, resolve, onProgress };
      this.#worker.postMessage({
        type: 'compute',
        id,
        hero: [...request.hero],
        board: [...request.board],
        opponents: request.opponents,
      });
    });
  }

  /** Abandons the running request, if any (its promise resolves to null). */
  cancel(): void {
    const pending = this.#pending;
    if (!pending) return;
    this.#pending = null;
    this.#worker.postMessage({ type: 'cancel', id: pending.id });
    pending.resolve(null);
  }

  dispose(): void {
    this.cancel();
    this.#worker.terminate();
  }

  #receive(message: EquityWorkerResponse): void {
    const pending = this.#pending;
    if (pending?.id !== message.id) return;
    if (message.type === 'progress') {
      pending.onProgress?.(message.result);
    } else if (message.type === 'done') {
      this.#pending = null;
      this.#cache.set(pending.key, message.result);
      pending.onProgress?.(message.result);
      pending.resolve(message.result);
    } else {
      this.#pending = null;
      pending.resolve(null);
    }
  }
}

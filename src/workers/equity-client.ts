import type { Card } from '../core/cards/index.ts';
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
  readonly #versusCache = new Map<string, readonly EquityResult[]>();
  readonly #versusPending = new Map<number, (results: readonly EquityResult[]) => void>();

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

  /**
   * Exact equity of each known hand over the rest of the board (the all-in equity bar). Runs
   * beside {@link request} without cancelling it; results are cached.
   */
  requestVersus(
    hands: readonly (readonly Card[])[],
    board: readonly Card[],
  ): Promise<readonly EquityResult[]> {
    const key = `${hands.map((h) => h.join(',')).join('|')}/${board.join(',')}`;
    const cached = this.#versusCache.get(key);
    if (cached) return Promise.resolve(cached);
    const id = this.#nextId++;
    return new Promise((resolve) => {
      this.#versusPending.set(id, (results) => {
        this.#versusCache.set(key, results);
        resolve(results);
      });
      this.#worker.postMessage({
        type: 'versus',
        id,
        hands: hands.map((h) => [...h]),
        board: [...board],
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
    if (message.type === 'versus') {
      this.#versusPending.get(message.id)?.(message.results);
      this.#versusPending.delete(message.id);
      return;
    }
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

import type { NpcDriver, NpcSeat } from '../app/npc-driver.ts';
import type { PlayerAction, PlayerView } from '../core/view/index.ts';
import type { AiWorkerRequest, AiWorkerResponse } from './ai-protocol.ts';

export interface AiWorkerLike {
  postMessage(message: AiWorkerRequest): void;
  onmessage: ((event: { data: AiWorkerResponse }) => void) | null;
  terminate(): void;
}

/** NpcDriver backed by the AI worker. */
export class WorkerNpcDriver implements NpcDriver {
  readonly #worker: AiWorkerLike;
  readonly #pending = new Map<number, (action: PlayerAction) => void>();
  #nextId = 1;

  constructor(worker: AiWorkerLike, seats: readonly NpcSeat[]) {
    this.#worker = worker;
    worker.onmessage = ({ data }) => {
      const resolve = this.#pending.get(data.id);
      this.#pending.delete(data.id);
      resolve?.(data.action);
    };
    worker.postMessage({ type: 'init', seats: [...seats] });
  }

  decide(seat: number, view: PlayerView): Promise<PlayerAction> {
    const id = this.#nextId++;
    return new Promise((resolve) => {
      this.#pending.set(id, resolve);
      this.#worker.postMessage({ type: 'decide', id, seat, view });
    });
  }

  observeHandEnd(views: readonly PlayerView[]): void {
    this.#worker.postMessage({ type: 'observe', views: [...views] });
  }

  dispose(): void {
    this.#pending.clear();
    this.#worker.terminate();
  }
}

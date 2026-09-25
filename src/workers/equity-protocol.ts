import type { Card } from '../core/cards/index.ts';
import { type EquityResult, runEquity } from '../core/equity/index.ts';
import type { Rng } from '../core/rng/index.ts';

export type EquityWorkerRequest =
  | {
      readonly type: 'compute';
      readonly id: number;
      readonly hero: readonly Card[];
      readonly board: readonly Card[];
      readonly opponents: number;
    }
  | { readonly type: 'cancel'; readonly id: number };

export type EquityWorkerResponse =
  | { readonly type: 'progress' | 'done'; readonly id: number; readonly result: EquityResult }
  | { readonly type: 'cancelled'; readonly id: number };

/**
 * Message handler for the equity worker. Only the latest request runs: a new `compute` or a
 * matching `cancel` abandons the previous one between Monte Carlo chunks.
 */
export function createEquityHandler(
  post: (message: EquityWorkerResponse) => void,
  rng: Rng,
  yieldControl: () => Promise<void> = () =>
    new Promise((resolve) => {
      setTimeout(resolve, 0);
    }),
): (message: EquityWorkerRequest) => Promise<void> {
  let activeId: number | null = null;
  return async (message) => {
    if (message.type === 'cancel') {
      if (activeId === message.id) activeId = null;
      return;
    }
    const { id } = message;
    activeId = id;
    const result = await runEquity(message, rng, {
      onProgress: (r) => {
        if (activeId === id) post({ type: 'progress', id, result: r });
      },
      isCancelled: () => activeId !== id,
      yieldControl,
    });
    if (result && activeId === id) {
      activeId = null;
      post({ type: 'done', id, result });
    } else {
      post({ type: 'cancelled', id });
    }
  };
}

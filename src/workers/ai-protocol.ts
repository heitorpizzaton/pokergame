import type { StyleId } from '../ai/index.ts';
import type { PlayerAction, PlayerView } from '../core/view/index.ts';

export type AiWorkerRequest =
  | { readonly type: 'init'; readonly seats: readonly { seat: number; style: StyleId }[] }
  | {
      readonly type: 'decide';
      readonly id: number;
      readonly seat: number;
      readonly view: PlayerView;
    }
  | { readonly type: 'observe'; readonly views: readonly PlayerView[] };

export interface AiWorkerResponse {
  readonly type: 'decision';
  readonly id: number;
  readonly action: PlayerAction;
}

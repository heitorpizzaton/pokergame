import type { TableEffect } from '../../app/game-controller.ts';

/** Sound effects (AGENTS.md §11.5), all synthesized at runtime: no audio files. */
export type SoundCue =
  | 'deal'
  | 'flip'
  | 'bet'
  | 'collect'
  | 'check'
  | 'fold'
  | 'allIn'
  | 'win'
  | 'timerWarning'
  | 'yourTurn';

/** Vibration patterns in ms (AGENTS.md §11.5: your turn, timer warning, pot won). */
export const HAPTIC_PATTERNS = {
  yourTurn: [25],
  timerWarning: [80],
  potWon: [40, 60, 40],
} as const satisfies Record<string, readonly number[]>;

export type HapticCue = keyof typeof HAPTIC_PATTERNS;

/** Maps a table effect to its sound and haptic cues. */
export function cuesFor(effect: TableEffect): { sound: SoundCue; haptic: HapticCue | null } {
  switch (effect.kind) {
    case 'deal':
    case 'flip':
    case 'bet':
    case 'allIn':
    case 'check':
    case 'fold':
    case 'collect':
      return { sound: effect.kind, haptic: null };
    case 'win':
      return { sound: 'win', haptic: effect.user ? 'potWon' : null };
    case 'yourTurn':
      return { sound: 'yourTurn', haptic: 'yourTurn' };
  }
}

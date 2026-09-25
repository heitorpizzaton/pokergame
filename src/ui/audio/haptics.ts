import { type HapticCue, HAPTIC_PATTERNS } from './cues.ts';

/** Vibrates when supported and enabled (AGENTS.md §11.5); a no-op elsewhere. */
export function vibrate(cue: HapticCue, enabled: boolean): void {
  if (!enabled || typeof navigator === 'undefined' || !('vibrate' in navigator)) return;
  try {
    navigator.vibrate([...HAPTIC_PATTERNS[cue]]);
  } catch {
    // Some browsers throw when vibration is blocked; haptics are optional.
  }
}

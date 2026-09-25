import { useEffect, useRef } from 'react';
import type { GameController } from '../../app/game-controller.ts';
import type { Settings } from '../../app/settings.ts';
import { cuesFor } from './cues.ts';
import { vibrate } from './haptics.ts';
import { SoundEngine } from './sound-engine.ts';

/** One engine for the whole app, so the unlocked audio context is reused between games. */
export const sound = new SoundEngine();

/** Plays sounds and haptics for the table's effects (AGENTS.md §11.5). */
export function useTableEffects(controller: GameController, settings: Settings): void {
  const haptics = useRef(settings.haptics);

  useEffect(() => {
    haptics.current = settings.haptics;
    sound.configure(settings.sound, settings.volume);
  }, [settings.haptics, settings.sound, settings.volume]);

  useEffect(() => {
    const unlock = () => {
      sound.unlock();
    };
    globalThis.addEventListener('pointerdown', unlock);
    globalThis.addEventListener('keydown', unlock);
    return () => {
      globalThis.removeEventListener('pointerdown', unlock);
      globalThis.removeEventListener('keydown', unlock);
    };
  }, []);

  useEffect(
    () =>
      controller.subscribeEffects((effect) => {
        const cues = cuesFor(effect);
        sound.play(cues.sound);
        if (cues.haptic) vibrate(cues.haptic, haptics.current);
      }),
    [controller],
  );
}

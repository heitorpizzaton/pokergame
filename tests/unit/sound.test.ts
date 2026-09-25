import { describe, expect, it } from 'vitest';
import type { TableEffect } from '../../src/app/game-controller.ts';
import { cuesFor, type SoundCue } from '../../src/ui/audio/cues.ts';
import { type AudioContextLike, SoundEngine } from '../../src/ui/audio/sound-engine.ts';

/** Minimal Web Audio fake that counts started sources. */
function fakeContext() {
  const param = () => ({
    value: 0,
    setValueAtTime: () => undefined,
    exponentialRampToValueAtTime: () => undefined,
  });
  const node = () => ({ connect: (n: unknown) => n });
  const stats = { started: 0, time: 0, state: 'running' as AudioContextState };
  const ctx = {
    get currentTime() {
      return stats.time;
    },
    get state() {
      return stats.state;
    },
    destination: {},
    sampleRate: 8000,
    resume: () => {
      stats.state = 'running';
      return Promise.resolve();
    },
    createGain: () => ({ ...node(), gain: param() }),
    createOscillator: () => ({
      ...node(),
      type: 'sine',
      frequency: param(),
      start: () => {
        stats.started++;
      },
      stop: () => undefined,
    }),
    createBufferSource: () => ({
      ...node(),
      buffer: null,
      start: () => {
        stats.started++;
      },
      stop: () => undefined,
    }),
    createBuffer: (_c: number, length: number) => {
      const data = new Float32Array(length);
      return { getChannelData: () => data };
    },
    createBiquadFilter: () => ({ ...node(), type: 'lowpass', frequency: param() }),
  };
  return { ctx: ctx as unknown as AudioContextLike, stats };
}

const ALL: SoundCue[] = [
  'deal',
  'flip',
  'bet',
  'collect',
  'check',
  'fold',
  'allIn',
  'win',
  'timerWarning',
  'yourTurn',
];

describe('synthesized sound (AGENTS.md §11.5)', () => {
  it('plays every cue with synthesized voices', () => {
    const { ctx, stats } = fakeContext();
    const engine = new SoundEngine(() => ctx);
    for (const cue of ALL) {
      stats.time += 1;
      expect(engine.play(cue)).toBe(true);
    }
    expect(stats.started).toBeGreaterThanOrEqual(ALL.length);
  });

  it('stays silent when muted or at zero volume, and drops rapid repeats', () => {
    const { ctx, stats } = fakeContext();
    const engine = new SoundEngine(() => ctx);
    engine.configure(false, 70);
    expect(engine.play('bet')).toBe(false);
    engine.configure(true, 0);
    expect(engine.play('bet')).toBe(false);
    engine.configure(true, 70);
    expect(engine.play('bet')).toBe(true);
    expect(engine.play('bet')).toBe(false);
    stats.time += 0.1;
    expect(engine.play('bet')).toBe(true);
  });

  it('waits for a user gesture to unlock a suspended context', () => {
    const { ctx, stats } = fakeContext();
    stats.state = 'suspended';
    const engine = new SoundEngine(() => ctx);
    expect(engine.play('deal')).toBe(false);
    engine.unlock();
    expect(engine.play('deal')).toBe(true);
  });

  it('maps effects to sounds and haptics (your turn, pot won)', () => {
    const effects: TableEffect[] = [
      { kind: 'yourTurn' },
      { kind: 'win', seats: [0], user: true },
      { kind: 'win', seats: [2], user: false },
      { kind: 'fold', seat: 1 },
    ];
    expect(effects.map(cuesFor)).toEqual([
      { sound: 'yourTurn', haptic: 'yourTurn' },
      { sound: 'win', haptic: 'potWon' },
      { sound: 'win', haptic: null },
      { sound: 'fold', haptic: null },
    ]);
  });
});

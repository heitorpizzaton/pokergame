import type { SoundCue } from './cues.ts';

/** The subset of the Web Audio API the engine uses (tests pass a fake). */
export type AudioContextLike = Pick<
  AudioContext,
  | 'currentTime'
  | 'destination'
  | 'sampleRate'
  | 'state'
  | 'resume'
  | 'createGain'
  | 'createOscillator'
  | 'createBufferSource'
  | 'createBuffer'
  | 'createBiquadFilter'
>;

/** Repeats of one cue closer than this are dropped (fast-forwarded play). */
const MIN_GAP_S = 0.035;

/**
 * Synthesized, original sound effects (AGENTS.md §11.5). The audio context is created lazily on
 * the first cue after a user gesture, as browsers require.
 */
export class SoundEngine {
  readonly #create: () => AudioContextLike | null;
  #ctx: AudioContextLike | null = null;
  #master: GainNode | null = null;
  #noise: AudioBuffer | null = null;
  #enabled = true;
  #volume = 0.7;
  readonly #lastPlayed = new Map<SoundCue, number>();

  constructor(create: () => AudioContextLike | null = defaultContext) {
    this.#create = create;
  }

  configure(enabled: boolean, volumePercent: number): void {
    this.#enabled = enabled;
    this.#volume = Math.max(0, Math.min(100, volumePercent)) / 100;
    if (this.#master && this.#ctx)
      this.#master.gain.setValueAtTime(this.#volume, this.#ctx.currentTime);
  }

  /** Call from a user gesture so later cues can play (autoplay policies). */
  unlock(): void {
    const ctx = this.#context();
    if (ctx?.state === 'suspended') void ctx.resume();
  }

  play(cue: SoundCue): boolean {
    if (!this.#enabled || this.#volume === 0) return false;
    const ctx = this.#context();
    if (ctx?.state !== 'running') return false;
    const now = ctx.currentTime;
    const last = this.#lastPlayed.get(cue);
    if (last !== undefined && now - last < MIN_GAP_S) return false;
    this.#lastPlayed.set(cue, now);
    VOICES[cue](this.#voice(ctx), now);
    return true;
  }

  #context(): AudioContextLike | null {
    if (this.#ctx) return this.#ctx;
    const ctx = this.#create();
    if (!ctx) return null;
    this.#ctx = ctx;
    this.#master = ctx.createGain();
    this.#master.gain.value = this.#volume;
    this.#master.connect(ctx.destination);
    return ctx;
  }

  #voice(ctx: AudioContextLike): Voice {
    const master = this.#master as GainNode;
    const noise = (this.#noise ??= whiteNoise(ctx));
    return {
      tone: (type, freq, start, duration, gain, endFreq) => {
        const osc = ctx.createOscillator();
        const env = ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, start);
        if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, start + duration);
        env.gain.setValueAtTime(0.0001, start);
        env.gain.exponentialRampToValueAtTime(gain, start + 0.005);
        env.gain.exponentialRampToValueAtTime(0.0001, start + duration);
        osc.connect(env).connect(master);
        osc.start(start);
        osc.stop(start + duration + 0.02);
      },
      noise: (filter, freq, start, duration, gain, endFreq) => {
        const src = ctx.createBufferSource();
        const biquad = ctx.createBiquadFilter();
        const env = ctx.createGain();
        src.buffer = noise;
        biquad.type = filter;
        biquad.frequency.setValueAtTime(freq, start);
        if (endFreq) biquad.frequency.exponentialRampToValueAtTime(endFreq, start + duration);
        env.gain.setValueAtTime(0.0001, start);
        env.gain.exponentialRampToValueAtTime(gain, start + 0.004);
        env.gain.exponentialRampToValueAtTime(0.0001, start + duration);
        src.connect(biquad).connect(env).connect(master);
        src.start(start);
        src.stop(start + duration + 0.02);
      },
    };
  }
}

interface Voice {
  tone(
    type: OscillatorType,
    freq: number,
    start: number,
    duration: number,
    gain: number,
    endFreq?: number,
  ): void;
  noise(
    filter: BiquadFilterType,
    freq: number,
    start: number,
    duration: number,
    gain: number,
    endFreq?: number,
  ): void;
}

function clink(v: Voice, t: number, gain = 0.25): void {
  v.tone('triangle', 2650, t, 0.08, gain);
  v.tone('sine', 3900, t + 0.004, 0.06, gain * 0.6);
}

const VOICES: Record<SoundCue, (v: Voice, t: number) => void> = {
  deal: (v, t) => {
    v.noise('highpass', 2500, t, 0.05, 0.35, 5000);
  },
  flip: (v, t) => {
    v.noise('bandpass', 1800, t, 0.07, 0.4, 900);
  },
  bet: (v, t) => {
    clink(v, t);
    clink(v, t + 0.05, 0.18);
  },
  collect: (v, t) => {
    for (let i = 0; i < 4; i++) clink(v, t + i * 0.035, 0.14);
  },
  check: (v, t) => {
    v.tone('sine', 160, t, 0.09, 0.5, 90);
    v.tone('sine', 160, t + 0.11, 0.09, 0.4, 90);
  },
  fold: (v, t) => {
    v.noise('bandpass', 700, t, 0.18, 0.3, 2400);
  },
  allIn: (v, t) => {
    v.noise('lowpass', 400, t, 0.35, 0.3, 3000);
    for (let i = 0; i < 6; i++) clink(v, t + 0.08 + i * 0.03, 0.15);
  },
  win: (v, t) => {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
      v.tone('sine', f, t + i * 0.09, 0.45, 0.22);
    });
  },
  timerWarning: (v, t) => {
    v.tone('sine', 880, t, 0.12, 0.25);
    v.tone('sine', 880, t + 0.18, 0.12, 0.25);
  },
  yourTurn: (v, t) => {
    v.tone('sine', 660, t, 0.18, 0.2);
    v.tone('sine', 990, t + 0.08, 0.25, 0.16);
  },
};

function whiteNoise(ctx: AudioContextLike): AudioBuffer {
  // Deterministic noise (a linear congruential sequence): it is a sound texture, not randomness
  // for gameplay, so it does not use the RNG module.
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.5), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let x = 0x2545f491;
  for (let i = 0; i < data.length; i++) {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    data[i] = x / 0x80000000 - 1;
  }
  return buffer;
}

function defaultContext(): AudioContextLike | null {
  try {
    return typeof AudioContext === 'undefined' ? null : new AudioContext();
  } catch {
    return null;
  }
}

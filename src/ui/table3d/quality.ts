/** Quality tiers (AGENTS.md §20.4) and the runtime frame-rate monitor (§20.3). */
import type { QualityTier } from '../table/renderer.ts';

export interface TierParams {
  readonly lod: 0 | 1 | 2;
  readonly pixelRatioCap: number;
  readonly shadows: boolean;
  readonly shadowMapSize: number;
  readonly antialias: boolean;
  /** Frames per second the tier must sustain. */
  readonly targetFps: number;
}

export const TIERS: Record<QualityTier, TierParams> = {
  high: {
    lod: 0,
    pixelRatioCap: 2,
    shadows: true,
    shadowMapSize: 2048,
    antialias: true,
    targetFps: 60,
  },
  medium: {
    lod: 1,
    pixelRatioCap: 1.5,
    shadows: true,
    shadowMapSize: 1024,
    antialias: false,
    targetFps: 45,
  },
  low: {
    lod: 2,
    pixelRatioCap: 1,
    shadows: false,
    shadowMapSize: 0,
    antialias: false,
    targetFps: 30,
  },
};

/** How long the frame rate must stay under target before the tier is lowered. */
export const DOWNGRADE_WINDOW_MS = 3_000;
/** A few frames of slack under the target (vsync jitter), so 58 fps passes at a 60 fps tier. */
const TOLERANCE = 0.9;

/**
 * Watches frame times while the scene animates. Reports a downgrade once the average frame rate
 * over the last `DOWNGRADE_WINDOW_MS` of continuous rendering stays under the tier's target.
 * Gaps (idle, on-demand rendering or a hidden tab) reset the window instead of counting as slow.
 */
export class FrameMonitor {
  readonly #targetFps: number;
  #windowStart: number | null = null;
  #last: number | null = null;
  #frames = 0;

  constructor(targetFps: number) {
    this.#targetFps = targetFps;
  }

  /** Records a frame at time `now` (ms). Returns true when the tier should be lowered. */
  frame(now: number): boolean {
    const last = this.#last;
    this.#last = now;
    if (last === null || now - last > 250) {
      this.#windowStart = now;
      this.#frames = 0;
      return false;
    }
    this.#frames++;
    const start = this.#windowStart ?? now;
    const elapsed = now - start;
    if (elapsed < DOWNGRADE_WINDOW_MS) return false;
    const fps = (this.#frames * 1000) / elapsed;
    this.#windowStart = now;
    this.#frames = 0;
    return fps < this.#targetFps * TOLERANCE;
  }

  /** Forgets the current window (after the tier changes or rendering pauses). */
  reset(): void {
    this.#windowStart = null;
    this.#last = null;
    this.#frames = 0;
  }
}

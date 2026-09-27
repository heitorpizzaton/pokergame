import { PerspectiveCamera, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, loadSettings } from '../../src/app/settings.ts';
import { chooseRenderer, lowerTier } from '../../src/ui/table/renderer.ts';
import {
  ANCHOR_COUNT,
  anchorForSlot,
  chairAnchor,
  hudAnchor,
  playerCamera,
  projectPoint,
} from '../../src/ui/table3d/anchors.ts';
import { LOOKS, lookFromLocation } from '../../src/ui/table3d/looks.ts';
import { DOWNGRADE_WINDOW_MS, FrameMonitor, TIERS } from '../../src/ui/table3d/quality.ts';

const gpu = (renderer: string, tier: number | null, webgl2 = true) => ({ webgl2, renderer, tier });

describe('renderer choice (AGENTS.md §20.3)', () => {
  it('defaults to Automático and persists the setting', () => {
    expect(DEFAULT_SETTINGS.graphics).toBe('auto');
    const stored = { getItem: () => JSON.stringify({ graphics: 'low' }) };
    expect(loadSettings(stored).graphics).toBe('low');
    const invalid = { getItem: () => JSON.stringify({ graphics: 'ultra' }) };
    expect(loadSettings(invalid).graphics).toBe('auto');
  });

  it('maps detect-gpu tiers to quality tiers in Automático', () => {
    expect(chooseRenderer('auto', gpu('adreno (tm) 740', 3))).toEqual({ kind: '3d', tier: 'high' });
    expect(chooseRenderer('auto', gpu('mali-g57', 2))).toEqual({ kind: '3d', tier: 'medium' });
    expect(chooseRenderer('auto', gpu('adreno (tm) 506', 1))).toEqual({ kind: '3d', tier: 'low' });
    expect(chooseRenderer('auto', gpu('powervr', 0))).toEqual({ kind: '2d' });
    // An unknown GPU starts low; the runtime monitor can only lower it further.
    expect(chooseRenderer('auto', gpu('some gpu', null))).toEqual({ kind: '3d', tier: 'low' });
  });

  it('falls back to 2D without WebGL2 or on software rendering', () => {
    expect(chooseRenderer('auto', gpu('', null, false))).toEqual({ kind: '2d' });
    expect(chooseRenderer('high', gpu('', null, false))).toEqual({ kind: '2d' });
    const swiftshader = 'angle (google, vulkan 1.3.0 (swiftshader device (subzero)))';
    expect(chooseRenderer('auto', gpu(swiftshader, 3))).toEqual({ kind: '2d' });
    expect(chooseRenderer('auto', gpu('llvmpipe (llvm 15.0.7, 256 bits)', 1))).toEqual({
      kind: '2d',
    });
  });

  it('honours an explicit tier and 2D clássico', () => {
    expect(chooseRenderer('medium', gpu('swiftshader', 0))).toEqual({ kind: '3d', tier: 'medium' });
    expect(chooseRenderer('2d', gpu('adreno', 3))).toEqual({ kind: '2d' });
  });

  it('lowers tiers one step at a time and never below Baixa', () => {
    expect(lowerTier('high')).toBe('medium');
    expect(lowerTier('medium')).toBe('low');
    expect(lowerTier('low')).toBeNull();
  });
});

describe('frame monitor (AGENTS.md §20.3)', () => {
  const run = (monitor: FrameMonitor, fps: number, ms: number, start = 0): boolean => {
    let dropped = false;
    for (let t = start; t <= start + ms; t += 1000 / fps) dropped = monitor.frame(t) || dropped;
    return dropped;
  };

  it('asks for a downgrade after 3 s under target, not before', () => {
    const m = new FrameMonitor(TIERS.medium.targetFps);
    expect(run(m, 30, DOWNGRADE_WINDOW_MS - 200)).toBe(false);
    expect(run(new FrameMonitor(45), 30, DOWNGRADE_WINDOW_MS + 100)).toBe(true);
  });

  it('keeps the tier at or near its target frame rate', () => {
    expect(run(new FrameMonitor(60), 60, 10_000)).toBe(false);
    expect(run(new FrameMonitor(60), 57, 10_000)).toBe(false);
    expect(run(new FrameMonitor(30), 31, 10_000)).toBe(false);
  });

  it('treats pauses in rendering as a new window, not as slow frames', () => {
    const m = new FrameMonitor(60);
    // 2 s at 60 fps, a 5 s idle gap, then 2 s at 60 fps: never a downgrade.
    expect(run(m, 60, 2000)).toBe(false);
    expect(run(m, 60, 2000, 7000)).toBe(false);
  });
});

describe('table anchors and framing (AGENTS.md §20.2, §25.3)', () => {
  it('gives every seat its own anchor at every table size, with the user at anchor 0', () => {
    for (let count = 2; count <= 9; count++) {
      const anchors = Array.from({ length: count }, (_, slot) => anchorForSlot(slot, count));
      expect(new Set(anchors).size).toBe(count);
      expect(anchors[0]).toBe(0);
      for (const a of anchors) expect(a).toBeLessThan(ANCHOR_COUNT);
    }
  });

  it('seats clockwise: left of the user, then across, then right', () => {
    for (const o of ['portrait', 'landscape'] as const) {
      const left = hudAnchor(2, o);
      const far = hudAnchor(4, o);
      const right = hudAnchor(7, o);
      expect(left.x).toBeLessThan(0);
      expect(far.z).toBeLessThan(0);
      expect(right.x).toBeGreaterThan(0);
      expect(hudAnchor(0, o).z).toBeGreaterThan(0);
    }
  });

  it('turns every chair to face the table centre', () => {
    for (let a = 0; a < ANCHOR_COUNT; a++) {
      const { position, facing } = chairAnchor(a, 'landscape');
      // A model facing +z rotated by `facing` looks along (sin, cos).
      const look = { x: Math.sin(facing), z: Math.cos(facing) };
      const toCentre = { x: -position.x, z: -position.z };
      const dot = (look.x * toCentre.x + look.z * toCentre.z) / Math.hypot(toCentre.x, toCentre.z);
      expect(dot).toBeCloseTo(1, 6);
    }
  });

  it('projects exactly like a three.js perspective camera', () => {
    const framing = playerCamera('portrait', 0.9);
    const camera = new PerspectiveCamera(framing.fov, 0.9, 0.1, 50);
    camera.position.set(framing.position.x, framing.position.y, framing.position.z);
    camera.lookAt(framing.target.x, framing.target.y, framing.target.z);
    camera.updateMatrixWorld();
    for (let a = 0; a < ANCHOR_COUNT; a++) {
      const p = hudAnchor(a, 'portrait');
      const expected = new Vector3(p.x, p.y, p.z).project(camera);
      const got = projectPoint(framing, 0.9, p);
      expect(got.x).toBeCloseTo(expected.x, 6);
      expect(got.y).toBeCloseTo(expected.y, 6);
    }
  });

  it('keeps every seat label on screen from 360×640 portrait to wide desktop', () => {
    const cases = [
      ['portrait', 328 / 420],
      ['portrait', 1],
      ['portrait', 0.6],
      ['landscape', 1440 / 640],
      ['landscape', 1.4],
    ] as const;
    for (const [orientation, aspect] of cases) {
      const framing = playerCamera(orientation, aspect);
      for (let a = 0; a < ANCHOR_COUNT; a++) {
        const q = projectPoint(framing, aspect, hudAnchor(a, orientation));
        expect(Math.abs(q.x)).toBeLessThanOrEqual(0.9001);
        expect(Math.abs(q.y)).toBeLessThanOrEqual(0.9001);
      }
    }
  });
});

describe('looks', () => {
  it('offers three looks selected by ?look=', () => {
    expect(Object.keys(LOOKS)).toEqual(['a', 'b', 'c']);
    expect(lookFromLocation('?look=b').id).toBe('b');
    expect(lookFromLocation('?look=c&seed=3').id).toBe('c');
    expect(lookFromLocation('').id).toBe('a');
    expect(lookFromLocation('?look=z').id).toBe('a');
  });
});

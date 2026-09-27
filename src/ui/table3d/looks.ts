/**
 * Three lighting and grading "looks" for the owner to choose from in Phase V2 (AGENTS.md §28).
 * The preview picks one with `?look=a|b|c`; the chosen look becomes the only one in Phase V3.
 */
export type LookId = 'a' | 'b' | 'c';

export interface Look {
  readonly id: LookId;
  readonly toneMapping: 'aces' | 'agx';
  readonly exposure: number;
  readonly background: string;
  readonly fog: { readonly color: string; readonly near: number; readonly far: number };
  readonly ambient: { readonly color: string; readonly intensity: number };
  readonly hemisphere: {
    readonly sky: string;
    readonly ground: string;
    readonly intensity: number;
  };
  readonly key: {
    readonly color: string;
    readonly intensity: number;
    /** Spot cone half-angle in radians. */
    readonly angle: number;
    readonly penumbra: number;
  };
  readonly rim: { readonly color: string; readonly intensity: number };
  readonly felt: string;
  readonly rail: string;
  readonly floor: string;
}

export const LOOKS: Record<LookId, Look> = {
  // "Clássico quente": warm pendant light, soft falloff, classic card-room brown.
  a: {
    id: 'a',
    toneMapping: 'aces',
    exposure: 1.05,
    background: '#1a100b',
    fog: { color: '#1a100b', near: 4.5, far: 11 },
    ambient: { color: '#ffe2c4', intensity: 0.18 },
    hemisphere: { sky: '#ffd9b0', ground: '#2a1a10', intensity: 0.35 },
    key: { color: '#ffd29a', intensity: 38, angle: 0.72, penumbra: 0.65 },
    rim: { color: '#ffb877', intensity: 0.5 },
    felt: '#0f5a47',
    rail: '#3b2418',
    floor: '#24160f',
  },
  // "Noir": a tight, contrasty cone of light over the felt; the room falls into darkness.
  b: {
    id: 'b',
    toneMapping: 'agx',
    exposure: 1.2,
    background: '#07080c',
    fog: { color: '#07080c', near: 3.5, far: 8 },
    ambient: { color: '#9fb4ff', intensity: 0.06 },
    hemisphere: { sky: '#c9d4ff', ground: '#050608', intensity: 0.12 },
    key: { color: '#fff1dc', intensity: 55, angle: 0.55, penumbra: 0.35 },
    rim: { color: '#7d9cff', intensity: 0.9 },
    felt: '#0b4a3c',
    rail: '#1c1714',
    floor: '#0d0d10',
  },
  // "Esmeralda moderna": brighter and cleaner, cool teal ambience and a neutral key light.
  c: {
    id: 'c',
    toneMapping: 'agx',
    exposure: 1.45,
    background: '#0b1f22',
    fog: { color: '#0b1f22', near: 5, far: 13 },
    ambient: { color: '#bfeee6', intensity: 0.3 },
    hemisphere: { sky: '#d8fff6', ground: '#10302c', intensity: 0.55 },
    key: { color: '#fff8ee', intensity: 30, angle: 0.85, penumbra: 0.8 },
    rim: { color: '#6fe0c8', intensity: 0.6 },
    felt: '#117a5e',
    rail: '#2b2622',
    floor: '#112a2b',
  },
};

export function lookFromLocation(search: string): Look {
  const id = new URLSearchParams(search).get('look');
  return id === 'b' || id === 'c' ? LOOKS[id] : LOOKS.a;
}

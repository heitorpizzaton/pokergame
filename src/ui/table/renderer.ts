/**
 * Table renderer contract (AGENTS.md §20.2). Both renderers draw the same public table state:
 * the controller's TableSnapshot, which is built from the engine's events and PlayerView. They
 * output nothing but visuals. The DOM HUD (seats, bets, pot, board, banners, action bar, odds
 * panel) is shared and is positioned from the renderer's layout: fixed percentages for the 2D
 * table, projected 3D anchor points for the 3D table.
 */
import type { TableSnapshot } from '../../app/game-controller.ts';
import type { GraphicsSetting } from '../../app/settings.ts';

export interface SeatPosition {
  /** Percent of the table area's width. */
  readonly x: number;
  /** Percent of the table area's height. */
  readonly y: number;
}

/** Where the DOM HUD draws each visual slot (0 = the user) and the table centre. */
export interface TableLayout {
  readonly seats: readonly SeatPosition[];
  readonly center: SeatPosition;
}

export type QualityTier = 'high' | 'medium' | 'low';
export type Orientation = 'portrait' | 'landscape';

/** Props every renderer's stage receives. */
export interface TableStageProps {
  readonly snapshot: TableSnapshot;
  readonly orientation: Orientation;
  readonly tier: QualityTier;
  readonly reducedMotion: boolean;
  /** Called whenever the projected positions of the HUD anchors change. */
  readonly onLayout: (layout: TableLayout) => void;
  /** Called when the runtime monitor lowers the quality tier (AGENTS.md §20.3). */
  readonly onTierDrop: (tier: QualityTier) => void;
  /** Called when WebGL cannot run at all, so the table falls back to 2D. */
  readonly onFailure: () => void;
}

/** What the GPU probe found out about the device. */
export interface GpuProbe {
  readonly webgl2: boolean;
  /** The unmasked renderer string, lowercased, or '' when unavailable. */
  readonly renderer: string;
  /** detect-gpu tier (0–3), or null when unknown. */
  readonly tier: number | null;
}

export type RendererChoice =
  { readonly kind: '2d' } | { readonly kind: '3d'; readonly tier: QualityTier };

const SOFTWARE_RENDERERS = ['swiftshader', 'llvmpipe', 'software', 'softpipe', 'basic render'];

export function isSoftwareRenderer(renderer: string): boolean {
  return SOFTWARE_RENDERERS.some((name) => renderer.includes(name));
}

/**
 * The renderer for a graphics setting (AGENTS.md §20.3): without WebGL2 the table is always 2D.
 * `Automático` also falls back to 2D on software rendering or detect-gpu tier 0, and otherwise
 * maps tiers 1/2/3 to Baixa/Média/Alta. An explicit tier is honoured whenever WebGL2 exists.
 */
export function chooseRenderer(setting: GraphicsSetting, probe: GpuProbe): RendererChoice {
  if (setting === '2d' || !probe.webgl2) return { kind: '2d' };
  if (setting !== 'auto') return { kind: '3d', tier: setting };
  if (isSoftwareRenderer(probe.renderer)) return { kind: '2d' };
  const tier = probe.tier ?? 1;
  if (tier <= 0) return { kind: '2d' };
  return { kind: '3d', tier: tier >= 3 ? 'high' : tier === 2 ? 'medium' : 'low' };
}

export function lowerTier(tier: QualityTier): QualityTier | null {
  return tier === 'high' ? 'medium' : tier === 'medium' ? 'low' : null;
}

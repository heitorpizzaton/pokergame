/**
 * The 3D table's geometry: nine chair anchors around an oval table and the camera framing for
 * each orientation (AGENTS.md §25.3). Units are metres; y is up. The user always sits at the
 * anchor nearest the camera (+z); the other seats follow clockwise, which from the user's view
 * is left → far → right, the same order as the 2D table.
 */
export const ANCHOR_COUNT = 9;

export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface TableShape {
  /** Semi-axis across the screen (x). */
  readonly halfWidth: number;
  /** Semi-axis in depth (z). */
  readonly halfDepth: number;
}

/**
 * A 9-max table is about 2.4 × 1.3 m. In portrait the user sits at one short end so the table's
 * length runs into the screen; in landscape the user sits at the middle of a long side.
 */
export function tableShape(orientation: 'portrait' | 'landscape'): TableShape {
  return orientation === 'portrait'
    ? { halfWidth: 0.68, halfDepth: 1.15 }
    : { halfWidth: 1.2, halfDepth: 0.66 };
}

export const TABLE_HEIGHT = 0.76;
/** Chairs sit this far outside the rail. */
const CHAIR_OFFSET = 0.42;

/** Angle of an anchor around the table: anchor 0 is nearest the camera, then clockwise. */
function anchorAngle(anchor: number): number {
  return Math.PI / 2 + (anchor * 2 * Math.PI) / ANCHOR_COUNT;
}

/** Point on the rail's ellipse at `angle`, pushed `offset` metres outwards along the normal. */
function ellipsePoint(shape: TableShape, angle: number, offset: number): { x: number; z: number } {
  const x = shape.halfWidth * Math.cos(angle);
  const z = shape.halfDepth * Math.sin(angle);
  const nx = Math.cos(angle) / shape.halfWidth;
  const nz = Math.sin(angle) / shape.halfDepth;
  const n = Math.hypot(nx, nz);
  return { x: x + (offset * nx) / n, z: z + (offset * nz) / n };
}

/**
 * Where a chair stands (on the floor) and its rotation about +y that turns a model facing +z
 * (the characters' export orientation) towards the table centre.
 */
export function chairAnchor(
  anchor: number,
  orientation: 'portrait' | 'landscape',
): { position: Vec3; facing: number } {
  const shape = tableShape(orientation);
  const p = ellipsePoint(shape, anchorAngle(anchor), CHAIR_OFFSET);
  const facing = Math.atan2(-p.x, -p.z);
  return { position: { x: p.x, y: 0, z: p.z }, facing };
}

/** HUD anchor for a seat label: just inside the rail in front of the chair, at rail height. */
export function hudAnchor(anchor: number, orientation: 'portrait' | 'landscape'): Vec3 {
  const shape = tableShape(orientation);
  const p = ellipsePoint(shape, anchorAngle(anchor), anchor === 0 ? -0.05 : 0.12);
  return { x: p.x, y: TABLE_HEIGHT + (anchor === 0 ? 0 : 0.3), z: p.z };
}

/** The anchor used by visual slot `slot` at a table of `count` players (evenly spread). */
export function anchorForSlot(slot: number, count: number): number {
  return Math.round((slot * ANCHOR_COUNT) / count) % ANCHOR_COUNT;
}

export interface CameraFraming {
  readonly position: Vec3;
  readonly target: Vec3;
  /** Vertical field of view in degrees. */
  readonly fov: number;
}

/** Top of a seated character's head, for framing. */
const HEAD_HEIGHT = 1.28;

type Projector = (framing: CameraFraming, aspect: number, point: Vec3) => { x: number; y: number };

/** Pinhole projection to normalized device coordinates (x right, y up, both in [-1, 1]). */
export const projectPoint: Projector = (framing, aspect, point) => {
  const { position: c, target: t } = framing;
  // Camera basis: forward f, right r, up u.
  let fx = t.x - c.x;
  let fy = t.y - c.y;
  let fz = t.z - c.z;
  const fl = Math.hypot(fx, fy, fz);
  fx /= fl;
  fy /= fl;
  fz /= fl;
  // right = forward × worldUp(0,1,0)
  let rx = -fz;
  let rz = fx;
  const rl = Math.hypot(rx, rz);
  rx /= rl;
  rz /= rl;
  // up = right × forward
  const ux = -rz * fy;
  const uy = rz * fx - rx * fz;
  const uz = rx * fy;
  const dx = point.x - c.x;
  const dy = point.y - c.y;
  const dz = point.z - c.z;
  const depth = dx * fx + dy * fy + dz * fz;
  const k = 1 / Math.tan((framing.fov * Math.PI) / 360);
  return {
    x: ((dx * rx + dz * rz) * k) / (depth * aspect),
    y: ((dx * ux + dy * uy + dz * uz) * k) / depth,
  };
};

/**
 * The "Jogador" camera (AGENTS.md §25.3): behind the user's seat, looking across the table.
 * Portrait uses a higher, steeper angle. The distance is solved so that every seat label and
 * every seated player's head fits the screen, for any aspect ratio (360×640 included).
 */
export function playerCamera(orientation: 'portrait' | 'landscape', aspect: number): CameraFraming {
  const portrait = orientation === 'portrait';
  const elevation = ((portrait ? 56 : 34) * Math.PI) / 180;
  const fov = portrait ? 50 : 40;
  const target: Vec3 = { x: 0, y: TABLE_HEIGHT, z: portrait ? -0.12 : -0.08 };
  // The user's label and hole cards need room above the odds pill and the action bar.
  const points: { p: Vec3; bottom: number }[] = [];
  for (let a = 0; a < ANCHOR_COUNT; a++) {
    points.push({ p: hudAnchor(a, orientation), bottom: a === 0 ? -0.7 : -0.88 });
    if (a !== 0) {
      const { position } = chairAnchor(a, orientation);
      points.push({ p: { x: position.x, y: HEAD_HEIGHT, z: position.z }, bottom: -0.88 });
    }
  }
  const framingAt = (distance: number): CameraFraming => ({
    position: {
      x: 0,
      y: target.y + distance * Math.sin(elevation),
      z: target.z + distance * Math.cos(elevation),
    },
    target,
    fov,
  });
  const fits = (framing: CameraFraming) =>
    points.every(({ p, bottom }) => {
      const q = projectPoint(framing, aspect, p);
      return Math.abs(q.x) <= 0.9 && q.y <= 0.9 && q.y >= bottom;
    });
  let lo = 1.5;
  let hi = 14;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    if (fits(framingAt(mid))) hi = mid;
    else lo = mid;
  }
  return framingAt(hi);
}

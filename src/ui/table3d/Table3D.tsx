/**
 * The 3D table renderer (AGENTS.md §20). Phase V2 is a graybox spike: an oval table, nine chair
 * anchors, one generated character reused per seat with a procedural idle, both camera framings,
 * the three candidate looks, quality tiers with auto-downgrade and on-demand idle rendering.
 * The DOM HUD is drawn by TableLayer from the anchor positions this component projects.
 */
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Component, type ReactNode, Suspense, useEffect, useMemo, useRef } from 'react';
import {
  ACESFilmicToneMapping,
  AgXToneMapping,
  Color,
  Fog,
  type PerspectiveCamera,
  SRGBColorSpace,
  Vector3,
  type WebGLRenderer,
} from 'three';
import type { TableSnapshot } from '../../app/game-controller.ts';
import styles from '../screens/TableScreen.module.css';
import { visualSlot } from '../table/hud-layout.ts';
import {
  lowerTier,
  type QualityTier,
  type TableLayout,
  type TableStageProps,
} from '../table/renderer.ts';
import {
  ANCHOR_COUNT,
  anchorForSlot,
  chairAnchor,
  hudAnchor,
  playerCamera,
  TABLE_HEIGHT,
  tableShape,
} from './anchors.ts';
import { Character, type Outfit } from './Character.tsx';
import { type Look, lookFromLocation } from './looks.ts';
import { FrameMonitor, TIERS } from './quality.ts';

/** Idle micro-motion renders at this rate to save battery (AGENTS.md §20.3). */
const IDLE_FPS = 20;
/** The spike ships one character; outfits vary per seat until the Phase V4 roster. */
const CHARACTER_ID = 'c01';
const OUTFITS: readonly Outfit[] = [
  { skin: '#9a6a4f', hair: '#1e1712', top: '#2f3b4c', bottom: '#23252b' },
  { skin: '#c89478', hair: '#3a2a1c', top: '#5b2b2b', bottom: '#1f2226' },
  { skin: '#6e4633', hair: '#0f0c0a', top: '#d8d2c4', bottom: '#2a2d33' },
  { skin: '#e0b59a', hair: '#6b5a48', top: '#2e4a3a', bottom: '#1b1c20' },
  { skin: '#b07a5a', hair: '#231a14', top: '#1d1f24', bottom: '#34302b' },
  { skin: '#8a5a40', hair: '#141010', top: '#6a5a8a', bottom: '#202227' },
  { skin: '#d7a384', hair: '#2b1f16', top: '#8a6b3a', bottom: '#1e2025' },
  { skin: '#5a3a2a', hair: '#0c0a09', top: '#3a4f6b', bottom: '#26282d' },
  { skin: '#f0c7aa', hair: '#8a6e4e', top: '#40403f', bottom: '#1a1b1f' },
];

class WebGlBoundary extends Component<{ onError: () => void; children: ReactNode }> {
  override state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  override componentDidCatch(): void {
    this.props.onError();
  }

  override render(): ReactNode {
    return this.state.failed ? null : this.props.children;
  }
}

export default function Table3D(props: TableStageProps) {
  const params = TIERS[props.tier];
  const look = useMemo(() => lookFromLocation(window.location.search), []);
  const { onFailure } = props;
  return (
    <div className={styles.stage3d} data-testid="table3d" data-tier={props.tier} aria-hidden="true">
      <WebGlBoundary onError={onFailure}>
        <Canvas
          // A new context per tier: antialiasing cannot change on a live context.
          key={props.tier}
          frameloop="demand"
          dpr={[1, params.pixelRatioCap]}
          shadows={params.shadows ? 'soft' : false}
          gl={{ antialias: params.antialias, powerPreference: 'high-performance' }}
          camera={{ near: 0.1, far: 40 }}
          onCreated={({ gl }) => {
            setupRenderer(gl, look);
            gl.domElement.addEventListener('webglcontextlost', onFailure, { once: true });
            // The e2e build exposes render statistics (draw calls, triangles) to the tests.
            if (import.meta.env.MODE === 'e2e') {
              (window as unknown as { mesaViva3d?: WebGLRenderer }).mesaViva3d = gl;
            }
          }}
        >
          <Scene {...props} look={look} />
        </Canvas>
      </WebGlBoundary>
    </div>
  );
}

function setupRenderer(gl: WebGLRenderer, look: Look): void {
  gl.outputColorSpace = SRGBColorSpace;
  gl.toneMapping = look.toneMapping === 'aces' ? ACESFilmicToneMapping : AgXToneMapping;
  gl.toneMappingExposure = look.exposure;
}

function Scene(props: TableStageProps & { readonly look: Look }) {
  const { snapshot, orientation, tier, look, reducedMotion } = props;
  const params = TIERS[tier];
  const { view, userSeat } = snapshot;
  const count = view.seats.length;
  const shape = tableShape(orientation);

  // Which anchor each visual slot uses, and who sits there.
  const occupants = useMemo(() => {
    const byAnchor = new Map<number, { seat: number; slot: number }>();
    for (const seat of view.seats) {
      const slot = visualSlot(seat.seat, userSeat, count);
      byAnchor.set(anchorForSlot(slot, count), { seat: seat.seat, slot });
    }
    return byAnchor;
  }, [view.seats, userSeat, count]);

  const acting = view.toAct;
  const actingAnchor =
    acting === null ? null : anchorForSlot(visualSlot(acting, userSeat, count), count);
  const lookTarget = useMemo(() => {
    if (actingAnchor === null) return null;
    const a = hudAnchor(actingAnchor, orientation);
    return new Vector3(a.x, TABLE_HEIGHT + 0.35, a.z);
  }, [actingAnchor, orientation]);

  return (
    <>
      <color attach="background" args={[look.background]} />
      <SceneFog look={look} />
      <CameraRig orientation={orientation} />
      <RenderDriver snapshot={snapshot} tier={tier} onTierDrop={props.onTierDrop} />
      <HudProjector count={count} orientation={orientation} onLayout={props.onLayout} />

      <ambientLight color={look.ambient.color} intensity={look.ambient.intensity} />
      <hemisphereLight
        args={[look.hemisphere.sky, look.hemisphere.ground, look.hemisphere.intensity]}
      />
      <KeyLight look={look} shadows={params.shadows} mapSize={params.shadowMapSize} />
      <directionalLight
        position={[-3, 2.5, -3]}
        color={look.rim.color}
        intensity={look.rim.intensity}
      />

      {/* Floor */}
      <mesh rotation-x={-Math.PI / 2} receiveShadow={params.shadows}>
        <circleGeometry args={[9, 48]} />
        <meshStandardMaterial color={look.floor} roughness={0.95} />
      </mesh>

      {/* Table: felt, rail and pedestal (graybox). */}
      <group>
        <mesh
          position-y={TABLE_HEIGHT - 0.02}
          scale={[shape.halfWidth, 1, shape.halfDepth]}
          receiveShadow={params.shadows}
        >
          <cylinderGeometry args={[1, 1, 0.04, 64]} />
          <meshStandardMaterial color={look.felt} roughness={0.92} />
        </mesh>
        <mesh
          position-y={TABLE_HEIGHT + 0.01}
          rotation-x={Math.PI / 2}
          scale={[shape.halfWidth + 0.04, shape.halfDepth + 0.04, 1]}
          castShadow={params.shadows}
          receiveShadow={params.shadows}
        >
          <torusGeometry args={[1, 0.055, 12, 72]} />
          <meshStandardMaterial color={look.rail} roughness={0.55} />
        </mesh>
        <mesh position-y={TABLE_HEIGHT / 2 - 0.05}>
          <cylinderGeometry args={[0.18, 0.28, TABLE_HEIGHT - 0.1, 24]} />
          <meshStandardMaterial color="#141110" roughness={0.7} />
        </mesh>
      </group>

      {Array.from({ length: ANCHOR_COUNT }, (_, anchor) => {
        const { position, facing } = chairAnchor(anchor, orientation);
        const occupant = occupants.get(anchor);
        const seated =
          occupant !== undefined &&
          occupant.slot !== 0 &&
          view.seats[occupant.seat]?.status !== 'eliminated';
        return (
          <group key={anchor} position={[position.x, 0, position.z]} rotation-y={facing}>
            {anchor !== 0 && <Chair shadows={params.shadows} />}
            {seated && (
              <Suspense fallback={<Placeholder />}>
                <group position={[0, -0.36, -0.1]}>
                  <Character
                    id={CHARACTER_ID}
                    lod={params.lod}
                    outfit={OUTFITS[occupant.seat % OUTFITS.length] as Outfit}
                    seed={occupant.seat + 1}
                    lookAt={acting !== null && acting !== occupant.seat ? lookTarget : null}
                    shadows={params.shadows}
                    reducedMotion={reducedMotion}
                  />
                </group>
              </Suspense>
            )}
          </group>
        );
      })}
    </>
  );
}

function SceneFog({ look }: { readonly look: Look }) {
  const scene = useThree((s) => s.scene);
  useEffect(() => {
    scene.fog = new Fog(new Color(look.fog.color), look.fog.near, look.fog.far);
    return () => {
      scene.fog = null;
    };
  }, [scene, look]);
  return null;
}

function KeyLight({
  look,
  shadows,
  mapSize,
}: {
  readonly look: Look;
  readonly shadows: boolean;
  readonly mapSize: number;
}) {
  return (
    <spotLight
      position={[0, 3.1, 0.2]}
      color={look.key.color}
      intensity={look.key.intensity}
      angle={look.key.angle}
      penumbra={look.key.penumbra}
      decay={2}
      distance={9}
      castShadow={shadows}
      shadow-mapSize-width={mapSize || 512}
      shadow-mapSize-height={mapSize || 512}
      shadow-bias={-0.0004}
      shadow-radius={4}
    />
  );
}

function Chair({ shadows }: { readonly shadows: boolean }) {
  return (
    <group position={[0, 0, 0.12]}>
      <mesh position-y={0.44} castShadow={shadows} receiveShadow={shadows}>
        <boxGeometry args={[0.46, 0.08, 0.44]} />
        <meshStandardMaterial color="#2b1d15" roughness={0.6} />
      </mesh>
      <mesh position={[0, 0.78, 0.2]} castShadow={shadows}>
        <boxGeometry args={[0.46, 0.62, 0.07]} />
        <meshStandardMaterial color="#2b1d15" roughness={0.6} />
      </mesh>
      <mesh position-y={0.2}>
        <cylinderGeometry args={[0.03, 0.05, 0.4, 10]} />
        <meshStandardMaterial color="#111" roughness={0.4} metalness={0.6} />
      </mesh>
    </group>
  );
}

/** Stand-in while the character downloads (progressive loading, AGENTS.md §26). */
function Placeholder() {
  return (
    <mesh position={[0, 0.95, 0.05]}>
      <capsuleGeometry args={[0.2, 0.5, 4, 12]} />
      <meshStandardMaterial color="#3a3f47" roughness={0.8} />
    </mesh>
  );
}

function CameraRig({ orientation }: { readonly orientation: 'portrait' | 'landscape' }) {
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const size = useThree((s) => s.size);
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    const framing = playerCamera(orientation, size.width / Math.max(1, size.height));
    camera.fov = framing.fov;
    camera.position.set(framing.position.x, framing.position.y, framing.position.z);
    camera.lookAt(framing.target.x, framing.target.y, framing.target.z);
    camera.updateProjectionMatrix();
    invalidate();
  }, [camera, orientation, size.width, size.height, invalidate]);
  return null;
}

/**
 * Projects the HUD anchors to table-area percentages in one batched pass per rendered frame,
 * reporting only when something moved (the camera is static in the "Jogador" framing).
 */
function HudProjector({
  count,
  orientation,
  onLayout,
}: {
  readonly count: number;
  readonly orientation: 'portrait' | 'landscape';
  readonly onLayout: (layout: TableLayout) => void;
}) {
  const last = useRef('');
  const v = useMemo(() => new Vector3(), []);
  useFrame(({ camera }) => {
    const project = (p: { x: number; y: number; z: number }) => {
      v.set(p.x, p.y, p.z).project(camera);
      return { x: ((v.x + 1) / 2) * 100, y: ((1 - v.y) / 2) * 100 };
    };
    const seats = Array.from({ length: count }, (_, slot) =>
      project(hudAnchor(anchorForSlot(slot, count), orientation)),
    );
    const center = project({ x: 0, y: TABLE_HEIGHT, z: -0.05 });
    const key = [...seats, center].map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(';');
    if (key === last.current) return;
    last.current = key;
    onLayout({ seats, center });
  });
  return null;
}

/**
 * On-demand rendering: full rate while the table animates, IDLE_FPS while it waits for the user
 * or is paused. The frame-rate monitor only judges full-rate stretches.
 */
function RenderDriver({
  snapshot,
  tier,
  onTierDrop,
}: {
  readonly snapshot: TableSnapshot;
  readonly tier: QualityTier;
  readonly onTierDrop: (tier: QualityTier) => void;
}) {
  const invalidate = useThree((s) => s.invalidate);
  const idle = snapshot.paused || snapshot.phase === 'userTurn';
  const monitor = useMemo(() => new FrameMonitor(TIERS[tier].targetFps), [tier]);
  const idleRef = useRef(idle);
  useEffect(() => {
    idleRef.current = idle;
  }, [idle]);
  const dropped = useRef(false);

  useEffect(() => {
    let raf = 0;
    let lastIdleFrame = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (idleRef.current) {
        monitor.reset();
        if (now - lastIdleFrame < 1000 / IDLE_FPS) return;
        lastIdleFrame = now;
      } else if (!dropped.current && monitor.frame(now)) {
        const next = lowerTier(tier);
        if (next) {
          dropped.current = true;
          onTierDrop(next);
        }
      }
      invalidate();
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
    };
  }, [invalidate, monitor, tier, onTierDrop]);
  return null;
}

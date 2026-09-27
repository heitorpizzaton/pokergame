/**
 * A seated NPC body (AGENTS.md §23-24): the build-time GLB, dressed with runtime materials and
 * moved by a procedural idle layer (breathing, weight shifts, blinks, looking at the player to
 * act). Nothing here reads or reveals game information beyond what the table shows.
 */
import { useFrame, useLoader } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import {
  type Bone,
  Color,
  type Material,
  type Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  type Object3D,
  type SkinnedMesh,
  Vector3,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';

export interface Outfit {
  readonly skin: string;
  readonly hair: string;
  readonly top: string;
  readonly bottom: string;
}

function characterUrl(id: string, lod: 0 | 1 | 2): string {
  return `${import.meta.env.BASE_URL}assets/3d/characters/${id}-lod${lod}.glb`;
}

function extendLoader(loader: GLTFLoader): void {
  loader.setMeshoptDecoder(MeshoptDecoder);
}

/** Small deterministic generator for idle timing (visual only; never game randomness). */
function idleNoise(seed: number): () => number {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}

function makeMaterials(outfit: Outfit): Record<string, Material> {
  // Skin: soft sheen and low specular so it reads as skin rather than plastic (§23.2).
  const skin = new MeshPhysicalMaterial({
    color: new Color(outfit.skin),
    roughness: 0.58,
    specularIntensity: 0.35,
    sheen: 0.35,
    sheenRoughness: 0.8,
    sheenColor: new Color('#ff9f84'),
  });
  return {
    skin,
    hair: new MeshStandardMaterial({ color: new Color(outfit.hair), roughness: 0.85 }),
    top: new MeshPhysicalMaterial({
      color: new Color(outfit.top),
      roughness: 0.82,
      sheen: 0.6,
      sheenRoughness: 0.9,
      sheenColor: new Color(outfit.top).multiplyScalar(1.6),
    }),
    bottom: new MeshStandardMaterial({ color: new Color(outfit.bottom), roughness: 0.9 }),
    shoes: new MeshStandardMaterial({ color: new Color('#16110d'), roughness: 0.45 }),
    eye: new MeshPhysicalMaterial({
      color: new Color('#f4f1ea'),
      roughness: 0.05,
      clearcoat: 1,
      clearcoatRoughness: 0.02,
    }),
  };
}

interface Props {
  readonly id: string;
  readonly lod: 0 | 1 | 2;
  readonly outfit: Outfit;
  readonly seed: number;
  /** World position of the seat this character should look at, or null to look ahead. */
  readonly lookAt: Vector3 | null;
  readonly shadows: boolean;
  readonly reducedMotion: boolean;
}

export function Character({ id, lod, outfit, seed, lookAt, shadows, reducedMotion }: Props) {
  const gltf = useLoader(GLTFLoader, characterUrl(id, lod), extendLoader);
  const materials = useMemo(() => makeMaterials(outfit), [outfit]);
  const model = useMemo(() => {
    const root = cloneSkinned(gltf.scene);
    root.traverse((o: Object3D) => {
      if (!(o as Partial<Mesh>).isMesh) return;
      const mesh = o as Mesh;
      mesh.castShadow = shadows;
      mesh.receiveShadow = shadows;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const replaced = mats.map((m) => materials[m.name] ?? m);
      mesh.material = Array.isArray(mesh.material) ? replaced : (replaced[0] as Material);
      // The seated pose moves the bounds; skip per-object culling (the table is always in view).
      mesh.frustumCulled = false;
    });
    return root;
  }, [gltf, materials, shadows]);

  useEffect(
    () => () => {
      for (const m of Object.values(materials)) m.dispose();
    },
    [materials],
  );

  const rig = useMemo(() => {
    const bone = (name: string) => model.getObjectByName(name) as Bone | undefined;
    const faces: SkinnedMesh[] = [];
    model.traverse((o) => {
      if ((o as Partial<SkinnedMesh>).isSkinnedMesh && (o as SkinnedMesh).morphTargetDictionary)
        faces.push(o as SkinnedMesh);
    });
    return {
      spine2: bone('spine_02'),
      spine3: bone('spine_03'),
      neck: bone('neck_01'),
      head: bone('head'),
      faces,
      rest: new Map<Bone, { x: number; y: number; z: number }>(),
    };
  }, [model]);

  const state = useRef({
    noise: idleNoise(seed + 1),
    nextBlink: 0,
    blinkStart: -1,
    yaw: 0,
    pitch: 0,
    phase: seed * 1.37,
  });
  const scratch = useMemo(() => new Vector3(), []);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const s = state.current;
    for (const b of [rig.spine2, rig.spine3, rig.neck, rig.head]) {
      if (b && !rig.rest.has(b))
        rig.rest.set(b, { x: b.rotation.x, y: b.rotation.y, z: b.rotation.z });
    }
    const amp = reducedMotion ? 0.3 : 1;
    // Breathing (~14 breaths/min) and a slow weight shift, never visibly looping.
    const breath = Math.sin(t * 1.45 + s.phase) * 0.018 * amp;
    const sway = (Math.sin(t * 0.21 + s.phase) + Math.sin(t * 0.13 + s.phase * 2)) * 0.012 * amp;
    const rest2 = rig.spine2 && rig.rest.get(rig.spine2);
    if (rig.spine2 && rest2) {
      rig.spine2.rotation.x = rest2.x + 0.06 + breath;
      rig.spine2.rotation.z = rest2.z + sway;
    }
    const rest3 = rig.spine3 && rig.rest.get(rig.spine3);
    if (rig.spine3 && rest3) rig.spine3.rotation.x = rest3.x + 0.04 + breath * 0.6;

    // Head: look at the player to act, else drift gently around the table.
    let targetYaw = Math.sin(t * 0.17 + s.phase) * 0.18;
    let targetPitch = 0.18;
    if (lookAt && rig.head) {
      rig.head.getWorldPosition(scratch);
      const dx = lookAt.x - scratch.x;
      const dz = lookAt.z - scratch.z;
      const parent = model.parent;
      const facing = parent ? parent.rotation.y : 0;
      let yaw = Math.atan2(dx, dz) - facing;
      yaw = Math.atan2(Math.sin(yaw), Math.cos(yaw));
      targetYaw = Math.max(-0.9, Math.min(0.9, yaw));
      targetPitch = 0.22;
    }
    const k = reducedMotion ? 1 : 1 - Math.exp(-4 * (1 / 60));
    s.yaw += (targetYaw - s.yaw) * k;
    s.pitch += (targetPitch - s.pitch) * k;
    const restH = rig.head && rig.rest.get(rig.head);
    const restN = rig.neck && rig.rest.get(rig.neck);
    if (rig.neck && restN) {
      rig.neck.rotation.y = restN.y + s.yaw * 0.4;
      rig.neck.rotation.x = restN.x + s.pitch * 0.4;
    }
    if (rig.head && restH) {
      rig.head.rotation.y = restH.y + s.yaw * 0.6;
      rig.head.rotation.x = restH.x + s.pitch * 0.6;
    }

    // Blinks at irregular intervals (2–6 s), 150 ms each.
    if (t >= s.nextBlink) {
      s.blinkStart = t;
      s.nextBlink = t + 2 + s.noise() * 4;
    }
    const u = (t - s.blinkStart) / 0.15;
    const closed = u >= 0 && u <= 1 ? Math.sin(u * Math.PI) : 0;
    // Every material primitive of the body carries the same morph targets.
    for (const face of rig.faces) {
      const influences = face.morphTargetInfluences;
      const dict = face.morphTargetDictionary;
      if (!influences || !dict) continue;
      const l = dict.blinkL;
      const r = dict.blinkR;
      if (l !== undefined) influences[l] = closed;
      if (r !== undefined) influences[r] = closed;
    }
  });

  return <primitive object={model} />;
}

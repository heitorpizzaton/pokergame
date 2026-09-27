/** glTF optimization for characters: weld, simplify per LOD, quantize, meshopt-compress. */
import { writeFileSync } from 'node:fs';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, meshopt, prune, quantize, simplify, weld } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';

export interface Lod {
  readonly level: 0 | 1 | 2;
  /** Target triangle count (AGENTS.md §20.4). */
  readonly triangles: number;
}

export const LODS: readonly Lod[] = [
  { level: 0, triangles: 20_000 },
  { level: 1, triangles: 8_500 },
  { level: 2, triangles: 3_500 },
];

function countTriangles(doc: import('@gltf-transform/core').Document): number {
  let total = 0;
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const indices = prim.getIndices();
      total +=
        (indices ? indices.getCount() : (prim.getAttribute('POSITION')?.getCount() ?? 0)) / 3;
    }
  }
  return total;
}

export async function optimizeCharacter(
  input: string,
  output: string,
  lod: Lod,
): Promise<{ triangles: number; bytes: number }> {
  await MeshoptEncoder.ready;
  await MeshoptSimplifier.ready;
  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
  const doc = await io.read(input);
  await doc.transform(dedup(), prune(), weld());
  const before = countTriangles(doc);
  const ratio = Math.min(1, lod.triangles / before);
  if (ratio < 1) {
    await doc.transform(simplify({ simplifier: MeshoptSimplifier, ratio, error: 0.02 }));
  }
  await doc.transform(
    prune(),
    quantize({ quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 12 }),
    meshopt({ encoder: MeshoptEncoder, level: 'high' }),
  );
  const bytes = await io.writeBinary(doc);
  writeFileSync(output, bytes);
  return { triangles: countTriangles(doc), bytes: bytes.byteLength };
}

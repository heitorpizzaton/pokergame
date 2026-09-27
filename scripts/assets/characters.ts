/**
 * `npm run assets:characters` (AGENTS.md §22.3): builds every roster character headless with
 * Blender + MPFB2, then optimizes each into three LODs under public/assets/3d/characters/.
 * Needs the tools from scripts/assets/setup.sh (run automatically when missing).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { optimizeCharacter, LODS } from './optimize.ts';

const root = resolve(import.meta.dirname, '..', '..');
const roster = JSON.parse(readFileSync(resolve(root, 'art/characters/roster.json'), 'utf8')) as {
  characters: { id: string }[];
};
const only = process.argv.slice(2).filter((a) => !a.startsWith('-'));

if (!existsSync(resolve(root, 'tools/venv/bin/python'))) {
  execFileSync('bash', [resolve(root, 'scripts/assets/setup.sh')], { stdio: 'inherit' });
}

const buildDir = resolve(root, 'art/build');
const outDir = resolve(root, 'public/assets/3d/characters');
mkdirSync(buildDir, { recursive: true });
mkdirSync(outDir, { recursive: true });

for (const { id } of roster.characters) {
  if (only.length > 0 && !only.includes(id)) continue;
  const raw = resolve(buildDir, `${id}.glb`);
  execFileSync(
    resolve(root, 'tools/venv/bin/python'),
    [resolve(root, 'art/scripts/build_character.py'), '--id', id, '--out', raw],
    {
      stdio: ['ignore', 'inherit', 'inherit'],
      env: { ...process.env, BLENDER_USER_RESOURCES: resolve(root, 'tools/blender-user') },
    },
  );
  for (const lod of LODS) {
    const out = resolve(outDir, `${id}-lod${lod.level}.glb`);
    const stats = await optimizeCharacter(raw, out, lod);
    console.log(
      `${id} LOD${lod.level}: ${stats.triangles} triangles, ${(stats.bytes / 1024).toFixed(0)} KB`,
    );
  }
}

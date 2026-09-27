/**
 * `npm run assets:check` (AGENTS.md §21.2, §26): every file under public/assets/ is registered in
 * docs/LICENSES.md with an allowed license, stays within its size budget and, for glTF, passes
 * gltf-validator with zero errors.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { validateBytes } from 'gltf-validator';

const root = resolve(import.meta.dirname, '..', '..');
const ALLOWED = new Set(['Project', 'CC0-1.0', 'CC-BY-4.0']);
/** Per-file budgets in bytes (AGENTS.md §26: per character LOD, textures included). */
const BUDGETS: [RegExp, number][] = [
  [/characters\/[^/]+-lod0\.glb$/, 1_800 * 1024],
  [/characters\/[^/]+-lod1\.glb$/, 900 * 1024],
  [/characters\/[^/]+-lod2\.glb$/, 400 * 1024],
];
/** Whole-download budget for the lowest tier (AGENTS.md §26), a ceiling for everything shipped. */
const TOTAL_BUDGET = 8 * 1024 * 1024;

function files(dir: string): string[] {
  try {
    return readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      return statSync(path).isDirectory() ? files(path) : [path];
    });
  } catch {
    return [];
  }
}

function globToRegExp(glob: string): RegExp {
  const parts = glob.split('**').map((part) =>
    part
      .split('*')
      .map((p) => p.replace(/[.+^${}()|[\]\\?]/g, '\\$&'))
      .join('[^/]*'),
  );
  return new RegExp(`^${parts.join('.*')}$`);
}

const registry = readFileSync(resolve(root, 'docs/LICENSES.md'), 'utf8')
  .split('\n')
  .filter((line) => line.startsWith('| `public/assets/'))
  .map((line) => {
    const cells = line.split('|').map((c) => c.trim());
    const path = (cells[1] ?? '').replace(/`/g, '');
    return { path, pattern: globToRegExp(path), license: cells[4] ?? '' };
  });

const errors: string[] = [];
for (const row of registry) {
  if (!ALLOWED.has(row.license))
    errors.push(`${row.path}: license "${row.license}" is not allowed`);
}

const shipped = files(resolve(root, 'public/assets')).map((f) => relative(root, f));
let lowTierBytes = 0;
for (const file of shipped) {
  const bytes = statSync(resolve(root, file)).size;
  if (!/-lod[01]\.glb$/.test(file)) lowTierBytes += bytes;
  const row = registry.find((r) => r.pattern.test(file));
  if (!row) errors.push(`${file}: not registered in docs/LICENSES.md`);
  const budget = BUDGETS.find(([re]) => re.test(file));
  if (budget && bytes > budget[1]) {
    errors.push(
      `${file}: ${(bytes / 1024).toFixed(0)} KB is over ${(budget[1] / 1024).toFixed(0)} KB`,
    );
  }
  if (file.endsWith('.glb') || file.endsWith('.gltf')) {
    const report = await validateBytes(new Uint8Array(readFileSync(resolve(root, file))));
    if (report.issues.numErrors > 0) {
      const first = report.issues.messages.filter((m) => m.severity === 0).slice(0, 3);
      errors.push(`${file}: gltf-validator errors: ${first.map((m) => m.code).join(', ')}`);
    }
  }
  console.log(`${(bytes / 1024).toFixed(0).padStart(6)} KB  ${file}`);
}
if (lowTierBytes > TOTAL_BUDGET) errors.push(`Baixa download ${lowTierBytes} B is over 8 MB`);

if (errors.length > 0) {
  for (const e of errors) console.error(e);
  process.exit(1);
}
console.log(`Asset checks passed: ${shipped.length} files registered, licensed and within budget.`);

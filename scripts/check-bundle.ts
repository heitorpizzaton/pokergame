/**
 * Checks a production build in `dist/` (AGENTS.md §12, ADR-022):
 * - the initial route's JavaScript is under 350 KB gzipped;
 * - no file contains the seeded debug RNG (it exists only in `vite build --mode e2e`).
 *
 * Usage: `npm run build && npm run budget`.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import { gzipSync } from 'node:zlib';

const DIST = 'dist';
const INITIAL_JS_BUDGET = 350 * 1024;
/** Mirrors SEEDED_MARKER in src/app/debug/seeded-factory.ts. */
const SEEDED_MARKER = 'mesa-viva-seeded-debug';

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}

const all = files(DIST);
const html = readFileSync(join(DIST, 'index.html'), 'utf8');
// Scripts and modulepreloads referenced by index.html make up the initial route. The deploy
// build prefixes paths with the Pages base, so match by file name.
const referenced = [
  ...html.matchAll(/<script[^>]+src="([^"]+\.js)"/g),
  ...html.matchAll(/<link[^>]+rel="modulepreload"[^>]+href="([^"]+\.js)"/g),
].map((m) => basename(m[1] ?? ''));
const initial = all.filter((path) => referenced.includes(basename(path)));
if (initial.length === 0) throw new Error('No initial scripts found in dist/index.html');

let total = 0;
for (const path of initial) {
  const size = gzipSync(readFileSync(path)).length;
  total += size;
  console.log(`${(size / 1024).toFixed(1).padStart(7)} KB gz  ${path}`);
}
console.log(`${(total / 1024).toFixed(1).padStart(7)} KB gz  initial JS (budget 350 KB)`);

const errors: string[] = [];
if (total > INITIAL_JS_BUDGET) errors.push('Initial JS is over the 350 KB gzipped budget.');
const leaked = all.filter(
  (path) => /\.(js|html)$/.test(path) && readFileSync(path, 'utf8').includes(SEEDED_MARKER),
);
if (leaked.length > 0) errors.push(`Seeded debug RNG found in: ${leaked.join(', ')}`);

if (errors.length > 0) {
  for (const e of errors) console.error(e);
  process.exit(1);
}
console.log('Bundle checks passed: size budget met, no seeded RNG.');

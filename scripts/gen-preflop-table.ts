/**
 * Generates src/core/equity/preflop-table.ts: the exact heads-up preflop equity of each of the
 * 169 starting-hand classes against one uniformly random hand (AGENTS.md §7.2).
 *
 * Every (hero, opponent) matchup is reduced to a canonical form under the 24 suit permutations
 * (and hand order), each unique matchup is enumerated exactly over all 1,712,304 boards, and the
 * results are averaged over all 1,225 opponent hands. Run with `npm run gen:preflop` (it takes a
 * while; it uses every CPU core).
 */
import { writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import type { Card } from '../src/core/cards/index.ts';
import { exactEquityVsHands } from '../src/core/equity/exact.ts';

type Hand = readonly [number, number];
interface Matchup {
  key: number;
  a: Hand;
  b: Hand;
}
interface Result {
  key: number;
  values: number[];
}

const RANKS = '23456789TJQKA';

function sortHand(x: number, y: number): Hand {
  return x > y ? [x, y] : [y, x];
}
const handCode = (h: Hand): number => h[0] * 52 + h[1];

function permutations(items: number[]): number[][] {
  if (items.length <= 1) return [items];
  return items.flatMap((item, i) =>
    permutations([...items.slice(0, i), ...items.slice(i + 1)]).map((rest) => [item, ...rest]),
  );
}
const SUIT_PERMS = permutations([0, 1, 2, 3]);
const permute = (card: number, p: number[]): number => (card & ~3) | (p[card & 3] as number);

/** Canonical key of the unordered matchup, and whether `a` maps to the key's first hand. */
function canonical(a: Hand, b: Hand): { key: number; aFirst: boolean; first: Hand; second: Hand } {
  let best = Infinity;
  let aFirst = true;
  let first: Hand = a;
  let second: Hand = b;
  for (const p of SUIT_PERMS) {
    const pa = sortHand(permute(a[0], p), permute(a[1], p));
    const pb = sortHand(permute(b[0], p), permute(b[1], p));
    const k1 = handCode(pa) * 2704 + handCode(pb);
    const k2 = handCode(pb) * 2704 + handCode(pa);
    if (k1 < best) {
      best = k1;
      aFirst = true;
      first = pa;
      second = pb;
    }
    if (k2 < best) {
      best = k2;
      aFirst = false;
      first = pb;
      second = pa;
    }
  }
  return { key: best, aFirst, first, second };
}

interface HeroClass {
  label: string;
  combos: number;
  hand: Hand;
}

function heroClasses(): HeroClass[] {
  const classes: HeroClass[] = [];
  for (let hi = 12; hi >= 0; hi--) {
    for (let lo = hi; lo >= 0; lo--) {
      const H = RANKS[hi] as string;
      const L = RANKS[lo] as string;
      if (hi === lo) {
        classes.push({ label: H + L, combos: 6, hand: sortHand(hi * 4, hi * 4 + 1) });
      } else {
        classes.push({ label: `${H}${L}s`, combos: 4, hand: sortHand(hi * 4, lo * 4) });
        classes.push({ label: `${H}${L}o`, combos: 12, hand: sortHand(hi * 4, lo * 4 + 1) });
      }
    }
  }
  return classes;
}

function runWorker(): void {
  const { matchups } = workerData as { matchups: Matchup[] };
  for (const m of matchups) {
    const [ra, rb] = exactEquityVsHands([m.a as unknown as Card[], m.b as unknown as Card[]], []);
    if (!ra || !rb) throw new Error('missing result');
    parentPort?.postMessage({
      key: m.key,
      values: [ra.win, ra.tie, ra.equity, rb.win, rb.tie, rb.equity],
    } satisfies Result);
  }
}

async function main(): Promise<void> {
  const classes = heroClasses();
  const unique = new Map<number, Matchup>();
  const plan = classes.map((cls) => {
    const refs: { key: number; aFirst: boolean }[] = [];
    for (let x = 0; x < 52; x++) {
      for (let y = x + 1; y < 52; y++) {
        if (cls.hand.includes(x) || cls.hand.includes(y)) continue;
        const c = canonical(cls.hand, sortHand(x, y));
        refs.push({ key: c.key, aFirst: c.aFirst });
        if (!unique.has(c.key)) unique.set(c.key, { key: c.key, a: c.first, b: c.second });
      }
    }
    return { cls, refs };
  });
  console.log(`${classes.length} classes, ${unique.size} unique matchups`);

  const threads = availableParallelism();
  const all = [...unique.values()];
  const results = new Map<number, number[]>();
  const started = Date.now();
  await Promise.all(
    Array.from({ length: threads }, (_, t) => {
      const matchups = all.filter((_, i) => i % threads === t);
      return new Promise<void>((resolve, reject) => {
        const worker = new Worker(new URL(import.meta.url), { workerData: { matchups } });
        worker.on('message', (r: Result) => {
          results.set(r.key, r.values);
          if (results.size % 500 === 0) {
            const rate = results.size / ((Date.now() - started) / 1000);
            const eta = (all.length - results.size) / rate;
            console.log(`${results.size}/${all.length} (eta ${Math.round(eta)} s)`);
          }
        });
        worker.on('error', reject);
        worker.on('exit', (code) => {
          if (code === 0) resolve();
          else reject(new Error(`exit ${code}`));
        });
      });
    }),
  );

  const rows = plan.map(({ cls, refs }) => {
    let win = 0;
    let tie = 0;
    let equity = 0;
    for (const ref of refs) {
      const v = results.get(ref.key);
      if (!v) throw new Error('missing matchup');
      const o = ref.aFirst ? 0 : 3;
      win += v[o] as number;
      tie += v[o + 1] as number;
      equity += v[o + 2] as number;
    }
    const n = refs.length;
    return { label: cls.label, combos: cls.combos, win: win / n, tie: tie / n, equity: equity / n };
  });

  const fmt = (x: number): string => x.toFixed(7);
  const body = rows
    .map((r) => `  ['${r.label}', ${r.combos}, ${fmt(r.win)}, ${fmt(r.tie)}, ${fmt(r.equity)}],`)
    .join('\n');
  const file = `// Generated by scripts/gen-preflop-table.ts. Do not edit by hand.
// Exact heads-up preflop equity of each starting-hand class against one random hand:
// [label, combos, win, tie, equity], enumerated over every opponent hand and every board.

export const PREFLOP_VS_RANDOM: readonly (readonly [string, number, number, number, number])[] = [
${body}
];
`;
  writeFileSync(new URL('../src/core/equity/preflop-table.ts', import.meta.url), file);
  console.log(`wrote 169 rows in ${Math.round((Date.now() - started) / 1000)} s`);
}

if (isMainThread) await main();
else runWorker();

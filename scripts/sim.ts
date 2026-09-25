/**
 * `npm run sim -- --hands 100000 --players 6 --mix random` (AGENTS.md §8.5).
 * `--mix` is `random` or a comma-separated seat list (tag, lag, nit, station, maniac, rec,
 * allInBot, foldBot).
 */
import { parseArgs } from 'node:util';
import { derived, runSim, type SeatKind } from './sim-core.ts';

const { values } = parseArgs({
  options: {
    hands: { type: 'string', default: '10000' },
    players: { type: 'string', default: '6' },
    mix: { type: 'string', default: 'random' },
    seed: { type: 'string', default: '1' },
    iterations: { type: 'string', default: '250' },
  },
});

const players = Number(values.players);
const seats = values.mix === 'random' ? 'random' : (values.mix.split(',') as SeatKind[]);
const started = performance.now();
const result = runSim({
  hands: Number(values.hands),
  players: seats === 'random' ? players : seats.length,
  seats,
  seed: Number(values.seed),
  iterations: Number(values.iterations),
});
const seconds = (performance.now() - started) / 1000;

const pct = (x: number) => `${(x * 100).toFixed(1)}%`.padStart(7);
console.log(
  `${result.hands} hands in ${seconds.toFixed(1)} s, illegal actions: ${result.illegalActions}`,
);
console.log('kind       hands    VPIP    PFR     AF   BB/100   WTSD  avg ms  max ms');
for (const [kind, s] of Object.entries(result.byKind)) {
  const d = derived(s);
  console.log(
    `${kind.padEnd(9)} ${String(s.hands).padStart(6)} ${pct(d.vpip)} ${pct(d.pfr)} ${d.af.toFixed(2).padStart(6)} ${d.bbPer100.toFixed(1).padStart(8)} ${pct(d.wtsd)} ${d.avgMs.toFixed(2).padStart(7)} ${d.maxMs.toFixed(1).padStart(7)}`,
  );
}

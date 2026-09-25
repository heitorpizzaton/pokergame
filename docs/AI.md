# NPC artificial intelligence

How the NPCs in `src/ai/` think (AGENTS.md Section 8). Everything here uses only the `PlayerView` of the seat, which the engine builds; the AI cannot import engine internals (lint rule and `tests/unit/lint-rules.test.ts`), and `tests/unit/ai.test.ts` proves that decisions do not change when other players' hidden cards are randomized.

## Pipeline

1. **Spot analysis** (`view-analysis.ts`): pot, amount to call, effective stack, live opponents, preflop raises and limpers, the preflop aggressor, and position.
2. **Preflop** (`ranges/preflop.ts`): hands are ordered by the exact heads-up equity table plus a small playability bonus for suited, connected and paired hands (`ranges/hand-order.ts`). A style gives range widths for each situation: unopened (raise, or limp for passive styles), limped pot, single raise (3-bet, call, bluff 3-bet), 3-bet (4-bet, call) and 4-bet or more. Widths are scaled by position and table size. Range edges are soft: hands near a boundary mix between actions. At 12 BB or less effective, play becomes push/fold.
3. **Opponent model** (`model/opponent-model.ts`): per-player VPIP, PFR, 3-bet, aggression factor, fold-to-c-bet and went-to-showdown, smoothed with priors. It is updated from the public record of each finished hand, and covers every player including the user.
4. **Range narrowing** (`model/range.ts`): each live opponent starts from a weight of 1 on the 1,326 combos, minus the cards the NPC can see. Every public action multiplies the weights by a likelihood. Preflop likelihoods come from that opponent's estimated VPIP/PFR. Postflop likelihoods come from each combo's relative strength on the board at that street, with draws getting extra weight and bet/raise weights including the opponent's estimated bluffing.
5. **Hand strength** (`postflop/equity.ts`): Monte Carlo equity against the sampled opponent ranges within a time budget (default 1,500 samples, 250 ms).
6. **Postflop decision** (`postflop/decide.ts`): value bets and raises above style thresholds that rise with more opponents; c-bets, semi-bluffs and pure bluffs by frequency; calls against pot odds times a style call factor, plus implied odds for draws; occasional river hero calls. Bet sizes come from the style's set (25–150% of the pot, plus all-in), adjusted for board texture (`postflop/texture.ts`), with a little noise.
7. **Sanity** (`sanity.ts`): never fold when checking is free, never fold the absolute nuts (`isNuts`), never bet below the minimum, and fall back to check or call on anything the engine would reject.
8. **Tilt** (`brain.ts`): after losing at least half the stack (and at least 25 BB) in one hand, a player plays looser and more aggressively for `tiltHands` hands (maniac 6 … TAG/nit 1).

## Styles and targets

Targets are VPIP / PFR over a long simulation at a **6-handed** table (`npm run sim -- --hands 100000 --players 6 --mix random`), checked in `tests/long/ai-sim.test.ts`:

| Style (pt-BR)             | VPIP   | PFR    | Leaks by design                                 |
| ------------------------- | ------ | ------ | ----------------------------------------------- |
| Regular sólido (TAG)      | 20–26% | 16–21% | slightly fit-or-fold                            |
| Agressivo (LAG)           | 28–36% | 22–30% | over-bluffs a little                            |
| Pedra (Nit)               | 10–15% | 8–12%  | folds too much, rarely bluffs                   |
| Pagador (Calling station) | 40–55% | 5–10%  | calls far too much, rarely raises               |
| Maníaco                   | 50–70% | 35–55% | huge bluff frequency and sizes                  |
| Recreativo                | 32–45% | 6–12%  | limps a lot, cautious postflop, sometimes spews |

**Other table sizes:** ranges scale by `(6 / players)^0.45`. Expected VPIP and PFR are roughly ×0.85 at 9 handed, ×1.1 at 4 handed and ×1.5 heads-up, relative to the 6-handed targets.

A 20,000-hand calibration run (seed 3) measured:

| Style      | VPIP  | PFR   | BB/100 |
| ---------- | ----- | ----- | ------ |
| TAG        | 21.4% | 16.5% | +18.6  |
| LAG        | 30.9% | 24.5% | +41.5  |
| Nit        | 11.8% | 9.0%  | +12.2  |
| Station    | 44.5% | 6.7%  | −65.2  |
| Maniac     | 61.4% | 48.9% | −77.3  |
| Recreativo | 36.9% | 7.7%  | −6.9   |

**Random mix weights:** TAG 30, recreativo 28, LAG 14, station 13, nit 11, maniac 4, with at most two maniacs per table.

## Speed

The AI runs in `src/workers/ai.worker.ts`. The controller waits for the thinking delay (normal 350–1,200 ms, fast 120–400 ms, never above 1.5 s) and the decision in parallel. If the decision is not ready by the hard cap, the cheap rule-based heuristic decides instead. Measured decisions average about 1 ms in the simulator (200 samples), and stay below 350 ms at live settings (tested).

## Evaluation harness

`npm run sim -- --hands N --players P --mix random|tag,lag,…,allInBot,foldBot --seed S` prints VPIP, PFR, AF, BB/100, WTSD and decision times per style. Every hand starts from fresh 100 BB stacks with a rotating button, so it measures win rates without freezeout end-game effects, while the brains keep learning across hands.

`test:long` also checks that a TAG beats stations and maniacs, and that an always-all-in bot and an always-fold-to-any-bet bot both lose against regulars.

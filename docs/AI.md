# NPC artificial intelligence

How the NPCs in `src/ai/` think (AGENTS.md Section 8). Everything here uses only the `PlayerView` of the seat, which the engine builds; the AI cannot import engine internals (lint rule and `tests/unit/lint-rules.test.ts`), and `tests/unit/ai.test.ts` proves that decisions do not change when other players' hidden cards are randomized.

## Pipeline

1. **Spot analysis** (`view-analysis.ts`): pot, amount to call, effective stack, live opponents, preflop raises and limpers, the preflop aggressor, and position.
2. **Preflop** (`ranges/preflop.ts`): hands are ordered by the exact heads-up equity table plus a small playability bonus for suited, connected and paired hands (`ranges/hand-order.ts`). A style gives range widths for each situation: unopened (raise, or limp for passive styles), limped pot, single raise (3-bet, call, bluff 3-bet), 3-bet (4-bet, call) and 4-bet or more. Widths are scaled by position and table size. Range edges are soft: hands near a boundary mix between actions. At 12 BB or less effective, play becomes push/fold.
3. **Opponent model** (`model/opponent-model.ts`): per-player VPIP, PFR, 3-bet, aggression factor, fold-to-c-bet and went-to-showdown, smoothed with priors. It is updated from the public record of each finished hand, and covers every player including the user.
4. **Range narrowing** (`model/range.ts`): each live opponent starts from a weight of 1 on the 1,326 combos, minus the cards the NPC can see. Every public action multiplies the weights by a likelihood. Preflop likelihoods come from that opponent's estimated VPIP/PFR. Postflop likelihoods come from each combo's relative strength on the board at that street, with draws getting extra weight and bet/raise weights including the opponent's estimated bluffing.
5. **Hand strength** (`postflop/equity.ts`): Monte Carlo equity against the sampled opponent ranges within a time budget (default 1,500 samples, 250 ms).
6. **Postflop decision** (`postflop/decide.ts`): every bet is classified as value, semi-bluff or pure bluff (`postflop/classify.ts`). Value hands bet or raise. Non-value hands bluff with the probability from the bluff model (`postflop/bluff.ts`, see "Bluffing" below). Calls are made against pot odds times a style call factor, plus implied odds for draws, with occasional river hero calls. Bet sizes come from the style's set (25–150% of the pot, plus all-in), adjusted for board texture (`postflop/texture.ts`), with a little noise.
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

**Random mix weights** by opponent level (AGENTS.md §31.3.2, `styles/styles.ts`):

| Level            | TAG | Recreativo | LAG | Station | Nit | Maniac | Max maniacs |
| ---------------- | --- | ---------- | --- | ------- | --- | ------ | ----------- |
| Iniciante        | 10  | 36         | 6   | 30      | 13  | 5      | 2           |
| Normal (default) | 30  | 28         | 14  | 13      | 11  | 4      | 2           |
| Difícil          | 42  | 8          | 30  | 4       | 12  | 4      | 1           |

"Normal" is the realistic online mix of §8.3 and draws exactly as before. The style profiles themselves do not change with the level; only the mix does.

## Bluffing (AGENTS.md Section 18)

### Classification (`postflop/classify.ts`)

One module classifies every postflop bet or raise. Both the AI and the simulator statistics use it, so the two cannot drift apart:

- **Calling range:** for each live opponent, the stronger half of its estimated range by current hand strength (weighted median), plus any combo with a flush or open-ended straight draw.
- **Value bet:** equity vs. the calling ranges of at least 55%. The absolute nuts are always value.
- **Semi-bluff:** below 55%, with a real draw (6 or more clean outs to a straight or better that do not pair the board) or equity of at least 30%.
- **Pure bluff:** below 30% with no real draw. On the river, anything below 30% is a pure bluff.
- **Bluff opportunity:** the NPC may bet or raise, the hand is not a value hand, fewer than four players are in the pot, and at least one opponent can still fold.

### Probability (`postflop/bluff.ts`)

`base(style, street) × modifiers`, clamped to [0, 0.95]. The base is the style's pure-bluff, semi-bluff, continuation-bet or bluff-raise rate.

| Modifier       | Effect                                                                                                                                                                     |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fold equity    | Average fold-to-bet of the opponents (opponent model, prior 45%), raised to the style's `foldSensitivity`: TAG 1, LAG and Nit 0.8, Recreativo 0.3, Pagador 0.2, Maníaco 0. |
| Opponents      | ×0.55 for each opponent beyond one.                                                                                                                                        |
| Position       | ×1.2 in position, ×0.85 out of position.                                                                                                                                   |
| Board story    | ×(1 + 0.2 × story). Story is +1 on high-card or ace boards for the preflop raiser, −1 on low connected boards, and mirrored for callers.                                   |
| Blockers       | ×(1 + 0.35 × score). Score is 1 for the ace of a three-flush suit, 0.4 for an ace that does not pair the board.                                                            |
| Showdown value | Style's `showdownRespect` when equity vs. the whole range is at least 35%.                                                                                                 |
| Failed bluff   | Style's `failedBluffDamping` for 3 hands after a pure bluff was shown down and lost. The Maníaco ignores it.                                                               |
| Tilt           | Style's `tilt`, from ×1.3 (TAG, Nit) to ×1.8 (Maníaco).                                                                                                                    |
| Personal       | One multiplier per NPC, drawn once from [0.8, 1.2] with the AI's RNG.                                                                                                      |

- **Value and thin value:** value hands are bet when checked to, except for a style's `slowPlay` (dry boards) and `passiveValue` rates. The Pagador checks 18% of its value hands, which keeps its c-bet realistic. Facing a bet, value hands above `raiseEquity` raise with probability `valueRaise`.
- **River thin value:** a river hand with 30–55% equity vs. callers is bet with probability `thinValue`. This is not a bluff, so the bluff modifiers do not apply. Only the Recreativo (95%) and the LAG (60%) do this ("sometimes spews").
- **Sizing:** strong styles (TAG, LAG, Nit) size bluffs exactly like value bets. The Pagador and the Recreativo bluff small, and the Maníaco bluffs big (a deliberate, readable leak).
- **Sanity (§18.4):**
  - No bluff when every opponent is all-in.
  - Never a bluff with a value hand or the nuts.
  - After a pure bluff earlier in the hand, the NPC folds instead of calling off a third or more of its stack when the numbers say fold. The only exceptions are bounded leaks: the Pagador calls anyway 15% of the time, and the Maníaco 10%.

### Measured rates

The simulator (`npm run sim`) prints these rates per style:

- **Pure-bluff rate (per street):** pure bluffs made ÷ bluff opportunities whose hand is a pure bluff.
- **River bluff share:** river pure bluffs ÷ all river bets and raises.
- **C-bet:** bets ÷ continuation-bet spots. A spot means the NPC was the last preflop raiser, is heads-up on the flop, and nobody has bet yet. Value hands count.
- **Bluff-raise:** bluff raises ÷ bluff opportunities facing a bet.
- **Bluff wins:** pure bluffs that won the pot at once (nobody called or raised, everyone else folded) ÷ pure bluffs.

**Targets at 6 players, 100 BB (§18.2), checked in `tests/long/ai-bluff.test.ts` over 100,000 hands of the random mix:**

| Style                     | Pure bluff flop / turn / river | River bluff share | C-bet  |
| ------------------------- | ------------------------------ | ----------------- | ------ |
| Regular sólido (TAG)      | 20–30% / 15–25% / 12–20%       | 25–35%            | 55–70% |
| Agressivo (LAG)           | 30–42% / 25–35% / 20–30%       | 35–45%            | 65–80% |
| Pedra (Nit)               | 5–12% / 3–8% / 2–6%            | 5–12%             | 40–55% |
| Pagador (Calling station) | 3–8% / 2–6% / 1–5%             | 3–10%             | 30–45% |
| Maníaco                   | 50–70% / 45–65% / 40–60%       | 50–65%            | 80–95% |
| Recreativo                | 10–20% / 8–15% / 8–15%         | 10–20%            | 40–55% |

**Measured** (`npm run sim -- --hands 100000 --players 6 --mix random --seed 2027`, the long test's seed):

| Style      | Pure bluff flop / turn / river | River share | C-bet | Bluff-raise | Bluff wins |
| ---------- | ------------------------------ | ----------- | ----- | ----------- | ---------- |
| TAG        | 26.0% / 18.4% / 14.7%          | 32.3%       | 64.6% | 6.9%        | 22.9%      |
| LAG        | 34.0% / 30.2% / 23.2%          | 38.8%       | 72.1% | 16.1%       | 23.1%      |
| Nit        | 7.2% / 5.9% / 3.7%             | 10.2%       | 46.0% | 1.1%        | 22.6%      |
| Station    | 3.8% / 3.4% / 1.7%             | 7.5%        | 37.6% | 0.9%        | 14.3%      |
| Maníaco    | 57.8% / 58.2% / 47.1%          | 59.9%       | 88.5% | 54.0%       | 20.1%      |
| Recreativo | 13.5% / 10.9% / 9.3%           | 17.1%       | 50.3% | 2.5%        | 16.0%      |

**Calibration note:** the rates depend heavily on the other players, because strong styles adapt to fold equity. Individual 20,000-hand samples varied by up to ±3 points on the river shares, and the Recreativo's two river targets only fit together in a narrow window. It reaches the river with many weak hands, so its bluff share only drops if it bets nearly all of its value and thin-value hands.

**Other table sizes:** fewer players means more bluffing, full ring means less. The targets scale the 6-handed ranges (both ends) by:

| Players      | Pure-bluff rates and river share | C-bet                |
| ------------ | -------------------------------- | -------------------- |
| 2 (heads-up) | ×1.25 (capped at 95%)            | ×1.1 (capped at 95%) |
| 4            | ×1.1                             | ×1.05                |
| 9            | ×0.8                             | ×0.9                 |

For example, a TAG heads-up targets a flop pure-bluff rate of 25–37.5%, and at 9 players 16–24%. Most of the change comes from the model itself: fewer opponents per pot (×0.55 each) and more positional play. Only the 6-handed targets are asserted in tests (§18.2). The other table sizes are documented targets.

**Fold equity:** heads-up against scripted bots, a TAG bluffs at least 40% less against a calling station (`callBot`) than against a player who folds to every bet (`folderBot`). A Maníaco does not bluff significantly less. Both checks are in `tests/long/ai-bluff.test.ts`.

## Speed

The AI runs in `src/workers/ai.worker.ts`. The controller waits for the thinking delay (normal 350–1,200 ms, fast 120–400 ms, never above 1.5 s) and the decision in parallel. If the decision is not ready by the hard cap, the cheap rule-based heuristic decides instead. Measured decisions average about 1 ms in the simulator (200 samples), and stay below 350 ms at live settings (tested).

## Evaluation harness

`npm run sim -- --hands N --players P --mix random|tag,lag,…,allInBot,foldBot --seed S` prints VPIP, PFR, AF, BB/100, WTSD and decision times per style. Every hand starts from fresh 100 BB stacks with a rotating button, so it measures win rates without freezeout end-game effects, while the brains keep learning across hands.

`test:long` also checks that a TAG beats stations and maniacs, and that an always-all-in bot and an always-fold-to-any-bet bot both lose against regulars.

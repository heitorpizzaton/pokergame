# Progress

Status: `[ ]` todo · `[~]` in progress · `[x]` done and tested. Phases follow `AGENTS.md` Section 14 and MUST be worked in order.

## Phase 0 — Scaffold

- [x] `AGENTS.md` committed to the repository
- [x] `docs/` files created: `PROGRESS.md`, `HANDOFF.md` and `DECISIONS.md` (`RULES.md` moved to Phase 2 by the owner)
- [x] Vite + React + TypeScript project (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`)
- [x] Directory structure from Section 4
- [x] ESLint + Prettier, including the `Math.random` ban
- [x] Import restriction: `src/ai/` cannot import `src/core/engine` internals (plus `src/core` purity and the i18n JSX-text ban), guarded by `tests/unit/lint-rules.test.ts`
- [x] Vitest and Playwright set up (e2e at 360×640, iPhone SE, Pixel 7, iPad, desktop 1440×900)
- [x] npm scripts: `dev`, `build`, `preview`, `test`, `test:long`, `e2e`, `lint`, `typecheck`, `format`, `format:check`, `icons`, `check`
- [x] CI workflow (format, lint, typecheck, unit, build; separate e2e job), green on `main`
- [x] Manual `test:long` workflow
- [x] Placeholder page (pt-BR, via i18n, with the entertainment disclaimer)
- [x] `vite-plugin-pwa` wired up (manifest, service worker, original icons), verified by e2e
- [x] GitHub Pages deploy workflow: live at https://heitorpizzaton.github.io/pokergame/ (the `smoke` job checks the page, manifest and service worker)
- [x] **Accept:** `npm run check` is green; the deployed placeholder page loads (deploy run 6, 2026-09-25)

## Phase 1 — Core

- [x] Card encoding, parsing and formatting (`src/core/cards`, ADR-007)
- [x] `Rng` interface, `CryptoRng` (crypto, rejection sampling) and a seeded test RNG that production code cannot import (lint-enforced; ADR-009)
- [x] Fisher-Yates shuffle and fresh shuffled deck per call
- [x] 7-card evaluator: comparable strength, category, best 5 (`src/core/eval`, ADR-008)
- [x] Exhaustive 5-card oracle test (category counts, 7,462 classes, exact agreement with an independent naive evaluator)
- [x] Hand-picked evaluator cases (Section 13.1)
- [x] Fast statistical fairness tests (Section 13.2; ADR-010)
- [x] Evaluator speed: about 47M evals/s in Node (`npm run bench:eval`); at least 10M/s asserted in the suite
- [x] `test:long`: exhaustive 7-card oracle (133,784,560 hands, 4,824 classes) and 10M random deals
- [x] **Accept:** all Section 13.1 and fast 13.2 tests pass; the evaluator meets its speed target

## Phase 2 — Engine

- [x] `docs/RULES.md` written to match Section 5, including the position-label mapping for 2–9 players
- [x] Public `PlayerView` / `Action` contract in `src/core/view/`, outside `src/core/engine` (ADR-003, ADR-011)
- [x] Table state machine: `dispatch`, typed errors, events (`src/core/engine`)
- [x] Button, blinds, heads-up and the heads-up transition
- [x] Dealing order and burns
- [x] Betting: minimum raise, short all-in, reopening, BB option (ADR-012)
- [x] Main and side pots, odd chips, uncalled bets
- [x] Showdown order and mucking
- [x] JSON serialization between hands (`snapshot` / `restore`), rabbit-hunt support, event redaction
- [x] Property tests (chip conservation, termination, legality, button/blinds) over 10,000 random games
- [x] Every mandatory scenario test from Section 13.1
- [x] **Accept:** property tests and all scenarios pass

## Phase 3 — Equity

- [x] Exact enumerator (vs random hands within budget; hand vs hand) (ADR-013)
- [x] Exact heads-up preflop table for the 169 classes (`npm run gen:preflop`)
- [x] Monte Carlo engine (standard-error stopping at 0.25 pp, time cap, progressive results)
- [x] Equity worker, with caching and cancellation (`src/workers/`)
- [x] Outs and draw probabilities, pot odds, preflop class and percentile (ADR-014)
- [x] Reference-value tests; exact vs. Monte Carlo agreement tests; brute-force table check in `test:long`
- [x] **Accept:** every Section 7.2 reference value is met, and the two engines agree

## Phase 4 — Playable UI (functional)

- [x] i18n module (`pt-BR.ts`, number formatting, card labels, pt-BR hand names)
- [x] Menu, Setup (2–9 players, buy-in presets and custom, blinds validation, table preview, remembered setup), Table, action bar (presets, slider, steppers, input, pre-actions), pause menu, Summary/Victory
- [x] Temporary rule-based NPC (ADR-016)
- [x] Complete games playable from 2 to 9 players on mobile (GameController, ADR-015)
- [x] **Accept:** e2e flows for setup, play and bust pass on the mobile viewports (all five projects)

## Phase 5 — AI

- [x] `PlayerView`-only brains and the information-boundary test (decisions identical with randomized hidden cards)
- [x] Style profiles and preflop ranges (2–9 players, position, push/fold) (ADR-017)
- [x] Range narrowing and opponent modeling
- [x] Postflop decision model, sizing, mixed strategies, tilt
- [x] AI worker with a time budget and a fallback heuristic (`NpcDriver`)
- [x] `docs/AI.md` with style targets per table size
- [x] Simulation harness (`npm run sim`) and exploit checks (`test:long`)
- [x] Setup: per-opponent style choice or "Aleatório" (realistic mix, at most two maniacs)
- [x] **Accept:** style stats within target (20k-hand calibration run: all six in range; the `tests/long/ai-sim.test.ts` 100k-hand run passes 4/4 in about 29 min); boundary test passes; exploit checks pass; decisions stay well inside the time budget

## Phase 6 — Features

- [x] Odds panel (equity via the worker, outs and draw odds, pot odds with a call assessment, preflop class; collapsible, with a header toggle)
- [x] Time bank (ring and bank bar, refill, "Ausente" and "Voltar") (ADR-018)
- [x] Rabbit hunt (dimmed cards, on/off setting)
- [x] Hand history (IndexedDB, off by default), replayer, PokerStars-style export (ADR-019)
- [x] Settings screen (every Section 11 item, validated storage, "Restaurar padrões")
- [x] Autosave and resume ("Continuar partida") (ADR-020)
- [x] **Accept:** related e2e flows pass (`tests/e2e/features.spec.ts` on all five viewports); history defaults to OFF and records nothing when OFF

## Phase 7 — Polish

- [x] Full visual design and design tokens (ADR-024)
- [x] Event-driven animations in the correct dealing order (ADR-025)
- [x] Sound and haptics (synthesized, ADR-025)
- [x] "Como jogar" guide
- [x] Accessibility (axe clean on all screens and viewports, live region, labelled cards)
- [x] PWA and performance budgets (Section 12): Lighthouse mobile 98/100/100, initial JS 111 KB gzipped, no long tasks in play, offline play
- [x] Visual regression baselines (generated in CI, ADR-023)
- [x] `docs/QA.md` manual checklist, with every agent-verifiable item done
- [~] **Accept:** Section 12 budgets met; baselines generated, **owner approval pending**; QA checklist complete except the owner-only on-device items in `docs/QA.md`

## Phase 8 (optional) — Fairness proof

- [x] SHA-256 deck commitment with salt, published before each hand (badge on the table; the full hash is in its label, its tooltip and the history) (ADR-026)
- [x] Reveal of the deck and salt in the history, with a "Prova de justiça" panel and a "Verificar" button that recomputes the hash and checks every seen card against its deal position
- [x] Tests: NIST vectors, WebCrypto agreement, tamper detection, controller and history integration, e2e flow

---

# Version 2 (AGENTS.md Part II, Sections 17–29)

Phase V1 is done. Phases V2–V7 were withdrawn by the owner (AGENTS.md §17.4).

## Phase V1 — Bluffing and odds panel

- [x] Shared bet classification module `ai/postflop/classify.ts` (value bet, semi-bluff, pure bluff, bluff opportunity) (18.1)
- [x] Bluff probability model: `base(style, street) × modifiers` (fold equity, opponents, position, board story, blockers, showdown value, sizing, recent history, tilt, personal multiplier) (18.3, ADR-029)
- [x] Bluffing sanity rules (18.4)
- [x] Simulator metrics: pure-bluff rate per street, river bluff share, c-bet, bluff success, bluff-raise (18.5)
- [x] Style targets for 2, 4 and 9 players in `docs/AI.md` (18.2)
- [x] Tests: 18.2 ranges over 100,000 hands, TAG vs. station/folder bots, Maníaco not adapting (`tests/long/ai-bluff.test.ts`, 3/3); modifiers, sanity rules and style ordering in CI (`tests/unit/bluff.test.ts`, `tests/unit/ai.test.ts`); information boundary with bluffing active (18.5)
- [x] Odds panel with three states: Desligado / Minimizado (default) / Expandido, remembered between games (19)
- [x] e2e: minimized on a fresh profile; expand/minimize persists after reload; swipe down minimizes; off stops all display computation (`tests/e2e/odds-panel.spec.ts`) (19)
- [x] **Accept:** all 18.2 ranges met in the simulator (100,000 hands, seed 2027, table in `docs/AI.md`); 18.5 tests pass; the odds panel starts minimized and persists its state

## Phases V2–V7 — withdrawn by the owner (2026-09-29)

The realistic 3D table was discarded after the owner tested the Phase V2 preview (AGENTS.md §17.4, ADR-030). None of the Phase V2–V7 tasks will be done. The spike's code is recoverable at commit `3c5ac08`.

## Phase W1 — Clean web-app redesign (AGENTS.md §30)

- [x] Direction chosen by the owner (clean web app, light and dark) and written into `AGENTS.md` §30 (ADR-031)
- [x] Semantic design tokens with light and dark themes; the dark blocks are kept in sync by a test (30.2)
- [x] "Tema" setting (Automático / Claro / Escuro), persisted, applied before the first paint (30.2)
- [x] Every screen restyled flat: menu, setup, table, action bar, odds panel, summary, history and replayer, settings, guide, fairness panel; new app icon (30.1)
- [x] No casino styling left, and no hardcoded colors in component styles (`tests/unit/theme.test.ts`)
- [x] axe checks pass in both themes on every screen (`tests/e2e/a11y.spec.ts`)
- [x] Visual regression baselines for portrait/landscape × light/dark regenerated in CI (commit `908adc6`)
- [ ] **Accept:** the owner approves the deployed preview on their phone

## Phase X1 — Game feel (AGENTS.md §31.1)

- [x] Visible action timer above the action bar, with the time bank state and a warning color (31.1.1)
- [x] Equity hidden by default: "Ver probabilidades" pill, no computation while minimized (31.1.2)
- [x] Shared pacing table: slower deal, burn card, flop card by card, street pause (31.1.3, ADR-032)
- [x] Fold animation to the muck (31.1.4)
- [x] Sequential showdown in showdown order (31.1.5)
- [x] Pot and stack count-up (31.1.6)
- [x] NPC thinking dots (31.1.7)
- [x] Sliding dealer button (31.1.8)
- [x] pt-BR plurals "Três" and "Dez" (31.1.9)
- [x] Tests: `tests/unit/pacing.test.ts`, `tests/e2e/game-feel.spec.ts`, odds tests updated to the hidden pill; visual baselines regenerated (commit `37112d0`)
- [ ] **Accept:** the owner approves the feel on their phone

## Phase X2 — Learning aids (AGENTS.md §31.2)

- [x] Made hand always visible next to the user's cards (`app/made-hand.ts`) (31.2.1)
- [x] Opponent profile sheet from public information only (`app/opponent-stats.ts`, saved with the game) (31.2.2, ADR-033)
- [x] Hand log sheet from the header (31.2.3)
- [x] First-game tips, persisted as `tipsSeen`; "Como jogar" can show them again (31.2.4)
- [x] Tests: `tests/unit/learning.test.ts`, `tests/e2e/learning.spec.ts`; visual baselines regenerated in CI (commit `adb477c`)
- [ ] **Accept:** the owner approves on their phone

## Phase X3 — Game modes (AGENTS.md §31.3)

- [ ] Tournament mode with rising blinds
- [ ] Opponent level
- [ ] Lifetime statistics

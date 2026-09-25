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
- [~] **Accept:** style stats within target (20k-hand calibration run: all six in range; the 100k-hand `test:long` run is recorded in HANDOFF); boundary test passes; exploit checks pass; decisions stay well inside the time budget

## Phase 6 — Features

- [ ] Odds panel
- [ ] Time bank
- [ ] Rabbit hunt
- [ ] Hand history (IndexedDB, off by default), replayer, export
- [ ] Settings screen
- [ ] Autosave and resume
- [ ] **Accept:** related e2e flows pass; history defaults to OFF and records nothing when OFF

## Phase 7 — Polish

- [ ] Full visual design and design tokens
- [ ] Event-driven animations in the correct dealing order
- [ ] Sound and haptics
- [ ] "Como jogar" guide
- [ ] Accessibility
- [ ] PWA and performance budgets (Section 12)
- [ ] Visual regression baselines
- [ ] `docs/QA.md` manual checklist completed
- [ ] **Accept:** Section 12 budgets met; baselines approved; QA checklist complete

## Phase 8 (optional) — Fairness proof

- [ ] SHA-256 deck commitment with salt, reveal in history, "Verificar" button

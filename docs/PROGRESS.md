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
- [~] GitHub Pages deploy workflow: written and merged; **blocked** until the owner enables Pages (see `HANDOFF.md`)
- [~] **Accept:** `npm run check` is green ✅; the deployed placeholder page loads ⏳ (blocked on Pages being enabled)

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

- [ ] `docs/RULES.md` written to match Section 5 (moved here from Phase 0 by the owner), including the position-label mapping for 2–9 players
- [ ] Public `PlayerView` / `Action` contract in its own module outside `src/core/engine` (ADR-003)
- [ ] Table state machine, `dispatch`, typed errors, events
- [ ] Button, blinds, heads-up and the heads-up transition
- [ ] Dealing order and burns
- [ ] Betting: minimum raise, short all-in, reopening, BB option
- [ ] Main and side pots, odd chips, uncalled bets
- [ ] Showdown order and mucking
- [ ] JSON serialization
- [ ] Property tests (chip conservation, termination, legality) over 10,000+ games
- [ ] Every mandatory scenario test from Section 13.1
- [ ] **Accept:** property tests and all scenarios pass

## Phase 3 — Equity

- [ ] Exact enumerator
- [ ] Monte Carlo engine (standard-error stopping, time cap, progressive results)
- [ ] Equity worker, with caching and cancellation
- [ ] Outs and draw probabilities, pot odds
- [ ] Reference-value tests; exact vs. Monte Carlo agreement tests
- [ ] **Accept:** every Section 7.2 reference value is met, and the two engines agree

## Phase 4 — Playable UI (functional)

- [ ] i18n module (`pt-BR.ts`, number formatting)
- [ ] Menu, Setup, Table, action bar, Summary screens
- [ ] Temporary rule-based NPC
- [ ] Complete games playable from 2 to 9 players on mobile
- [ ] **Accept:** e2e flows for setup, play and bust pass on mobile viewports

## Phase 5 — AI

- [ ] `PlayerView` and the information-boundary test
- [ ] Style profiles and preflop ranges (2–9 players)
- [ ] Range narrowing and opponent modeling
- [ ] Postflop decision model, sizing, mixed strategies, tilt
- [ ] AI worker with a time budget and a fallback heuristic
- [ ] `docs/AI.md` with style targets per table size
- [ ] Simulation harness (`npm run sim`) and exploit checks
- [ ] **Accept:** style stats are within target; the boundary test passes; the exploit checks pass; no decision exceeds its time budget

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

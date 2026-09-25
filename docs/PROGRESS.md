# Progress

Status: `[ ]` todo · `[~]` in progress · `[x]` done and tested. Phases follow `AGENTS.md` Section 14 and MUST be worked in order.

## Phase 0 — Scaffold

- [x] `AGENTS.md` committed to the repository
- [~] `docs/` files created (`PROGRESS.md`, `HANDOFF.md` and `DECISIONS.md` done; `RULES.md` still to do)
- [ ] Vite + React + TypeScript project (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`)
- [ ] Directory structure from Section 4
- [ ] ESLint + Prettier, including the `Math.random` ban
- [ ] Import restriction: `src/ai/` cannot import `src/core/engine` internals
- [ ] Vitest and Playwright set up
- [ ] npm scripts: `dev`, `build`, `preview`, `test`, `test:long`, `e2e`, `lint`, `typecheck`, `check`
- [ ] CI workflow (lint, typecheck, unit, fast statistical, e2e)
- [ ] Manual `test:long` workflow
- [ ] GitHub Pages deploy workflow and placeholder page
- [ ] `vite-plugin-pwa` wired up
- [ ] **Accept:** `npm run check` is green; the deployed placeholder page loads

## Phase 1 — Core

- [ ] Card encoding, parsing and formatting
- [ ] `SecureRng` (crypto, rejection sampling) and a seeded test RNG that production builds cannot reach
- [ ] Fisher-Yates shuffle
- [ ] 7-card evaluator (strength, category, best 5)
- [ ] Exhaustive 5-card oracle test
- [ ] Hand-picked evaluator cases (Section 13.1)
- [ ] Fast statistical fairness tests (Section 13.2)
- [ ] Evaluator speed benchmark (≥ 10M evals/s in Node)
- [ ] **Accept:** all Section 13.1 and fast 13.2 tests pass; the speed target is met

## Phase 2 — Engine

- [ ] `docs/RULES.md` written to match Section 5, including the position-label mapping for 2–9 players
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

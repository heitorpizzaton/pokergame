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

Phases V1–V7 follow Section 28 and MUST be worked in order. Owner actions are listed in Section 29.

## Phase V1 — Bluffing and odds panel

- [ ] Shared bet classification module `ai/postflop/classify.ts` (value bet, semi-bluff, pure bluff, bluff opportunity) (18.1)
- [ ] Bluff probability model: `base(style, street) × modifiers` (fold equity, opponents, position, board story, blockers, showdown value, sizing, recent history, tilt, personal multiplier) (18.3)
- [ ] Bluffing sanity rules (18.4)
- [ ] Simulator metrics: pure-bluff rate per street, river bluff share, c-bet, bluff success, bluff-raise (18.5)
- [ ] Style targets for 2, 4 and 9 players in `docs/AI.md` (18.2)
- [ ] Tests: 18.2 ranges, TAG vs. station/folder bots, Maníaco not adapting, information boundary with bluffing active (18.5)
- [ ] Odds panel with three states: Desligado / Minimizado (default) / Expandido, remembered between games (19)
- [ ] e2e: minimized on a fresh profile; expand/minimize persists after reload; off stops display computation (19)
- [ ] **Accept:** all 18.2 ranges met in the simulator; 18.5 tests pass; the odds panel starts minimized and persists its state

## Phase V2 — 3D technical spike (go/no-go)

- [ ] `TableRenderer` interface; 2D table moved to `ui/table2d/` with no behavior change (20.2)
- [ ] R3F graybox table, 9 seat anchors, portrait and landscape framing (20, 25.3)
- [ ] DOM HUD anchored to projected 3D points (20.2)
- [ ] "Gráficos" setting, quality tiers, auto-downgrade, `2D clássico` fallback, idle rendering (20.3–20.4)
- [ ] 3D code and assets lazy-loaded; initial route budget unchanged (20.2, 26)
- [ ] Headless Blender + MPFB2 pipeline: one character → optimized GLB → seated with a procedural idle (22, 23)
- [ ] `docs/LICENSES.md` and `npm run assets:check` (21.2)
- [ ] Three "look" test renders for the owner
- [ ] **Accept:** owner tested the preview on their phone and chose a look; `Média` targets met on the owner's phone; one-command character pipeline; findings in `DECISIONS.md`

## Phase V3 — Environment and props

- [ ] Room, table, instanced chips, card atlas, dealer button and blind markers (25.1)
- [ ] Baked lighting, HDRI, tone mapping, post-processing per tier (25.2)
- [ ] Chip-amount-accurate betting visuals
- [ ] **Accept:** 25.1–25.2 complete; budgets met; visual baselines approved by the owner

## Phase V4 — Characters

- [ ] Roster of 16+ distinct characters from `art/characters/roster.json` (23.1)
- [ ] Skin, eye and cloth materials (23.2)
- [ ] Shared rig, facial motion, three LODs (23.3)
- [ ] NPC linking, name pools per character, portraits for the 2D fallback (23.4)
- [ ] "Créditos" screen if any CC-BY asset is used (21.1)
- [ ] **Accept:** 16+ characters pass `assets:check`; no duplicates at a table; owner approves the contact sheet

## Phase V5 — Animation

- [ ] Animation layers: seated pose, procedural idle, gestures, IK (24.1)
- [ ] Every event → gesture row in 24.2
- [ ] Scripted gesture library under `art/scripts/anim/` (24.3); optional Mixamo integration
- [ ] Quality rules and reduced motion (24.4)
- [ ] No-tells test and timing inside the Part I delay budget (24.5)
- [ ] **Accept:** every 24.2 row plays in 2-, 6- and 9-seat games; timing in budget; manual QA passes; no-tells test passes

## Phase V6 — Camera, motion graphics and sound

- [ ] Camera modes Jogador / Aérea / Cinemática, readable at 360×640, cinematic moments (25.3)
- [ ] User hole-card DOM overlay; optional user hands (25.3)
- [ ] Motion graphics with GSAP (25.4)
- [ ] CC0 SFX, room ambience with its own volume, positional audio (25.5)
- [ ] **Accept:** all camera modes readable at 360×640; cinematic moments skippable; reduced motion respected; ambience and positional audio with volume controls

## Phase V7 — Polish and hardening

- [ ] Performance pass against Section 26 on real devices; memory and disposal checks
- [ ] Loading experience; final visual QA
- [ ] Docs updated: `RULES.md`, `AI.md`, `LICENSES.md`, `QA.md`
- [ ] **Accept:** every Section 26 budget met; all tests green; owner sign-off after a full game on their phone

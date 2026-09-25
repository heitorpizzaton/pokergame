# Handoff log

Newest entry on top. Each entry: agent, date, what was done, what is half-done, exact next step, known issues, verification commands.

---

## 2026-09-25 (session 1, part 3) — Claude — Phase 1 core

**Branch:** `feat/phase-1-core` (PR to `main`; merged only with CI green). Also merged PR #4, which restricts the Playwright Chromium fallback to local runs so CI always uses the official browser.

### Session start note

`npm run check` was green on `main` at the start of Phase 1.

### Done

- `src/core/cards`: branded integer cards (`rank * 4 + suit`), parse and format, a fresh ordered deck and a fresh shuffled deck per call (ADR-007).
- `src/core/rng`:
  - The `Rng` interface and `CryptoRng` (buffered `crypto.getRandomValues`).
  - Rejection-sampled `uniformIntBelow` and the Fisher-Yates `shuffleInPlace`.
  - `SeededRng` (xoshiro128\*\*) for tests only. It is not exported from the index, and a lint rule forbids importing it anywhere under `src/` (ADR-009).
- `src/core/eval`: bitmask evaluator with 8,192-entry tables for 5, 6 or 7 cards, plus `HandCategory`, `isRoyalFlush`, `compareHands` and `bestFive` (ADR-008). It runs at about 47M evals/s in Node (`npm run bench:eval`).
- Tests (ADR-010):
  - An exhaustive 5-card oracle: category counts, 7,462 classes, and exact agreement with an independent naive evaluator.
  - Hand-picked cases from §13.1.
  - Properties: a 6/7-card value equals the best 5-card subset, and the value ignores card order and suit relabelling.
  - A speed test (at least 10M/s).
  - RNG tests: rejection sampling and modulo bias.
  - Fairness: 200k crypto shuffles (chi-square with Bonferroni correction) and starting-hand frequencies.
  - Statistics helpers checked against SciPy.
  - `test:long`: all 133,784,560 seven-card hands (category counts, 4,824 classes) plus 10M random deals. It runs in about 10 s.
- `npm run check` is green locally (135 unit/property/statistical tests and 15 e2e tests). `npm run test:long` is green locally.

### Half-done / blocked on the owner

- **Phase 0 deploy is still blocked.** The repository is public now, but Pages has not been switched on: `configure-pages` reports "Get Pages site failed: Not Found", and creating the site from the workflow token is refused. The owner must set **Settings → Pages → Build and deployment → Source: GitHub Actions** and then re-run **Deploy to GitHub Pages**. Phase 0 is accepted once its `smoke` job is green.

### Exact next step

Start Phase 2 on `feat/phase-2-engine`:

1. Write `docs/RULES.md` from Section 5, including the position-label mapping for 2–9 players, with one shared function for it in `src/core/engine`.
2. Define the public `PlayerView` / `Action` contract **outside** `src/core/engine` (for example `src/core/view/`), per ADR-003, and add it to the allowed imports in `tests/unit/lint-rules.test.ts`.
3. Build the table state machine with an injected `Rng`, and write the mandatory scenario tests from §13.1 first.

### Known issues

- Deploy is blocked on the owner enabling Pages (above).
- The evaluator's pt-BR hand names ("Full House, Reis cheios de Setes") are not built yet. They belong in the i18n layer, from `HandCategory`, the rank nibbles of `HandValue` and `bestFive` (Phase 4).

### Verify

```sh
npm ci
npm run check
npm run test:long
npm run bench:eval
```

---

## 2026-09-25 (session 1, part 2) — Claude — Phase 0 scaffold

**Branches:** `feat/phase-0-scaffold`, merged to `main` through PR #2 with CI green. This docs update is on `docs/phase-0-handoff`.

### Session start note

`npm run check` could not run at the start of this session because there was no `package.json` yet. The owner said this was expected until Phase 0 exists and should be logged, not treated as a blocker. **From now on `npm run check` exists and MUST be green at session start** (Section 1.1).

### Done

- Full Phase 0 scaffold: Vite 8 + React 19 + TypeScript 6 with the strict flags, the Section 4 tree, ESLint 10 + Prettier, Vitest, Playwright, every npm script, and CI / `test:long` / Pages-deploy workflows. See ADR-002 to ADR-006 in `DECISIONS.md`.
- Architecture lint rules, each guarded by `tests/unit/lint-rules.test.ts`:
  - `Math.random` is banned everywhere.
  - `src/ai` cannot import `core/engine`, UI, app, history, workers or React.
  - `src/core` stays free of React and higher layers.
  - UI JSX cannot contain hardcoded text.
- pt-BR placeholder page with design tokens, the entertainment disclaimer and a PWA (manifest, service worker, original icons from `npm run icons`).
- `npm run check` is green locally: format, lint, typecheck, 28 unit tests, build, 15 e2e tests across 5 viewports. CI on PR #2 and on `main` is green.

### Half-done / blocked on the owner

- **GitHub Pages is not enabled**, so the deploy workflow fails at `actions/configure-pages`: "Create Pages site failed … Resource not accessible by integration". The workflow token cannot turn Pages on. The owner must:
  1. Make Pages available for this repository. It is **private**, and Pages on a private repository needs a paid plan (GitHub Pro or above); otherwise the repository has to be made public.
  2. Go to **Settings → Pages → Build and deployment → Source: GitHub Actions**.
  3. Re-run **Actions → Deploy to GitHub Pages** (it has `workflow_dispatch`) or push to `main`.

  After that, the `smoke` job ("Deployed page loads") fetches the live page, manifest and service worker. When it is green, tick the last Phase 0 items in `PROGRESS.md`.

### Exact next step

1. Check whether the latest **Deploy to GitHub Pages** run on `main` is green. If Pages is now enabled but no run exists since, trigger the workflow manually. If it is green, mark Phase 0 accepted in `PROGRESS.md`.
2. Then start Phase 1 on `feat/phase-1-core`. Begin with `src/core/cards` (encoding, parsing, formatting), then `src/core/rng`: a `SecureRng` interface, a crypto implementation with rejection sampling, and a seeded test RNG that production builds cannot reach.

### Known issues

- Deploy is blocked on the owner enabling Pages (above).
- In the Claude cloud sandbox, Playwright 1.63's own Chromium is not installed. `playwright.config.ts` and `scripts/generate-icons.ts` fall back to `/opt/pw-browsers/chromium` or to `PLAYWRIGHT_CHROMIUM_EXECUTABLE`. Other environments should run `npx playwright install chromium` once.
- `PlayerView` / `Action` must live outside `src/core/engine`, or the `src/ai` lint rule will block them (ADR-003).

### Verify

```sh
npm ci
npm run check
```

---

## 2026-09-25 (session 1, part 1) — Claude

**Branch:** `claude/agents-documentation-cqedyi` (merged to `main` through PR #1).

### Done

- Added `AGENTS.md`, the project spec supplied by the owner, unchanged.
- Added `CLAUDE.md`, which imports `AGENTS.md` so Claude Code sessions load the spec automatically (see ADR-001).
- Created `docs/PROGRESS.md` (a phase and task checklist derived from Section 14), `docs/HANDOFF.md` (this file) and `docs/DECISIONS.md`.

### Half-done

- Phase 0: `docs/RULES.md` does not exist yet. It has to match Section 5 exactly, including the position-label mapping for 2–9 players, so it is scheduled alongside the Phase 2 engine work (see `PROGRESS.md`). Create the file during Phase 0 if the reviewer insists on it.

### Exact next step

Start the Phase 0 scaffold: initialize Vite + React + TypeScript with the strict compiler flags from Section 3, create the `src/` tree from Section 4, then add ESLint (the `Math.random` ban and the `ai/` → `core/engine` import restriction), Prettier, Vitest, Playwright and the npm scripts. `npm run check` must be green before the CI and deploy workflows are added.

### Known issues

- The repo has no `package.json` yet, so `npm run check` (session-start step 2) cannot run until Phase 0 lands.
- The session harness required the branch name `claude/agents-documentation-cqedyi` instead of the `feat/phase-…` convention in Section 1.2. Later work should use the convention.

### Verify

```sh
git log --oneline -5
ls AGENTS.md CLAUDE.md docs/
```

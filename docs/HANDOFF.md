# Handoff log

Newest entry on top. Each entry: agent, date, what was done, what is half-done, exact next step, known issues, verification commands.

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

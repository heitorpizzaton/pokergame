# Handoff log

Newest entry on top. Each entry: agent, date, what was done, what is half-done, exact next step, known issues, verification commands.

---

## 2026-09-25 — Claude

**Branch:** `claude/agents-documentation-cqedyi` (not merged to `main` yet).

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

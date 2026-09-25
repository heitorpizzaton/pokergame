# Architecture Decision Log

Every non-obvious technical choice, newest on top. Format: context, decision, alternatives considered, consequences.

---

## ADR-006 — `npm run check` includes the e2e suite

- **Date:** 2026-09-25
- **Context:** Section 3 defines `check` as "runs everything fast"; Phase 0 is accepted when `check` is green.
- **Decision:** `check` runs `format:check`, `lint`, `typecheck`, `test` and `e2e` in that order. The `e2e` script builds first, so `check` also proves that the production build works. It currently takes well under a minute.
- **Alternatives considered:** leaving e2e out of `check` and relying on CI only, rejected because an agent could then hand off a broken UI with a green local check.
- **Consequences:** if visual regression (Phase 7) makes e2e slow, split out a `check:fast` script and log it here instead of dropping e2e silently.

## ADR-005 — GitHub Pages deploy as a separate workflow with a smoke test

- **Date:** 2026-09-25
- **Context:** Section 3 requires a deploy to GitHub Pages on every push to `main`, and Phase 0 acceptance requires that the deployed page loads.
- **Decision:** `.github/workflows/deploy.yml` runs on every push to `main` (and on demand). It gets the base path from `actions/configure-pages` and passes it to Vite as `BASE_PATH`, deploys with `actions/deploy-pages`, then runs a `smoke` job that fetches the deployed page, the manifest and the service worker. `configure-pages` runs with `enablement: true` so Pages is switched on automatically when the token allows it.
- **Alternatives considered:** a deploy job inside `ci.yml` gated on the test jobs, rejected to keep CI (which also runs on pull requests) free of `pages: write` and `id-token: write` permissions. `main` only receives changes that are already green under the collaboration protocol. A relative `base: './'`, rejected because the service worker scope and manifest `start_url` need an absolute path.
- **Consequences:** local builds use `/` as the base; only the Pages build uses `/<repo>/`. Client-side routing (Phase 4) must respect `import.meta.env.BASE_URL`.

## ADR-004 — End-to-end tests run on Chromium at five viewports

- **Date:** 2026-09-25
- **Context:** Section 13.3 lists iPhone SE (375×667), Pixel 7, iPad and desktop 1440×900. Section 2.8 requires every screen to work at 360×640. Playwright's `iPhone SE` descriptor is the first-generation 320×568 phone.
- **Decision:** five Playwright projects, all on Chromium: `min-360x640` (Galaxy S5 descriptor), `iphone-se` (`iPhone SE (3rd gen)`, 375×667), `pixel-7`, `ipad` (`iPad (gen 7)`) and `desktop` (1440×900). The device descriptors supply viewport, touch and user agent; the engine is always Chromium.
- **Alternatives considered:** running the iPhone and iPad projects on WebKit, deferred because it adds a second browser download to every CI run while there is no UI to test yet. Revisit in Phase 4 or 7, when real iOS-specific layout exists.
- **Consequences:** when Playwright's own Chromium is missing, `playwright.config.ts` uses `PLAYWRIGHT_CHROMIUM_EXECUTABLE`, or the sandbox's preinstalled `/opt/pw-browsers/chromium`. CI always installs the matching browser.

## ADR-003 — Architecture rules enforced by ESLint and guarded by a test

- **Date:** 2026-09-25
- **Context:** Sections 2.1, 2.7, 4 and 8.1 require the `Math.random` ban, the AI information boundary, a pure `src/core`, and all UI strings in i18n to be enforced by tooling.
- **Decision:** in `eslint.config.ts`:
  - `no-restricted-properties` bans `Math.random` everywhere, including computed access and destructuring.
  - `no-restricted-imports` stops `src/ai` from importing `core/engine`, UI, app, history, workers or React.
  - `no-restricted-imports` stops `src/core` from importing React, Zustand or any higher layer (`ai`, `ui`, `app`, `history`, `workers`, `i18n`).
  - `no-restricted-syntax` rejects JSX text containing letters in `src/ui` and `src/app`.

  `tests/unit/lint-rules.test.ts` lints probe snippets and fails if any rule is removed or weakened. This was verified by deleting two of the rules, which made 17 tests fail.
- **Alternatives considered:** `eslint-plugin-import`'s `no-restricted-paths` (resolves aliases, but adds a plugin and resolver for a codebase that uses only relative imports); dependency-cruiser (heavier, and a second tool to maintain).
- **Consequences:** `PlayerView` and `Action` MUST NOT be defined inside `src/core/engine`, or `src/ai` cannot import them. Phase 2 must place this public contract in its own module (for example `src/core/view/`) and add it to the allowed list in the test. The Section 8.1 runtime test (NPC decisions unchanged when hidden cards are randomized) is still required in Phase 5.

## ADR-002 — Toolchain versions and deferred dependencies

- **Date:** 2026-09-25
- **Context:** Section 3 names the stack but not versions.
- **Decision:** the current majors at scaffold time: React 19, Vite 8 with `@vitejs/plugin-react`, TypeScript 6, ESLint 10 (flat config in TypeScript, loaded through `jiti`) with `typescript-eslint` `strictTypeChecked`, Prettier 3, Vitest 5, fast-check 4, Playwright 1.63 and `vite-plugin-pwa` 1.3. Node 22.18+ (`.nvmrc` pins 22), which runs `scripts/*.ts` directly through built-in type stripping. Styling uses CSS Modules (built into Vite, no extra dependency). Framer Motion, Zustand and Comlink are added in the phase that first uses them, so Phase 0 carries no unused dependencies.
- **Alternatives considered:** vanilla-extract, rejected for now because CSS Modules need no build plugin and meet the spec equally.
- **Consequences:** `tsconfig.base.json` holds the strict flags from Section 3. The app, tests and tooling each have their own `tsconfig.*.json`, and `tsc -b` checks all three.

## ADR-001 — `CLAUDE.md` imports `AGENTS.md`

- **Date:** 2026-09-25
- **Context:** `AGENTS.md` is the single source of truth, and every agent MUST read it at session start. Claude Code loads `CLAUDE.md` into context automatically, but it does not reliably load `AGENTS.md`.
- **Decision:** add a minimal `CLAUDE.md` that only points to `AGENTS.md` and imports it with `@AGENTS.md`. It holds no rules of its own, so the two files can never disagree.
- **Alternatives considered:** duplicating the spec into `CLAUDE.md`, rejected because two copies would drift; relying on each agent to remember to open `AGENTS.md`, rejected because it depends on discipline rather than tooling.
- **Consequences:** any rule change goes into `AGENTS.md` only. `CLAUDE.md` changes only if the import mechanism changes.

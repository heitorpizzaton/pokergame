# Architecture Decision Log

Every non-obvious technical choice, newest on top. Format: context, decision, alternatives considered, consequences.

---

## ADR-012 — Rule interpretations fixed by the engine

- **Date:** 2026-09-25
- **Context:** Section 5 leaves some details open, and a few standard poker rules conflict with the product rules.
- **Decision (all documented in `docs/RULES.md` and covered by tests):**
  - **Folding when checking is free** is rejected by the engine (`FoldWhenCheckAvailable`), not just hidden by the UI. This enforces the NPC sanity rule (Section 8.2.9) by construction.
  - **Short big blind:** the amount to call stays the **full** big blind for players who can still act. When only all-in opponents remain, a player only needs to match their largest commitment, and the rest is returned as uncalled.
  - **Raises need a responder:** raising (or betting) is not offered when every other live player is all-in.
  - **Reopening:** a player who has already acted may raise again only if the current bet has grown by at least `minRaise` since they last acted. This gives the TDA behaviour for single short all-ins (no reopen) and for cumulative short all-ins (reopen).
  - **Muck policy:** a player shows at showdown if their hand can win or tie a pot they are eligible for (compared with hands already shown), if it was already revealed in an all-in runout, or if their `autoMuck` flag is off. Otherwise they muck.
  - **Position labels:** the first player to act preflop in a 4+ player game is always UTG, and late positions are CO, HJ, LJ counting back from the button (`docs/RULES.md` §3).
  - **Places:** players who bust in the same hand are ranked by their stack at the start of that hand; equal stacks share the better place.
- **Alternatives considered:** allowing a fold when checking is free and filtering it in the UI and AI, rejected because every consumer would then have to remember it; charging only the posted short big blind, rejected in favour of the common tournament rule.
- **Consequences:** the AI never needs its own "don't fold when checking is free" guard, since the engine rejects the action. The UI's pre-action "Passar/Desistir" box must send `check` whenever checking is legal.

## ADR-011 — Engine API: command dispatch, events, and a public view contract

- **Date:** 2026-09-25
- **Context:** Section 4.1 asks for a deterministic, framework-agnostic state machine driven by `dispatch`, emitting events, serializable, and with an RNG injected. Section 8.1 requires the AI to see only a `PlayerView`.
- **Decision:**
  - **Commands:** `PokerEngine.dispatch(command)` takes `startHand`, `act` or `reveal` and returns the list of events it produced. A rejected command throws a typed `EngineError` and leaves the state unchanged (property-tested).
  - **Automatic flow:** the engine advances streets, runouts, showdowns, eliminations and game end on its own, so the UI only replays events with its own timing.
  - **Public contract:** `PlayerView`, `PlayerAction`, `LegalActions` and related types live in `src/core/view/`, **outside** `src/core/engine`, so `src/ai` can import them (ADR-003). `engine.viewFor(seat)` builds the view. Hole cards in `HoleCardDealt` events are hidden by `redactEvent(event, viewerSeat)`.
  - **Save/restore:** `snapshot()` works only between hands, drops the completed hand (and its deck), and is JSON-safe. `PokerEngine.restore(snapshot, rng)` validates the chip total.
  - **Rabbit hunt:** `rabbitHunt()` reads the remaining deck of the completed hand with burns respected. It returns `null` after a showdown or while a hand is running.
  - **Testing:** tests rig decks with `ScriptedRng` plus `shuffleScript` (`tests/support/engine-harness.ts`), which inverts the Fisher-Yates shuffle.
- **Alternatives considered:** a pure reducer `(state, action) => [state, events]`, rejected because the private deck and injected RNG fit a class with private fields better, while commands and events remain plain data; letting the UI read the raw state, rejected because it would leak hidden cards.
- **Consequences:** Phase 4 drives the table with `dispatch`, renders from `viewFor(userSeat)` and animates from redacted events. Phase 5 builds the AI on `PlayerView` only.

---

## ADR-010 — Fairness and evaluator test methodology

- **Date:** 2026-09-25
- **Context:** Sections 7.1, 13.1 and 13.2 require exhaustive oracles, statistical tests "at a significance of 0.001" and a speed target, and Section 15 forbids flaky or loosened tests.
- **Decision:**
  - **Shuffle uniformity (200,000 crypto shuffles):** one combined chi-square over the 52 × 52 position × card table (df = 51 × 51) at alpha = 0.001, plus the 52 per-position tests with a Bonferroni-corrected alpha of 0.001 / 52 each. Running 52 independent tests at 0.001 would give CI a ~5% false-alarm rate. Starting-hand frequencies (pocket pair, suited, AA) are checked against normal-approximation binomial bounds at alpha = 0.001.
  - **Deterministic seeded check:** all 24 orderings of 4 items over 240,000 seeded shuffles guard the Fisher-Yates index bounds without any flakiness.
  - **Mutation check:** replacing `rng.int(i + 1)` with `rng.int(n)` made 4 of the 6 fairness tests fail.
  - **Five-card oracle:** all 2,598,960 hands. The category counts must match, there must be exactly 7,462 distinct values, and every value must equal the one from an independent naive evaluator (`tests/support/naive-eval.ts`, which shares no code with `src/core/eval`).
  - **Seven-card checks:** a property test compares 6- and 7-card values with the best five-card subset under the naive evaluator. `test:long` enumerates all 133,784,560 seven-card hands (category counts, 4,824 distinct values) and checks 10M random deals against the exact frequencies. It runs in about 10 s, but stays in `test:long` as Section 7.1 specifies.
  - **Statistics helpers:** checked against SciPy reference values.
  - **Speed:** `tests/unit/eval-speed.test.ts` asserts at least 10M evaluations per second (best of 3) on whichever machine runs the suite, and prints the rate to the CI log. `npm run bench:eval` gives the full measurement.
- **Alternatives considered:** a fixed seed for the crypto-RNG tests, rejected because it would test only the algorithm, not the production RNG; a lower CI speed floor, rejected because the measured margin is about 5×.
- **Consequences:** the expected false-alarm rate of the fast fairness suite is about 0.5% per run (five tests at 0.001). A failure there is treated as real and investigated, never re-run away.

## ADR-009 — RNG design

- **Date:** 2026-09-25
- **Context:** Section 6 requires `crypto.getRandomValues`, rejection sampling, separate streams for the deck and the NPCs, and a seeded RNG that production builds cannot reach.
- **Decision:**
  - **Interface:** `Rng` (`nextUint32()`, `int(n)`) is what Section 3 calls the "SecureRng interface". It is named `Rng` because the seeded test implementation is not secure.
  - **`CryptoRng`:** buffers 4,096 `Uint32` values per `getRandomValues` call. Each instance is an independent stream, so the engine and the AI each create their own.
  - **Rejection sampling:** `uniformIntBelow` rejects raw values at or above `2^32 - (2^32 mod n)`, which is tested with scripted sources and a bias-sensitive bound (n = 3 × 2^30).
  - **`SeededRng`:** xoshiro128\*\* seeded through splitmix32. It lives in `src/core/rng/seeded-rng.ts`, is **not** exported from `src/core/rng/index.ts`, and an ESLint rule rejects any import of it from `src/` (guarded by `tests/unit/lint-rules.test.ts`). Tests and scripts may import it.
- **Alternatives considered:** a runtime `import.meta.env.PROD` guard inside `SeededRng`, rejected because `src/core` must also run outside Vite (the Node simulation harness in Phase 5), and the lint rule already keeps it out of every bundle.
- **Consequences:** Phase 2 must inject an `Rng` into the engine. The AI's RNG (Phase 5) must be a separate `CryptoRng` instance.

## ADR-008 — Hand evaluator: bitmask algorithm with 8,192-entry tables

- **Date:** 2026-09-25
- **Context:** Section 7.1 requires a fast 7-card evaluator (at least 10M/s in Node, 1M/s on a mid-range phone) that returns a comparable strength, the category and the best 5 cards.
- **Decision:**
  - **Algorithm:** a bit-parallel evaluator in the style of Steve Brecher's Holdem Showdown, working on per-suit 13-bit rank masks with four lookup tables of 8,192 entries (popcount, top rank, highest straight, top five ranks packed), about 50 KB built at load.
  - **Value layout:** `category << 20 | five 4-bit ranks`, so plain integer comparison orders hands.
  - **Card count:** 5, 6 or 7 cards through the same code.
  - **Entry points:** `evaluateMasks` is the allocation-free core for equity loops. `evaluate(cards)` is the convenience entry point. `bestFive` tries every 5-card subset, which is fine because it runs once per showdown, not in hot loops.
  - **Speed:** measured at 38–47M evaluations per second in Node (`npm run bench:eval`) and about 50M/s inside Vitest.
  - **Table access:** the tables are aliased to module-local constants. Vitest's module runner compiles each access to an imported binding into a getter call, which had cut throughput to about 9M/s.
- **Alternatives considered:** Cactus Kev with a perfect hash, which needs 21 five-card lookups per 7-card hand; the Two Plus Two table, which is about 130 MB and far too large for a PWA; HenryRLee's PokerHandEvaluator, which is fast but has larger tables and much more machinery than the target requires.
- **Consequences:** hand naming in pt-BR (Section 5.6) is built from `HandCategory`, the rank nibbles and `bestFive` in the i18n layer. `src/core` stays language-neutral.

## ADR-007 — Card encoding

- **Date:** 2026-09-25
- **Context:** cards flow through hot loops (evaluation, equity) and must serialize to JSON (Section 4.1).
- **Decision:** a card is a branded integer `rank * 4 + suit` in [0, 52): rank index 0 = deuce … 12 = ace; suit index 0 = clubs, 1 = diamonds, 2 = hearts, 3 = spades. Text form is `As`, `Td` and so on (language-neutral, for tests, logs and hand-history export). UI labels such as "Ás de Espadas" belong to i18n.
- **Alternatives considered:** `{ rank, suit }` objects, rejected because they allocate and are slower in loops; Cactus Kev 32-bit card words, rejected because they are only useful for that evaluator.
- **Consequences:** `rankOf(card) = card >> 2` and `suitOf(card) = card & 3` are the only decoding primitives; suit order carries no meaning (Section 5.7).

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
- **Consequences:** `enablement: true` cannot create the Pages site with the workflow token ("Resource not accessible by integration"). The owner had to set **Settings → Pages → Source: GitHub Actions** once by hand; after that, deploys work unattended. Local builds use `/` as the base; only the Pages build uses `/<repo>/`. Client-side routing (Phase 4) must respect `import.meta.env.BASE_URL`.

## ADR-004 — End-to-end tests run on Chromium at five viewports

- **Date:** 2026-09-25
- **Context:** Section 13.3 lists iPhone SE (375×667), Pixel 7, iPad and desktop 1440×900. Section 2.8 requires every screen to work at 360×640. Playwright's `iPhone SE` descriptor is the first-generation 320×568 phone.
- **Decision:** five Playwright projects, all on Chromium: `min-360x640` (Galaxy S5 descriptor), `iphone-se` (`iPhone SE (3rd gen)`, 375×667), `pixel-7`, `ipad` (`iPad (gen 7)`) and `desktop` (1440×900). The device descriptors supply viewport, touch and user agent; the engine is always Chromium.
- **Alternatives considered:** running the iPhone and iPad projects on WebKit, deferred because it adds a second browser download to every CI run while there is no UI to test yet. Revisit in Phase 4 or 7, when real iOS-specific layout exists.
- **Consequences:** CI installs the official Playwright browser (`npx playwright install --with-deps chromium`) and never uses a fallback: `playwright.config.ts` ignores the fallback when `CI` is set, so a missing browser fails loudly. Locally only, when Playwright's own Chromium is missing, the config uses `PLAYWRIGHT_CHROMIUM_EXECUTABLE` or the sandbox's preinstalled `/opt/pw-browsers/chromium`. Only Chromium is installed because every project runs on Chromium; if WebKit projects are added, add `webkit` to the install step.

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

# AGENTS.md — Mesa Viva (Texas Hold'em vs NPCs)

> **This file is the single source of truth for this repository.**
> Every AI agent working here (currently **GPT-6 Astra** and **Claude Opus 5.5**, working in alternating sessions, never simultaneously) MUST read this entire file before writing any code, and MUST follow it over any assumption, habit, or default of its own.
> Keywords **MUST**, **MUST NOT**, **SHOULD**, **SHOULD NOT**, **MAY** follow RFC 2119 semantics.
> The project name "Mesa Viva" is a working title and may be changed by the human owner.

---

## 0. Mission in one paragraph

Build a polished, mobile-first, browser-based **No-Limit Texas Hold'em** game in which **one human player** sits at a table with **1 to 8 computer-controlled opponents (NPCs)**, for a total of **2 to 9 seats**. The user chooses the number of players, the buy-in and the blinds. Everyone starts with the same stack and plays until they lose all their chips (freezeout, no rebuys). The deck MUST be **provably uniform and unpredictable**. NPCs MUST decide **only from information a real human in their seat would have**, and MUST play like realistic, distinct human players. All displayed probabilities MUST be **mathematically correct** and verified by automated tests. The UI is in **Brazilian Portuguese (pt-BR)**, with a **modern casino** aesthetic, and MUST work excellently on phones. **No real money is involved in any way.**

---

## 1. Collaboration protocol (two agents, alternating sessions)

The agents do not work at the same time. When one agent's usage limit ends, the other continues. The repository itself is the only memory shared between them, so the following files are mandatory and MUST be kept current:

| File | Purpose |
|---|---|
| `AGENTS.md` | This spec. Change only when the human owner requests it, or to fix a clear error (log it in `DECISIONS.md`). |
| `docs/PROGRESS.md` | Checklist of every phase and task in Section 14, with status: `[ ]` todo, `[~]` in progress, `[x]` done and tested. |
| `docs/HANDOFF.md` | Latest session report (newest entry on top): agent name, date, what was done, what is half-done, exact next step, known bugs, commands to verify. |
| `docs/DECISIONS.md` | Architecture Decision Log: every non-obvious technical choice, with the reason and the alternatives considered. |
| `docs/RULES.md` | The poker rules as implemented, in plain English, with examples. It MUST match Section 5. |

### 1.1 Session start (MUST, in order)
1. Read `AGENTS.md` fully, then `docs/HANDOFF.md` (at least the latest entry), then `docs/PROGRESS.md`.
2. `git pull`, install dependencies, then run `npm run check` (lint, typecheck and tests). If anything is red, **fixing it is your first task**.
3. Continue from the "exact next step" in the handoff, unless it conflicts with this spec.

### 1.2 During the session
- Work on a branch named after the phase or task, for example `feat/phase-2-equity` or `fix/side-pot-odd-chip`. Merge to `main` only when CI is green.
- Use Conventional Commits (`feat:`, `fix:`, `test:`, `refactor:`, `docs:`, `chore:`). Make small, atomic commits.
- `main` MUST always build and pass tests.
- Do not rewrite or delete the other agent's working code without a concrete reason logged in `DECISIONS.md`. Improving it is fine. Replacing it on taste alone is not.
- If you find a bug outside your current task, log it in `HANDOFF.md` under "Known issues". Fix it now only if it is small and safe.

### 1.3 Session end (MUST, even when stopping early)
- Commit all work. If work is incomplete, commit it on the feature branch with a `wip:` prefix. Never leave uncommitted changes.
- Update `PROGRESS.md` and add a new top entry to `HANDOFF.md` that another agent can act on with zero extra context.
- If you notice you are close to your usage limit, stop starting new work and do the handoff **first**.

---

## 2. Non-negotiable principles

1. **Fairness.** Shuffling uses a cryptographically secure RNG with an unbiased Fisher-Yates shuffle (Section 6). `Math.random()` MUST NOT be used anywhere in the codebase; enforce this with a lint rule.
2. **Information boundary.** NPC logic MUST NOT be able to read the deck, other players' hole cards, or future community cards. This MUST be enforced by architecture and types, not by discipline (Section 8.1).
3. **Correct rules.** Implement No-Limit Hold'em exactly as specified in Section 5, including every edge case listed.
4. **Correct math.** Every percentage shown to the user MUST come from exact enumeration or from a Monte Carlo estimate with a stated precision (Section 7), and MUST be covered by tests against known reference values.
5. **Integer chips.** Chip amounts are integers. Floating-point numbers MUST NOT be used for chip arithmetic.
6. **No real money.** No payments, no purchases, no ads, no links to gambling sites, no "buy chips" UI. Show a subtle note on the menu: "Jogo de entretenimento. As fichas não têm valor real."
7. **pt-BR UI.** Every user-facing string lives in the i18n module (Section 11.6). Code, comments, commits and docs are in English.
8. **Mobile first.** Every screen MUST be fully usable on a 360×640 viewport in portrait.
9. **No placeholders in finished features.** A task is "done" only when it is implemented, tested, and has no `TODO` left in its path.

---

## 3. Tech stack (use unless a documented decision replaces it)

- **Language:** TypeScript with `strict: true`, plus `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`.
- **Build:** Vite.
- **UI:** React 18+ with function components and hooks. Framer Motion for animation. CSS Modules or vanilla-extract for styling. No heavy UI kits.
- **State:** Zustand (or equivalent) for UI state. The game engine keeps its own state and is **framework-agnostic**.
- **Workers:** Web Workers (via Comlink or plain `postMessage`) for equity calculation and NPC decisions, so the main thread never blocks.
- **Tests:** Vitest for unit and property tests (with `fast-check`), Playwright for end-to-end tests on mobile and desktop viewports.
- **Quality:** ESLint (including a rule banning `Math.random`) and Prettier.
- **Persistence:** `localStorage` for settings and autosave. IndexedDB for hand history, which can be large.
- **Delivery:** installable PWA (offline-capable) via `vite-plugin-pwa`, deployed to GitHub Pages by a GitHub Actions workflow on every push to `main`.
- **CI:** a GitHub Actions workflow runs lint, typecheck, unit tests, fast statistical tests and e2e tests. Long exhaustive tests run on a separate, manually triggered workflow (Section 13).
- **Scripts:** `npm run dev`, `build`, `preview`, `test`, `test:long`, `e2e`, `lint`, `typecheck`, and `check` (runs everything fast).
- **Assets:** no copyrighted or externally hosted assets. Sounds are synthesized with the Web Audio API or are original files. Avatars are generated (SVG or procedural).

---

## 4. Architecture

```
src/
  core/            # pure TS, zero DOM/React imports
    cards/         # Card, Rank, Suit, Deck (encoding, parsing, formatting)
    rng/           # SecureRng interface, crypto implementation, seeded test implementation
    eval/          # 5/6/7-card hand evaluator, hand naming, best-5 extraction
    engine/        # table state machine, betting logic, pots, showdown, events
    equity/        # exact and Monte Carlo equity, outs, draw probabilities
  ai/              # NPC brains: consumes PlayerView only
    ranges/        # preflop range tables per style and position
    postflop/      # hand-strength, board texture, sizing, bluffing
    model/         # opponent modeling (stats tracking, range narrowing)
    styles/        # style profiles (parameters)
  workers/         # equity.worker.ts, ai.worker.ts
  history/         # hand history recording, storage, export, replay
  ui/
    screens/       # Menu, Setup, Table, Summary, History, Settings
    table/         # Seat, Cards, Chips, Pot, Board, ActionBar, OddsPanel, TimeBank
    anim/          # animation orchestration from engine events
    audio/         # synthesized SFX
    theme/         # design tokens
  i18n/            # pt-BR strings, number formatting
  app/             # bootstrap, routing, PWA registration
tests/             # unit, property, statistical, e2e
docs/
```

### 4.1 Engine design
- The engine is a **deterministic state machine** driven by `dispatch(action)`. Its only side effect is emitting **events**: `HandStarted`, `BlindPosted`, `CardDealt`, `ActionTaken`, `StreetDealt`, `PotsUpdated`, `Showdown`, `PotAwarded`, `PlayerEliminated`, `HandEnded`, `GameEnded`, and so on.
- The UI renders from state and animates from events. The UI MUST NOT contain any poker logic.
- The engine validates every action. Illegal actions are rejected with a typed error, never silently corrected.
- The engine receives an RNG through dependency injection: the crypto RNG in production, a seeded RNG in tests. The seeded RNG MUST be unreachable from production builds (tree-shaken or guarded by a build flag).
- The whole game state MUST be serializable to JSON, for autosave and history.

---

## 5. Game rules (No-Limit Texas Hold'em, freezeout)

### 5.1 Table setup (configured on the Setup screen)
- **Players:** 2–9 total, including the user. Default is 6.
- **Buy-in (starting stack):** chosen by the user, identical for every seat. Offer presets (e.g., 1.000 / 5.000 / 10.000 / 50.000 fichas) plus a custom field. Also show the stack in big blinds (e.g., "100 BB").
- **Blinds:** the user sets the small blind and big blind (BB ≥ 2 × SB is the default suggestion; SB ≥ 1; BB > SB). Validate that the starting stack is at least 10 BB, and warn below 20 BB. Blinds are **fixed** for the whole game. There are no antes.
- **Opponents:** a "Aleatório" (random mix) option is the default. Optionally, the user can pick a style for each seat (Section 8.3).
- **User seat:** the user always appears at the bottom center of the screen. The table rotates visually; the logical seat order is unaffected.
- **Initial button:** chosen uniformly at random with the secure RNG.

### 5.2 Positions and button movement
- Seats are ordered clockwise. Each hand, the **button** moves one active seat clockwise. The **small blind** is the first active seat clockwise from the button, and the **big blind** is the next one. This is the "simplified moving button" used by many online clients. Document it in `RULES.md`.
- **Heads-up (2 players):** the button posts the small blind and acts **first preflop** and **last on every later street**. The other player posts the big blind.
- **Transition to heads-up:** when the table goes from 3 players to 2, assign blinds so that no player posts the big blind twice in a row when avoidable. Add explicit tests for this.
- Eliminated players' seats become empty. Empty seats are skipped for the button, the blinds, dealing and action.
- **Position labels** (shown in UI and used by AI) are derived from the number of active players: BTN, SB, BB, UTG, UTG+1, MP, LJ, HJ, CO. Specify the exact mapping for every count from 2 to 9 in `RULES.md` and in a single shared function.

### 5.3 Dealing order
- Shuffle a fresh 52-card deck at the start of every hand (Section 6).
- **Hole cards:** one card at a time, clockwise, **starting with the small blind** and ending with the button, then a second round in the same order. In heads-up, dealing starts with the big blind (the non-button player), and the button receives the last card.
- **Burn one card** before the flop, before the turn and before the river. Deal the flop as three cards, then the turn, then the river, all taken in order from the top of the shuffled deck.
- The UI animation MUST follow this exact order.

### 5.4 Betting
- **Preflop:** action starts with the first active player left of the big blind (UTG); in heads-up it starts with the button/SB. The big blind has the **option**: if everyone just calls (limps), the BB may check or raise.
- **Postflop:** action starts with the first active player left of the button.
- **Legal actions:** fold; check (only when there is no bet to call); call; bet (minimum 1 BB, or all-in if the stack is smaller); raise; all-in.
- **Minimum raise:** the raise increment MUST be at least the size of the largest previous bet or raise increment on the current street, and at least 1 BB.
- **Short all-in:** an all-in that is smaller than a full raise does **not** reopen betting for players who have already acted and are only facing that short raise; those players may only call or fold. Several short all-ins that together add up to a full raise **do** reopen the action. Implement the TDA-consistent rule, and test it with multi-player scenarios.
- **Fold when checking is free:** the UI MUST NOT offer "Desistir" when "Passar" is available (except via the pre-action checkbox, which then checks instead). NPCs MUST NEVER fold when they can check.
- **Blinds larger than a stack:** a player who cannot cover the blind posts what they have and is all-in.
- **Uncalled bets:** the uncalled portion of a bet is returned to the bettor before pots are awarded, and this is shown in the UI and in the history.
- **Hand ends early** when all but one player fold. The remaining player wins without showing (they MAY choose to show; NPCs occasionally do, per style).
- **All-in runout:** when no further betting is possible, reveal all hole cards of players still in the hand, then deal the remaining streets with a short dramatic pause between them.

### 5.5 Pots
- Build **main and side pots** correctly for any number of all-ins of different sizes.
- Each pot is awarded to the best hand among the players eligible for that pot.
- **Split pots:** divide the pot equally. **Odd chips** go one at a time to the tied winners in seat order starting from the first seat left of the button.
- The UI shows each pot separately (e.g., "Pote principal", "Pote lateral 1") with its amount.

### 5.6 Showdown
- **Order:** if there was a bet or raise on the river, the last aggressor shows first. Otherwise, the first active player left of the button shows first. Players then show clockwise.
- A player who cannot win any pot MAY muck. The user has a setting "Descartar mãos perdedoras automaticamente" (default ON). NPCs muck losing hands, except when they are all-in (all-in hands are always shown) and occasionally per their style.
- Highlight the winning five cards, name the hand in pt-BR (e.g., "Full House, Reis cheios de Setes"), and mark the kicker when it decided the pot.

### 5.7 Hand rankings
- Best 5-card hand out of 7 (2 hole + 5 board). Players may use zero, one or two hole cards ("board plays" is valid).
- Ranking: Royal Flush > Straight Flush > Four of a Kind > Full House > Flush > Straight > Three of a Kind > Two Pair > One Pair > High Card.
- Suits have no rank. The ace plays high (A-K-Q-J-T) or low in the wheel (5-4-3-2-A), where the five is the high card. Straights do not wrap around (Q-K-A-2-3 is not a straight).
- Kickers are compared correctly in every category, including two pair with a counterfeit on the board.

### 5.8 Game end
- **User eliminated:** pause and show the **Summary screen** with the finishing position (e.g., "Você terminou em 4º de 6"), hands played, hands won, biggest pot won, best hand made, VPIP and PFR for the session, and duration. Options: "Assistir até o fim" (NPCs finish the game at turbo speed, with a skip button), "Jogar novamente" (same setup) and "Menu".
- **User wins everything:** show a victory screen with the same stats.
- **Autosave:** save the state between hands. If the app is closed, offer "Continuar partida" on the menu. Saved games MUST NOT store the deck of a hand in progress; always resume at a hand boundary.
- **Pause/Quit:** a menu is reachable during play. Quitting asks for confirmation.

---

## 6. Randomness and fairness

- **Source:** `crypto.getRandomValues` (Web Crypto API).
- **Unbiased integers:** use rejection sampling to generate uniform integers in `[0, n)`. Modulo bias MUST NOT be possible.
- **Shuffle:** a standard Fisher-Yates (Durstenfeld) shuffle over a fresh ordered deck, **every hand**. No reuse, no "continuous shuffle", and no manipulation of any kind (no "action flops", no rigging for drama, no adjustment for the user's results).
- **Separate RNG streams:** the NPC decision randomness (mixed strategies) uses its own secure RNG instance. It MUST NOT consume values from, or be correlated with, the deck RNG.
- **Deck isolation:** the shuffled deck exists only inside the engine's private state. Only dealt cards leave it, and only to the players who are entitled to see them.
- **Statistical tests** are required. See Section 13.2.

---

## 7. Probabilities, equity and the odds panel

### 7.1 Hand evaluator
- Implement a fast 7-card evaluator (for example, a perfect-hash or lookup-table approach). Target: at least 10 million evaluations per second in Node on a modern desktop, and at least 1 million per second on a mid-range phone.
- The evaluator returns a comparable integer strength, the category, and the best 5 cards (used for highlighting and naming).
- **Oracle tests (exhaustive):**
  - All 2,598,960 five-card hands, by category: Straight Flush (including Royal) 40 · Four of a Kind 624 · Full House 3,744 · Flush 5,108 · Straight 10,200 · Three of a Kind 54,912 · Two Pair 123,552 · One Pair 1,098,240 · High Card 1,302,540.
  - All 133,784,560 seven-card hands, by category of the best 5: Straight Flush (including Royal) 41,584 · Four of a Kind 224,848 · Full House 3,473,184 · Flush 4,047,644 · Straight 6,180,020 · Three of a Kind 6,461,620 · Two Pair 31,433,400 · One Pair 58,627,800 · High Card 23,294,460. This belongs to `test:long`.

### 7.2 Equity engine
- **What equity means for the user:** the user's probability of winning the pot at showdown, counting ties fractionally, against the **unknown hands of the opponents still in the hand**. The user cannot know those hands, so the default model is that opponents hold uniformly random cards from the unseen cards. Label this clearly in the UI: "Equity vs. mãos aleatórias".
- **Exact enumeration** whenever the combination count is within a budget (heads-up on the flop, turn and river is always exact; heads-up preflop is exact via the 1,712,304 boards). Otherwise use **Monte Carlo** in a Web Worker, with:
  - a minimum number of iterations and early stopping when the standard error falls below 0.25 percentage points;
  - progressive display (show the estimate immediately, then refine it);
  - a hard time cap so the UI never waits.
- Results are cached per game state and cancelled when the state changes.
- **Reference tests** (tolerance ±0.3 pp for exact results, ±1.0 pp for Monte Carlo):
  - AA vs KK preflop: AA wins about 82%.
  - AA vs one random hand: about 85.2%.
  - A flush draw with 9 outs on the flop, seen to the river: 1 − (38/47 × 37/46) ≈ 34.97%.
  - An open-ended straight draw with 8 outs on the flop, seen to the river: ≈ 31.45%.
  - 9 outs from turn to river: 9/46 ≈ 19.57%.
  - Additional cases MUST be computed by the exact enumerator and cross-checked against the Monte Carlo engine in tests. The two engines MUST agree within tolerance.

### 7.3 Odds panel ("Probabilidades")
- Toggled by a switch in the table header and in Settings. Default is **ON** (the user may prefer it OFF; persist the choice). When OFF, no probability computation should run for display.
- The panel shows:
  - the current made hand in pt-BR (e.g., "Par de Damas");
  - **Equity** vs. random hands for the current number of active opponents;
  - win / tie percentages;
  - **Outs** for the next card, with the cards listed. Discount outs that also improve an opponent's likely draw only in an "advanced" section, and state that it is an estimate;
  - probability of improving **on the next card** and **by the river**;
  - when facing a bet: **pot odds** (call ÷ (pot + call)), the **required equity**, and a simple indicator comparing equity to the required equity ("+EV" / "−EV" vs. random hands);
  - preflop: the starting-hand category and its percentile among the 169 starting hands.
- The panel MUST be compact on mobile: collapsible, never covering the cards or the action bar.
- The panel MUST NOT reveal anything the user could not know. It uses only the user's cards and the board.

---

## 8. NPC artificial intelligence

The goal is NPCs that play like **real humans of different styles and competence levels**: coherent, varied and not trivially exploitable. They should also not be perfect robots. They fold, bluff, make hero calls, over-value hands sometimes and get stubborn, depending on their style.

### 8.1 Information boundary (enforced by types)
- The engine builds a `PlayerView` for the acting NPC. It contains the NPC's own hole cards, the board, every public action in the hand (with amounts and positions), stack sizes, pot sizes, blinds, button position, number of players, and every **card shown publicly at past showdowns** in this game.
- The AI module MUST import nothing from `core/engine` internals. It receives only `PlayerView` and returns an `Action`. Add a lint or import rule plus a test that fails if `ai/` imports engine internals.
- Add a test that runs thousands of hands and asserts that NPC decisions are identical whether or not the other players' hole cards are randomized. This proves the cards are not being read.

### 8.2 Decision model (overview)
1. **Preflop:** style-parameterized range charts by position, number of players, effective stack in BB and the action faced (unopened / limp / single raise / 3-bet / 4-bet+ / all-in). Charts for 2–9 players. Mixed frequencies are allowed (e.g., raise 70%, call 30%).
2. **Range narrowing:** each NPC keeps an estimated range for each opponent, starting from what that position and that opponent's observed tendencies imply, then updated by every action (a Bayesian-style weighting of hand combos). Remove card-removal combos (blockers).
3. **Postflop hand strength:** the NPC's equity **vs. the estimated ranges** of the remaining opponents (not vs. random hands), plus draw potential, computed in the AI worker with a time budget.
4. **Context:** board texture (dry/wet, paired, monotone, connected), position, number of opponents, stack-to-pot ratio, pot odds, implied odds, who was the preflop aggressor, and the street.
5. **Action selection:** value-bet, bluff, semi-bluff, check-raise, check-call, float, fold, with **sizing from a realistic set** (about 25%, 33%, 50%, 66%, 75%, 100% of the pot, overbets for aggressive styles, and all-in), plus small noise. Bluffing SHOULD favor hands with good blockers and equity.
6. **Mixed strategies:** decisions are sampled from probability distributions, not deterministic thresholds, so NPCs are not trivially readable.
7. **Opponent modeling:** track per-opponent statistics in this game (VPIP, PFR, 3-bet, aggression factor, fold to c-bet, went-to-showdown, hands shown). This **includes the user**. NPCs adapt gradually, for example by calling down lighter against someone who bluffs often, or folding more against a rock who suddenly raises big.
8. **Human-like imperfection:** each style has calibrated "leak" parameters (e.g., a calling station over-calls, a maniac over-bluffs, a nit folds too much), and a small general noise level. After a big loss, NPCs MAY enter a mild, short "tilt" state (looser and more aggressive for a few hands), scaled by style (strong players tilt less).
9. **Sanity rules (MUST):** never fold when checking is possible; never fold the absolute nuts; never make an illegal action; never bet less than the minimum; always handle all-in and short-stack situations correctly (push/fold preflop below about 12 BB, using push/fold-style ranges).

### 8.3 Styles (all "standard difficulty": competent humans with personality)

| Style (pt-BR label) | Description | Target VPIP / PFR (6-max-ish, over long simulation) |
|---|---|---|
| Regular sólido (TAG) | Tight-aggressive, disciplined, well-balanced | 20–26 / 16–21 |
| Agressivo (LAG) | Loose-aggressive, applies pressure, bluffs well | 28–36 / 22–30 |
| Pedra (Nit) | Very tight, plays only premium hands, rarely bluffs | 10–15 / 8–12 |
| Pagador (Calling station) | Calls a lot, rarely raises, hard to bluff | 40–55 / 5–10 |
| Maníaco | Hyper-aggressive, huge bluff frequency, big sizes | 50–70 / 35–55 |
| Recreativo (Loose-passive) | Plays many hands, cautious postflop, sometimes spews | 32–45 / 6–12 |

- Targets scale with table size (tighter for full ring). Document the exact targets per table size in `docs/AI.md`.
- The random mix uses weights that feel like a real online table (e.g., more regulars and recreational players than maniacs), with at most two maniacs per table.
- Each NPC gets a **generated name** (a varied, realistic mix of Brazilian and international first names, with no real public figures) and a **procedurally generated avatar** (an SVG face or monogram with a unique palette). A small style badge appears only if the user enables "Mostrar estilo dos NPCs" in Settings (default OFF, so the user has to read the players).

### 8.4 Speed ("thinking time")
- NPCs MUST feel human but fast. The delay depends on decision difficulty:
  - **Normal speed:** 350–1,200 ms (easy decisions near the low end; big river decisions near the high end, **never above 1.5 s**).
  - **Rápido:** 120–400 ms.
- Real computation MUST finish within the delay budget (use a worker with a time cap; fall back to a cheaper heuristic if the budget is exceeded). The UI thread never freezes.
- Speed setting: "Normal" / "Rápido", in Settings and in the pause menu.

### 8.5 AI evaluation harness
- `npm run sim -- --hands 100000 --players 6 --mix random` runs headless NPC-only games using the real engine and AI, and prints per-style statistics (VPIP, PFR, AF, win rate in BB/100, showdown frequency, average decision time).
- Tests assert that each style's stats fall within its target ranges, that no illegal actions occur, that the sanity rules hold, and that a TAG beats a calling station and a maniac over a large sample (positive BB/100).
- Include a simple exploit check: a scripted "always all-in" bot MUST lose over a large sample against a table of regulars, and a scripted "always fold to any bet" bot MUST lose too.

---

## 9. Time bank (user only)

- Settings: action timer "Desligado" / 15 s / 20 s / 30 s (default 20 s), and a time bank of 30 s (default) that starts when the normal timer ends.
- Time bank replenishment: +5 s every 10 hands played, up to a maximum of 60 s.
- Visual: a circular countdown around the user's avatar. It changes color in the last 5 s, with a gentle sound or haptic pulse if enabled. The time bank shows as a separate, distinct bar.
- On timeout: **check** if possible, otherwise **fold**. The user is then marked "Ausente" (away) and auto check-folds until they tap "Voltar".
- NPCs do not use the time bank. Their timing follows Section 8.4.

---

## 10. Optional features selected by the owner

### 10.1 Rabbit hunt ("Ver cartas que viriam")
- Toggle in Settings (default ON).
- When a hand ends **before the river** without a showdown, a button appears briefly: "Rabbit hunt". Tapping it reveals the community cards that **would have been dealt**, taken from the **actual remaining deck order with burns respected** (not a new random draw).
- The result is purely informational. It MUST NOT affect anything, and is shown with a distinct, dimmed style.

### 10.2 Hand history ("Histórico de mãos")
- There is a **switch that is OFF by default** (Settings: "Salvar histórico de mãos"). When OFF, **no hands are recorded**.
- When ON, record every hand of the session in IndexedDB: setup, seats, stacks, positions, the user's hole cards, all actions with amounts and timing, board, showdown cards (only those revealed publicly), pots and results. NPC cards that were never shown MUST NOT be stored in the user-visible history.
- **History screen:** a list of hands (hand number, user's cards, result ±chips, pot size). Each hand opens a **replayer** with step forward/back, auto-play, and street jump, rendered with the same table components.
- **Export:** text export per hand, or for the whole session, in a PokerStars-like hand-history format (English), for compatibility with external tools. Also provide a readable pt-BR summary view.
- A button clears the history, with confirmation.

---

## 11. UI / UX specification

### 11.1 Aesthetic: "modern casino"
- Deep emerald or teal felt with a subtle radial gradient and a procedural noise texture (CSS or SVG, no external images), a rich wood or dark-leather rail, and **gold accents** used sparingly. Glassmorphism panels (blurred, translucent) for the HUD, menus and the action bar.
- High-quality typography: a geometric sans for the UI and tabular numerals for chip amounts. Every font has a system fallback. Fonts load from Google Fonts or are self-hosted.
- Cards: crisp vector cards with large indices designed to be readable on small phones. Option for a **four-color deck** ("Baralho de 4 cores", default OFF). Card backs have an original design.
- Chips: vector chip stacks whose colors map to denominations relative to the blinds.
- Define everything as design tokens in `ui/theme`. Support a reduced-motion mode.

### 11.2 Layout
- **Portrait phone (primary):** a vertical oval table. The user sits at the bottom center, with larger cards. Opponents sit around the oval, at fixed seat positions for each table size from 2 to 9, so it never looks cluttered. The action bar sits at the bottom, in the thumb zone. The odds panel is a collapsible sheet above the action bar.
- **Landscape and desktop:** a horizontal oval table with the same components. Scale responsively; there MUST be no horizontal scrolling.
- Each seat shows the avatar, name, stack (fichas and, optionally, BB, toggleable), current bet in front of it, the dealer button and blind markers, a status ("Desistiu", "All-in", "Ausente"), and a last-action chip ("Aumentou 600").
- Safe-area insets are respected (notches, home indicators). Touch targets are at least 44×44 px.

### 11.3 Action bar
- Buttons: **Desistir** · **Passar / Pagar X** · **Apostar / Aumentar para X** · **All-in**. Labels change with context and show exact amounts.
- The bet sizing control has a slider, `−`/`+` steppers (step = 1 BB, or the SB at small sizes) and a numeric input. Presets: preflop 2,5×, 3×, 4× BB and "Pote"; postflop ⅓, ½, ⅔, ¾ of the pot, "Pote" and "All-in". Clamp to the legal minimum and maximum, and show the legal range.
- **Pre-action checkboxes** while waiting: "Passar/Desistir", "Pagar qualquer valor", "Passar". They are cleared automatically if the situation changes.
- Confirmation is needed only for all-in (optional, Settings, default OFF).

### 11.4 Animation and feedback (driven by engine events)
- The dealer deals cards in the **exact order from Section 5.3**, flying from the dealer position to each seat. Board cards flip with the correct burn timing.
- Bets slide from seats to the betting line. At the end of each street they gather into the pot. Pots slide to the winners.
- Winners get a glow and a highlight on their 5 winning cards, with the hand name shown in a toast.
- An all-in runout gets a dramatic pause between streets. When the odds panel is ON, a live equity bar for all revealed hands updates on each street, since all cards are public at that point.
- Every animation is skippable (tap to fast-forward) and respects the speed setting and reduced motion.

### 11.5 Sound and haptics
- Synthesized or original SFX: card deal, card flip, chip bet, pot collect, check knock, fold swish, all-in, win, timer warning.
- A mute toggle is always one tap away (in the header). Default: sound ON, volume 70%.
- Optional haptics via `navigator.vibrate` (default ON where supported): your turn, timer warning, pot won.

### 11.6 Language (pt-BR)
- All strings live in `i18n/pt-BR.ts`. Numbers use pt-BR formatting (`1.250` fichas; `34,9%`).
- Mandatory glossary:
  - Fold = **Desistir** · Check = **Passar** · Call = **Pagar** · Bet = **Apostar** · Raise = **Aumentar** · All-in = **All-in**
  - Pot = **Pote** · Side pot = **Pote lateral** · Blinds = **Blinds** · Button/Dealer = **Botão (Dealer)** · Stack = **Fichas**
  - Hands: Carta Alta, Par, Dois Pares, Trinca, Sequência, Flush, Full House, Quadra, Straight Flush, Royal Flush
  - Ranks when naming hands: Ás, Rei, Dama, Valete, Dez … Dois (e.g., "Dois Pares, Reis e Setes"; "Sequência até o Dez")
  - Position abbreviations stay in English (UTG, MP, HJ, CO, BTN, SB, BB), which is standard among Brazilian players.

### 11.7 Screens
1. **Menu:** "Nova partida", "Continuar partida" (if an autosave exists), "Histórico" (if enabled), "Configurações", "Como jogar" (a short illustrated rules and hand-ranking guide in pt-BR).
2. **Setup:** players (2–9, stepper plus a visual table preview), buy-in, blinds, opponent mix, and a start button. Remember the last setup.
3. **Table:** as specified above, plus a header with pause, mute, odds toggle, and the hand number and blinds.
4. **Summary / Victory:** Section 5.8.
5. **History and Replayer:** Section 10.2.
6. **Settings:** odds panel, hand history, rabbit hunt, timer and time bank, NPC speed, show NPC styles, stack in BB, four-color deck, auto-muck, all-in confirmation, sound and volume, haptics, reduced motion, and "Restaurar padrões".

---

## 12. Performance and quality budgets

- First load under 2.5 s on a mid-range phone over 4G. JS bundle under 350 KB gzipped for the initial route (lazy-load history and replayer).
- 60 fps animations on mid-range phones. No main-thread task over 50 ms during play.
- Lighthouse on mobile: Performance ≥ 90, Accessibility ≥ 95, Best Practices ≥ 95, PWA installable.
- Accessibility: sufficient contrast; cards have accessible labels (e.g., "Ás de Espadas"); every control is keyboard-operable on desktop; state changes are announced for screen readers (ARIA live region for "Sua vez", results).

---

## 13. Testing requirements

### 13.1 Unit and property tests (fast, run in CI)
- Card encoding and parsing; the RNG integer generator (range and bias checks); the shuffle always producing a valid permutation.
- The evaluator: the 5-card exhaustive oracle, plus hand-picked cases (wheel, steel wheel, board plays, counterfeited two pair, kicker ties, flush vs. flush by the fifth card, full house with two trips on the board).
- The engine (property-based with `fast-check`): chips are **conserved** (sum of stacks plus pots is constant); no negative stacks; every hand terminates; only legal actions are accepted; the button, blinds and action order are correct for every count from 2 to 9 and through eliminations.
- **Mandatory scenario tests:** BB option after limps; a short all-in not reopening action; cumulative short all-ins reopening action; 3-way and 4-way all-ins with different stacks building correct side pots; odd-chip distribution; uncalled bet returns; a player all-in from posting a blind; everyone folding to the BB; the heads-up transition; showdown order with and without river aggression; the user timing out.
- Equity: every reference value in Section 7.2, and agreement between the exact and Monte Carlo engines.
- AI: the information-boundary test from Section 8.1 and the sanity rules from Section 8.2.

### 13.2 Statistical fairness tests
- **Fast (CI):** at least 200,000 shuffles. Chi-square test that each card is uniformly distributed across each deck position, at a significance of 0.001. Starting-hand frequencies: pocket pair ≈ 5.88%, suited ≈ 23.53%, AA ≈ 0.452%, each within computed confidence bounds.
- **Long (`test:long`, manual workflow):** the 7-card exhaustive oracle from Section 7.1; 10+ million random 7-card deals whose category frequencies match the exact probabilities (High Card 17.41%, Pair 43.82%, Two Pair 23.50%, Trips 4.83%, Straight 4.62%, Flush 3.03%, Full House 2.60%, Quads 0.168%, Straight Flush including Royal 0.0311%), within 99.9% confidence intervals; and the AI simulation harness over at least 100,000 hands.

### 13.3 End-to-end (Playwright)
- Viewports: iPhone SE (375×667), Pixel 7, iPad, desktop 1440×900.
- Flows: configure and start a 2-, 6- and 9-player game; play hands with every action type; toggle the odds panel; the timer expiring; rabbit hunt; enable history, play, open the replayer and export; the user busting and reaching the summary; winning (using a seeded debug build); autosave and resume; installing as a PWA (manifest and service worker present).
- Visual regression screenshots of the table at each table size in portrait and landscape.

---

## 14. Delivery phases and acceptance criteria

Work strictly in order. Each phase ends with a green CI, updated docs and a handoff.

**Phase 0 — Scaffold.** Repo structure from Section 4, tooling, lint rules (including the `Math.random` ban and the `ai/` import restriction), CI, the GitHub Pages deploy, and the `docs/` files created.
*Accept:* `npm run check` is green; the deployed placeholder page loads.

**Phase 1 — Core.** Cards, secure RNG, shuffle, the evaluator with the 5-card exhaustive oracle, and the fast statistical tests.
*Accept:* all Section 13.1 and fast 13.2 tests pass; the evaluator meets its speed target.

**Phase 2 — Engine.** The full rules of Section 5 as a pure state machine with events, serialization, and every mandatory scenario test.
*Accept:* property tests pass over 10,000+ random games; all scenarios pass.

**Phase 3 — Equity.** Exact and Monte Carlo engines in a worker, outs, draw probabilities, pot odds.
*Accept:* every reference value in Section 7.2 is met, and the two engines agree.

**Phase 4 — Playable UI (functional).** Menu, Setup, Table, action bar and Summary, using a temporary simple rule-based NPC. The user can play complete games from 2 to 9 players on mobile.
*Accept:* e2e flows for setup, play and bust pass on the mobile viewports.

**Phase 5 — AI.** The full Section 8: styles, ranges, range narrowing, opponent modeling, speed, and the simulation harness.
*Accept:* style stats are within target; the information-boundary test passes; the exploit checks pass; there are no decisions over the time budget.

**Phase 6 — Features.** Odds panel, time bank, rabbit hunt, hand history with replayer and export, Settings, autosave and resume.
*Accept:* the related e2e flows pass; the history switch defaults to OFF and records nothing when OFF.

**Phase 7 — Polish.** The full visual design, animations following the correct dealing order, sound, haptics, the "Como jogar" guide, accessibility, PWA and performance budgets.
*Accept:* the Section 12 budgets are met; visual regression baselines are approved; manual QA checklist in `docs/QA.md` is completed.

**Phase 8 (optional, only if everything else is done) — Fairness proof.** Before each hand, show a SHA-256 commitment of the shuffled deck plus a secret salt. After the hand, reveal them in the history so the user can verify the deck was fixed before the hand began. Include a "Verificar" button that recomputes the hash.

---

## 15. Forbidden practices (instant rejection in review)

- `Math.random()` anywhere; floats for chips; any rigging, adaptive "luck" or outcome manipulation.
- The AI reading engine internals, the deck, or hidden cards; NPCs "knowing" the user's hand.
- Poker logic inside React components.
- Hardcoded user-facing strings outside `i18n`.
- Disabling, skipping or loosening tests to make CI pass, or weakening statistical tolerances without a documented mathematical reason.
- External or copyrighted assets (images, sounds, fonts without a license), or casino and brand trademarks.
- Real-money mechanics, ads, purchases or external gambling links.
- Leaving `main` broken, or ending a session without a handoff.

---

## 16. Definition of Done (for any task)

- The code follows this spec and passes lint, typecheck and all tests.
- New logic has tests, including edge cases.
- The UI works at 360×640 portrait and on desktop, in pt-BR, with no layout overflow.
- The docs (`PROGRESS.md`, `HANDOFF.md`, and `DECISIONS.md` if applicable) are updated.
- There are no `TODO` or `FIXME` markers left in the delivered feature.

---

# AGENTS.md — Part II: Version 2 (bluffing, odds panel, realistic 3D table)

> **Instruction for the agent who receives this file:** append this entire document to the end of `AGENTS.md` (it continues the numbering at Section 17), commit it with `docs: add Part II (v2) spec`, add every Part II task to `docs/PROGRESS.md`, and log the change in `docs/DECISIONS.md`. From then on, `AGENTS.md` (Parts I and II) remains the single source of truth. Where Part II changes a rule from Part I, **Part II wins**, and the changed Part I sections are listed in Section 17.3.
> Everything in Part I (collaboration protocol, fairness, information boundary, integer chips, pt-BR UI, tests, Definition of Done) still applies.

---

## 17. Scope of Version 2

### 17.1 Goals
1. **Bluffing by style:** every NPC style has explicit, measured bluffing frequencies that feel like real people (Section 18).
2. **Minimizable odds panel:** the odds panel starts **minimized** and can be expanded, minimized or turned off (Section 19).
3. **Realistic 3D table:** a new 3D renderer with realistic, distinct seated people, a realistic casino environment, motion graphics and cinematic moments, running in the browser on phones (Sections 20–27).

### 17.2 Hard constraints set by the owner
- **Zero cost.** No paid tools, assets, services or subscriptions. Free tiers are acceptable only if no payment method is required.
- **Browser only.** The game stays a web app / PWA hosted as today. No Unreal, Unity or native builds.
- **No dedicated GPU on the owner's PC.** Nothing in the pipeline may require the owner to run heavy desktop software (no Unreal/MetaHuman, no manual Blender work). All asset creation is **scripted and runs headless in the agent's environment**.
- **The main repository is public.** Only assets whose license allows public redistribution may be committed to it (Section 21).
- **The game engine is unchanged.** `core/` rules, RNG, equity and the event stream stay as they are. The 3D table is a new *view* of the same state and events. The existing 2D table remains as a fallback.

### 17.3 Part I sections changed by Part II
- **7.3 (odds panel):** default state changes from ON to **minimized** (Section 19).
- **8.2 / 8.3 (AI):** bluffing becomes an explicit, measured sub-model (Section 18).
- **8.4 (speed):** NPC delay now also drives body animation. The delay budget is unchanged (Section 24.5).
- **11 (UI/UX):** the table has two renderers, 3D (default where supported) and 2D (fallback) (Section 20).
- **12 (performance budgets):** the 3D table gets its own budgets. The initial route budget is unchanged (Section 26).
- **14 (phases):** new phases V1–V7 are added after Phase 8 (Section 28).

---

## 18. NPC bluffing model

### 18.1 Definitions (used in code, simulator and tests)
All definitions use the NPC's own estimates at decision time, computed from `PlayerView` only.
- **Value bet:** a bet or raise where the NPC's equity vs. the estimated *calling* range of the opponents is ≥ 55%.
- **Semi-bluff:** a bet or raise where that equity is < 55% but the NPC has a real draw (≥ 6 clean outs on the flop or ≥ 6 on the turn), or current equity ≥ 30%.
- **Pure bluff:** a bet or raise with equity < 30% vs. the calling range and no real draw. On the river, any bet or raise with equity < 30% vs. the calling range is a pure bluff.
- **Bluff opportunity:** a decision point where the NPC can bet or raise, holds a hand that would be a semi-bluff or pure bluff if it bet, and the pot is not already multi-way with 4 or more players.

Put these definitions in one shared module (`ai/postflop/classify.ts`) used by both the AI and the simulator statistics, so they can never drift apart.

### 18.2 Target frequencies per style
Measured by the simulator over ≥ 100,000 hands at 6 players, 100 BB. Values are ranges the style's long-run average MUST fall into.

| Style | Pure-bluff rate at bluff opportunities (flop / turn / river) | Share of river bets that are pure bluffs | C-bet frequency (heads-up, as preflop raiser) | Bluff-raise tendency |
|---|---|---|---|---|
| Regular sólido (TAG) | 20–30% / 15–25% / 12–20% | 25–35% | 55–70% | Moderate, blocker-driven |
| Agressivo (LAG) | 30–42% / 25–35% / 20–30% | 35–45% | 65–80% | High |
| Pedra (Nit) | 5–12% / 3–8% / 2–6% | 5–12% | 40–55% | Almost never |
| Pagador (Calling station) | 3–8% / 2–6% / 1–5% | 3–10% | 30–45% | Almost never |
| Maníaco | 50–70% / 45–65% / 40–60% | 50–65% | 80–95% | Very high, large sizes |
| Recreativo | 10–20% / 8–15% / 8–15% | 10–20% | 40–55% | Rare, erratic |

Document the targets for 2, 4 and 9 players in `docs/AI.md` (fewer players means more bluffing; full ring means less).

### 18.3 What makes a bluff more or less likely (all styles, scaled by style)
The bluff probability is computed as `base(style, street) × Π modifiers`, then clamped to [0, 0.95]. Required modifiers:
- **Fold equity estimate:** from the opponent model (fold-to-bet, fold-to-c-bet, went-to-showdown). Strong styles (TAG, LAG) bluff far less against calling stations, including the user if the user calls too much. Weak styles (Recreativo, Pagador) mostly ignore this. The Maníaco ignores it on purpose.
- **Number of opponents:** multiply by roughly 0.55 for each extra opponent beyond one.
- **Position:** in position ×1.2, out of position ×0.85.
- **Board texture and story:** boards that favor the NPC's perceived range (e.g., high-card boards for the preflop raiser) raise the probability. Boards that favor the caller lower it.
- **Blockers:** holding cards that block the opponent's strong hands or the nut draw raises the probability (e.g., the ace of the flush suit on a three-flush board).
- **Showdown value:** hands that can win at showdown by checking are bluffed less (good players turn them into check-calls).
- **Stack-to-pot ratio and sizing:** bluffs use realistic sizes, and the same size distribution as value bets for strong styles (so size does not reveal the hand). Weak styles MAY size bluffs differently (a realistic "leak").
- **Recent history:** a failed bluff shown at showdown reduces bluffing for a few hands (strong styles), or not at all (Maníaco). Tilt (Part I, 8.2.8) multiplies bluffing by 1.3–1.8 for a few hands, less for strong styles.
- **Personal variation:** every NPC instance gets a persistent personal multiplier drawn once at creation from [0.8, 1.2], so two TAGs at the same table do not bluff identically. Draw it with the AI's secure RNG.

### 18.4 Sanity rules for bluffing (MUST)
- Never bluff into a player who is already all-in with no side pot to contest (there is nothing to fold).
- Never "bluff" with the nuts or with a hand classified as a value bet (classification comes from 18.1).
- Never call off a stack to "keep a bluff going" when the hand classification says fold, except for the Maníaco and Pagador leak parameters, which are bounded and documented.
- Bluffs must be legal actions with legal sizes (Part I rules apply).

### 18.5 Tests and metrics
- The simulator (`npm run sim`) prints, per style: pure-bluff rate per street, river bluff share, c-bet frequency, bluff success rate (how often the bluff wins the pot immediately), and bluff-raise frequency.
- Tests assert every Section 18.2 range, plus: a TAG's bluff rate against a scripted calling-station bot is at least 40% lower than against a scripted folding bot; the Maníaco's is not significantly lower.
- The information-boundary test from Part I (8.1) is re-run with the bluff model active.

---

## 19. Odds panel: three states

- States: **Desligado** (off, no computation for display, as in Part I), **Minimizado** (default), **Expandido**.
- **Minimizado:** a small pill ("Equity 42%") above the action bar, never overlapping cards, the action bar or seats. One tap expands it. The equity is still computed so the pill can show it.
- **Expandido:** the full panel from Part I 7.3. A minimize control ("–") and swipe-down gesture return it to minimized.
- The on/off switch stays in the table header and in Settings. The minimized/expanded state is remembered between games.
- **First run:** minimized. If the user expands it, that becomes their remembered state.
- Works identically in the 2D and 3D renderers (it is DOM UI, not 3D).
- e2e tests: default is minimized on a fresh profile; expand/minimize persists after reload; off stops all display computation.

---

## 20. 3D renderer architecture

### 20.1 Stack (all free, MIT/Apache-compatible licenses)
- `three`, `@react-three/fiber`, `@react-three/drei`, `@react-three/postprocessing` (or `postprocessing`), `n8ao` (ambient occlusion), `detect-gpu` (initial quality guess), `gsap` (UI motion timelines).
- **Rendering backend:** WebGL2 is the baseline. The WebGPU renderer MAY be enabled behind a flag only after it is verified on Chrome Android and iOS Safari. Log the decision in `DECISIONS.md`.
- Verify every package license before adding it; record it in `docs/LICENSES.md`.

### 20.2 Renderer contract
- Create `ui/table/TableRenderer` as the interface both renderers implement. Input: the engine's public table state and the event stream (the same data the 2D table uses today). Output: nothing but visuals and sound.
- Move the existing 2D table under `ui/table2d/` with no behavior change. The new one lives in `ui/table3d/`.
- Poker logic MUST NOT enter the 3D code, exactly as in Part I. The 3D renderer never decides anything about the game.
- The **DOM HUD stays DOM**: action bar, odds panel, pre-action checkboxes, menus, toasts, timers. Seat labels (name, stack, last action, bet amount) are DOM elements positioned each frame from projected 3D anchor points (one batched projection pass writing CSS transforms; not one `Html` portal per element if that costs performance).
- The 3D code is a **lazy-loaded chunk**. The menu and setup screens must not download any 3D code or assets.

### 20.3 Graphics setting
- Settings → **"Gráficos"**: `Automático` (default), `Alta`, `Média`, `Baixa`, `2D clássico`.
- `Automático` picks a tier with `detect-gpu`, then a runtime performance monitor lowers it (never raises it during a hand) if the frame rate stays under target for 3 s. Show a small toast when it lowers ("Qualidade gráfica ajustada para Média").
- Devices without WebGL2, or failing the minimum tier, fall back to `2D clássico` automatically.
- **Idle rendering:** when nothing moves (waiting for the user with no animation playing), drop to on-demand rendering or ≤ 20 fps for idle micro-motion, to save battery.

### 20.4 Quality tiers

| | Alta | Média | Baixa |
|---|---|---|---|
| Character LOD | LOD0 (~15–25k tris each) | LOD1 (~7–10k) | LOD2 (~3–4k) |
| Texture size (characters) | 2048 | 1024 | 512 |
| Real-time shadows | 1 key light, 2048 map, soft | 1 key light, 1024 | none (baked + contact blobs) |
| Ambient occlusion | N8AO | N8AO half-res | baked only |
| Bloom / vignette / color grading | yes | yes | grading only |
| Depth of field | cinematic moments only | off | off |
| Antialiasing | SMAA or MSAA | FXAA | FXAA |
| Pixel ratio cap | 2.0 | 1.5 | 1.0 |
| Target fps | 60 | 45–60 | 30 stable |

---

## 21. Assets, licenses and the public repository

### 21.1 Allowed sources (in order of preference)
1. **Generated by the agents' own scripts** (Blender Python, procedural textures, SVG-to-texture). Owned by the project.
2. **CC0**: MakeHuman / MPFB2 system assets, Poly Haven (HDRIs, textures, models), ambientCG, Quaternius, Kenney, Freesound files explicitly marked CC0.
3. **CC-BY** only when there is no CC0 alternative, with attribution shown on a **"Créditos"** screen (reachable from Settings).
4. **Mixamo** (free, royalty-free for games, but raw files **may not be redistributed**): allowed **only** baked into the final optimized game files. The raw FBX files MUST live in the private art repository (21.3), never in the public repo.

Forbidden: anything paid, anything with "non-commercial", "no derivatives", "editorial use" or unclear licenses, ripped game assets, AI-generated assets from paid services, real casino brands, real people's likenesses.

### 21.2 License registry (enforced by CI)
- `docs/LICENSES.md` lists **every** file under `public/assets/` (or a folder rule covering it): source, author, license, URL, and the generating script when applicable.
- A CI script (`npm run assets:check`) fails if any shipped asset is missing from the registry, has a forbidden license, or exceeds its size budget (Section 26).

### 21.3 Private art repository (for non-redistributable sources)
- A second, **private** GitHub repository (suggested name: `pokergame-art`) holds raw Mixamo FBX files and any other source the license forbids redistributing. Private repositories are free on GitHub.
- The build scripts that read from it run in the agent environment. Only their **optimized outputs** (GLB with baked animation, KTX2 textures) are committed to the public repo.
- If the private repo is not available in a session, asset scripts MUST still work without it (the Mixamo-derived animations are optional; see 24.3).

### 21.4 Source-as-code rule
- Prefer committing **scripts that generate assets** over committing large binaries. Every generated asset MUST be reproducible with one command (`npm run assets:build`), pinned tool versions and fixed seeds.
- Do not commit `.blend` files unless a script cannot reproduce them; if you must, keep them in the private art repo.
- Do not use Git LFS in the public repo (the free quota is small). Optimized outputs are small enough for normal Git when the budgets in Section 26 are respected.

---

## 22. Asset pipeline (headless, reproducible)

### 22.1 Tools
- **Blender as a Python module:** `pip install bpy==<pinned>` (the wheel must match the Python version of the environment; document the pair in `DECISIONS.md`). Fallback: the Blender Linux tarball, if the network allows it.
- **MPFB2** (MakeHuman plugin for Blender), from its official GitHub repository, pinned to a tag. MPFB2's code is GPL-3: keep it under `tools/` (build-time only), never bundle it into the web app, and keep its license file. The **characters it generates** use its CC0 system assets and are CC0.
- **glTF tooling:** `@gltf-transform/cli` (dedup, prune, weld, simplify, resample, meshopt compression, KTX2 textures), `gltf-validator`.
- **Texture tooling:** `sharp` / `resvg` for SVG → PNG; KTX-Software (`toktx`) or `basisu` for KTX2 (UASTC for normal maps, ETC1S for color maps).
- If the environment's network allowlist blocks a download, **stop and write the exact file list and URLs in `HANDOFF.md` under "Owner action needed"** instead of looking for workarounds.

### 22.2 Folder layout
```
art/
  characters/roster.json       # the character roster definition (22.3)
  scripts/                     # Blender Python scripts: characters, props, bake, export
  textures-src/                # SVG/procedural sources (cards, chips, felt patterns)
tools/
  mpfb2/                       # vendored or submodule, pinned, with its LICENSE
scripts/assets/                # node scripts: optimize, validate, check budgets, update registry
public/assets/3d/              # optimized outputs only (GLB, KTX2, HDR)
```

### 22.3 Commands
- `npm run assets:build` — runs every generator, then optimization, then validation.
- `npm run assets:characters`, `assets:props`, `assets:env`, `assets:anim` — partial builds.
- `npm run assets:check` — registry, licenses, sizes, `gltf-validator` with zero errors.
- Asset builds are **not** part of the normal CI run (too slow). CI runs only `assets:check` on the committed outputs.

---

## 23. Characters ("pessoas diferentes")

### 23.1 Roster
- Generate a roster of **at least 16 distinct people** with MPFB2 by script, defined in `art/characters/roster.json` (one entry per character, all parameters explicit, fixed seed).
- Real variety, like a real card room: ages 22–75; many ethnicities and skin tones; different heights, body types, faces and presentations; balanced men and women.
- **Wardrobe and accessories:** smart-casual casino clothing (blazers, shirts, polos, hoodies, dresses, knitwear), glasses, sunglasses, caps, beanies, beards, mustaches, jewelry, watches. Only CC0 or project-generated clothing.
- **Hair:** the weakest point of free pipelines, so give it explicit effort: hair meshes with alpha-tested/alpha-hashed cards, anisotropic-looking highlights, correct sorting; a buzz cut, bald and short styles look best and should be well represented.
- **Faces:** avoid the "default MakeHuman face". Vary facial proportions per character, add subtle asymmetry, wrinkles/age maps for older characters, and freckles/moles on some.

### 23.2 Materials (realism on a budget)
- Skin: `MeshPhysicalMaterial` with base color, normal and roughness maps, subtle sheen, and a cheap subsurface-scattering approximation (wrap lighting or a thickness-based tint in a shader chunk). Avoid plastic-looking specular.
- Eyes: separate cornea with high specular and a wet highlight; iris with depth; eyelid shadow. Eyes sell realism; do not skip them.
- Cloth: fabric-appropriate roughness and sheen, detail normal maps.

### 23.3 Rig, LODs and export
- One shared humanoid skeleton for all characters (MPFB2's default rig, or a documented equivalent) so every animation fits every character.
- Facial motion: blinks, eye direction and a few expressions (neutral, focused, slight smile, disappointed, smug). Use the face bones or shape keys MPFB2 provides; validate what works in the Phase V2 spike and record it in `DECISIONS.md`.
- Seated body only needs full detail from the waist up. Legs may use a simplified mesh hidden by the table.
- Export three LODs per character (23.4 of the tier table), GLB with meshopt and KTX2.

### 23.4 Linking characters to NPCs
- Each NPC gets a character model instead of (or in addition to) the procedural 2D avatar. The NPC's generated name MUST fit the character's presentation (the name pools are tagged per character).
- No duplicate characters at the same table. The 2D fallback keeps using avatars derived from the same character (portrait render generated at build time).
- The user's own seat has no visible body in the default camera (first-person). The user's hands MAY appear when looking at hole cards (optional, Phase V6).

---

## 24. Animation

### 24.1 Layers (combined per character)
1. **Base seated pose** (sitting at a card table, forearms near the rail).
2. **Procedural idle layer (code):** breathing, small weight shifts, blinks (random intervals), eye saccades, head and eyes looking at the active player, the board when a card falls, the pot on big bets. Noise-driven, never looping visibly.
3. **Gesture layer (clips):** actions triggered by engine events (24.2).
4. **IK layer (code):** hands reaching the character's own chip stack and the betting line, and reaching hole cards on the rail. Two-bone IK for arms, look-at for head and eyes.

### 24.2 Event → gesture mapping (minimum set)
| Engine event / state | Gesture |
|---|---|
| Hole cards dealt to the NPC | Peek at cards (lift corners), then protect them with a hand or chip |
| NPC is "thinking" (the delay from Part I 8.4) | Chip riffling, chin touch, fingers tapping, glance at the board; chosen per style and mood |
| Check | Knock the table with knuckles or tap twice |
| Call / bet / raise | Push the right number of chips to the betting line (IK); raises and all-ins are more decisive; the 3D chips match the real amount |
| All-in | Push the whole stack forward with both hands |
| Fold | Slide or toss cards face-down toward the muck |
| Wins a pot | Rakes the chips in; subtle satisfied expression (style-dependent) |
| Loses a big pot | Leans back, exhales, rubs face; if tilted (Part I 8.2.8), more agitated posture for a few hands |
| Eliminated | Stands up and leaves the seat (seat becomes empty) |
| Shows cards at showdown | Turns the cards face-up on the felt |

### 24.3 Sources of clips
- **Keyframed clips authored by the agents as Blender Python scripts** (either agent may author them; the owner may also ask GPT-6 Astra specifically to author them). Each script defines keys for the shared skeleton, is committed under `art/scripts/anim/`, and is reproducible. This is the **primary** source for poker-specific gestures (peek, knock, chip push, fold toss, riffle).
- **Mixamo (optional):** seated idles and generic upper-body motions downloaded by the owner into the private art repo, retargeted to the shared skeleton by a committed script, and baked. The game MUST look complete without them.
- **CC0 libraries** (Quaternius and similar) for generic motion.
- Retargeting is done with a committed Blender script (bone-name mapping + bake). No paid add-ons.

### 24.4 Animation quality rules
- Blend between layers with smooth crossfades (≥ 150 ms); no popping or foot/hand sliding on the table.
- Hands must contact the table, chips and cards convincingly (IK targets on the real surfaces).
- No two NPCs play the same idle in sync (random phase offsets and per-character speed variation of ±10%).
- `prefers-reduced-motion` and the reduced-motion setting reduce gestures to minimal versions.

### 24.5 Fairness and timing rules (MUST)
- **No hand-strength tells.** Animations, expressions and timing MUST NOT correlate with the NPC's hidden cards. They may depend only on the action chosen, the NPC's style, mood/tilt and public events. Add a test: across 10,000+ simulated decisions, gesture and expression choice is statistically independent of the NPC's hidden hand strength given the chosen action. (A future optional "tells" mode may be proposed to the owner, but it is out of scope and off by default.)
- Gestures fit inside the NPC decision delay from Part I 8.4. The delay budget does not grow for animation; the action is shown to the engine at the end of the delay exactly as today.
- Every animation is skippable with a tap and scales with the speed setting ("Rápido" plays short versions).

---

## 25. Environment, lighting, camera and motion graphics

### 25.1 Environment and props
- **Room:** an intimate, modern private card room (dark wood, brass or gold details, warm pendant light over the table, soft background out of focus). No real brands or logos.
- **Table:** oval, felt with a fabric normal map and subtle wear, padded leather rail with stitching, wood trim, a betting line, the dealer position with a card shoe or dealer tray.
- **Chips:** modeled by script, PBR clay/composite look with edge spots and an inlay; denominations and colors per Part I 11.1; stacks built by instancing (one instanced mesh per denomination) so thousands of chips stay cheap.
- **Cards:** faces generated from the project's own SVG designs into a KTX2 atlas; card backs with the original design; four-color option supported; slight bend and specular sheen.
- **Dealer button** and blind markers modeled by script.

### 25.2 Lighting
- Bake lighting for the static room and table in Blender Cycles (headless, CPU) into lightmaps/AO maps.
- One real-time key light above the table for chips, cards, hands and characters (shadows per tier); a low-resolution Poly Haven HDRI for reflections and ambient light; a light probe or environment map for characters.
- Tone mapping (AgX or ACES) and a color-grading LUT for a warm, cinematic casino look.

### 25.3 Camera
- **Default ("Jogador"):** the user's seat point of view, slightly elevated, looking across the table. Portrait and landscape use different framing so **all seats, the board and the pot are always visible** at 360×640 portrait (portrait uses a higher, steeper angle).
- **Other modes** (Settings → "Câmera"): `Jogador`, `Aérea` (top-down, closest to the 2D table), `Cinemática` (Jogador plus automatic camera moves).
- **Cinematic moments** (only in `Cinemática`, skippable, disabled by reduced motion): slow dolly on an all-in runout, a close-up on the revealed hands at a big showdown, a sweep to the winner on a big pot.
- **Readability rule:** the user's hole cards and the board must always be readable. The user's hole cards are also shown as a crisp DOM overlay near the action bar (sized for 360 px width), in addition to the 3D cards on the table.

### 25.4 Motion graphics (DOM layer)
- Using GSAP and the existing Framer Motion: counting chip numbers, pot growth pulses, animated hand-name reveals at showdown, a tension effect during all-in runouts (subtle vignette and heartbeat sound), win banners with restrained particle effects for big pots, smooth screen transitions between menu, setup and table.
- Restraint is part of realism: no constant flashing, no slot-machine effects.

### 25.5 Sound
- Replace or extend the SFX with CC0 recordings where they sound more realistic (chip clacks, card slides, felt taps).
- A quiet CC0 **room ambience** loop (distant murmur, soft music), with its own volume slider, default low.
- Positional audio per seat (Web Audio `PannerNode`), so a chip push on the left sounds from the left.

---

## 26. Performance budgets for the 3D table

- The **initial route** (menu) keeps the Part I budgets: no 3D code or assets loaded there.
- **3D download:** ≤ 8 MB for `Baixa`, ≤ 14 MB for `Média`, ≤ 22 MB for `Alta` (all compressed, total for a 9-seat table). Assets are cached by the service worker after the first load.
- **Per character:** LOD0 ≤ 1.8 MB, LOD1 ≤ 900 KB, LOD2 ≤ 400 KB, including textures.
- **First table render:** ≤ 6 s on a mid-range phone over 4G, with a progressive loading screen; low-LOD or placeholder characters may appear first and upgrade in place.
- **Frame rate:** meet the tier targets in 20.4 on the owner's phone and on a mid-range Android profile; no main-thread task > 50 ms during play (asset loading excluded).
- **Memory:** ≤ 450 MB on mobile at `Alta`; dispose GPU resources when leaving the table.
- **Draw calls:** ≤ 150 at `Alta` with 9 seats (instancing for chips, texture atlases, merged static geometry).
- `npm run assets:check` enforces the size budgets; a Playwright performance test records fps and long tasks on a 9-player table and fails on regressions beyond 15%.

---

## 27. Testing for Version 2

- **Renderer parity:** a test plays scripted hands through both renderers' state adapters and asserts they receive identical state and events (the 3D table cannot drift from the engine).
- **Animation mapping:** unit tests for the event → gesture scheduler, including the timing budget and skip behavior.
- **No-tells test:** Section 24.5.
- **Bluff metrics:** Section 18.5.
- **Visual regression:** Playwright screenshots of the 3D table at 2, 6 and 9 seats, portrait and landscape, per tier, using SwiftShader/WebGL in CI with a fixed seed, fixed animation time and a tolerance threshold.
- **Asset validation:** `assets:check` in CI.
- **Real devices:** each phase from V2 on ends with a deployed preview that the owner tests on their phone. Their feedback is recorded in `HANDOFF.md`.

---

## 28. Version 2 phases and acceptance criteria

Work strictly in order. Each phase ends with a green CI, updated docs and a handoff (Part I, Section 1).

**Phase V1 — Bluffing and odds panel.** Section 18 (model, classification module, simulator metrics, tests) and Section 19.
*Accept:* all 18.2 ranges met in the simulator; 18.5 tests pass; the odds panel starts minimized on a fresh profile and persists its state.

**Phase V2 — 3D technical spike (go/no-go).** R3F table in graybox with 9 seat anchors and both camera framings; the DOM HUD anchored to 3D; quality tiers and auto-downgrade; `2D clássico` fallback; one MPFB2 character generated headless → optimized GLB → seated in the scene with a procedural idle; three short "look" test renders (lighting and grading variations) for the owner to choose from.
*Accept:* the owner has tested the preview on their phone and chosen a look; the tier targets are met at `Média` on the owner's phone with the graybox scene; the headless character pipeline works from one command; findings in `DECISIONS.md`. If the targets cannot be met, stop and report options before continuing.

**Phase V3 — Environment and props.** Room, table, chips (instanced), cards (atlas), dealer button, baked lighting, HDRI, post-processing per tier, the chip-amount-accurate betting visuals.
*Accept:* 25.1–25.2 complete; budgets met; visual regression baselines approved by the owner.

**Phase V4 — Characters.** Full roster (23.1), materials (23.2), rig and LODs (23.3), NPC linking and portraits (23.4), "Créditos" screen if any CC-BY asset is used.
*Accept:* 16+ distinct characters pass `assets:check`; no duplicate at a table; the owner approves the roster from a contact sheet render.

**Phase V5 — Animation.** Layers 24.1, the full mapping in 24.2, the scripted gesture library, IK for chips and cards, optional Mixamo integration from the private repo, the no-tells test.
*Accept:* every row of 24.2 plays correctly in 2-, 6- and 9-seat games; timing inside the Part I delay budget; 24.4 quality rules pass a manual QA checklist in `docs/QA.md`; the no-tells test passes.

**Phase V6 — Camera, motion graphics and sound.** 25.3–25.5, Settings for "Gráficos" and "Câmera", the user's hole-card overlay, optional user hands.
*Accept:* all camera modes readable at 360×640; cinematic moments skippable; reduced motion respected; ambience and positional audio working with volume controls.

**Phase V7 — Polish and hardening.** Performance pass against Section 26 on real devices, memory and disposal checks, loading experience, final visual QA, docs (`RULES.md`, `AI.md`, `LICENSES.md`, `QA.md`) updated.
*Accept:* every Section 26 budget met; all tests green; owner sign-off after a full game on their phone.

**Stretch (only after V7 and only if the owner asks):** a non-playing dealer character who deals with the correct order from Part I 5.3; an optional "tells" mode designed so it stays fair and clearly labeled.

---

## 29. Owner actions (things only the human owner can do)

The agents MUST list any pending owner action at the top of their `HANDOFF.md` entry, with exact instructions.

1. **Before Phase V2:** create the private repository `pokergame-art` on GitHub and give both agents access. (Needed only for Mixamo and other non-redistributable sources.)
2. **Phase V2:** open the preview on your phone, test it and pick one of the three looks.
3. **Phases V3–V4:** approve the environment screenshots and the character contact sheet.
4. **Phase V5 (optional):** with a free Adobe account, download from Mixamo the exact list of animations the agents provide (with the exact export settings), and upload them to `pokergame-art`.
5. **If an agent reports a blocked download:** download the listed free files and add them where the agent says.
6. **At the end of every phase:** test the deployed preview on your phone and report what felt wrong.

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

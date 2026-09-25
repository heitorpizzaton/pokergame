# Manual QA checklist

Phase 7 acceptance (AGENTS.md Section 14). Each item says how it was verified. "Automated" items
are also guarded by tests; items marked **Owner** need a real phone or a human decision and
cannot be completed by an agent in a container.

Status: `[x]` verified · `[ ]` pending (who and how).

Last run: 2026-09-25, Claude, branch `feat/phase-7-polish`, production build (`npm run build`)
and the seeded e2e build (`vite build --mode e2e`), Chromium 141 headless (local) and the CI
Chromium.

## Layout (Sections 2.8, 11.2)

- [x] Every screen works at 360×640 portrait: the whole e2e suite (menu, setup, table, settings,
      guide, history and replayer, summary) runs on `min-360x640`, and the setup, table and
      summary flows assert no horizontal scroll. Menu, setup, settings, guide and table
      screenshots were reviewed.
- [x] Table layouts for 2–9 players, portrait and landscape: seats at fixed positions, nothing
      clipped. Automated: `tests/visual` (16 screenshots); reviewed locally before the CI baselines.
- [x] Short landscape phones (844×390) move the controls into a side column; desktop keeps the
      controls in a centred 760 px column.
- [x] Touch targets at least 44×44 px (header buttons, action bar, switches, steppers).
- [x] Safe-area insets: header, footer and screens pad with `env(safe-area-inset-*)`.
- [ ] **Owner:** check on a notched phone (iPhone with a home indicator) in standalone mode.

## Visual design (Section 11.1)

- [x] Felt with noise texture, wooden rail with gold inlay, glass HUD; no external images.
- [x] Cards readable at the smallest size (28×39 px) with large indices; four-colour deck option.
- [x] Original card back; chip colours follow blind denominations.
- [x] Self-hosted font (Manrope, OFL) with system fallbacks; tabular numerals for amounts.

## Animation (Section 11.4)

- [x] Hole cards fly from the button in the engine's dealing order (unit test on `dealOrder`,
      first card to the small blind); the controller waits for the deal before the first action.
- [x] Board: the burn card goes to the muck, then the flop turns over card by card; turn and river
      after their burn.
- [x] Bets slide to the betting line, gather into the pot at the end of the street (unit test:
      gathered bets equal the pot) and slide to the winners.
- [x] Winners glow; their five cards are highlighted (unit test: the five are on the board or
      shown); the hand name shows in the result toast.
- [x] All-in runout: dramatic pause between streets, live exact equity bar when the odds panel is on.
- [x] Every animation can be skipped (tap the table or the toast) and follows the speed setting.
- [x] Reduced motion (setting or OS): animations are instant; the turn timer keeps real time.

## Sound and haptics (Section 11.5)

- [x] All ten cues are synthesized (no audio files) and play through a single engine; mute is one
      tap in the header; default on at 70%. Automated: `tests/unit/sound.test.ts`.
- [x] The audio context unlocks on the first tap or key press (autoplay policies).
- [ ] **Owner:** listen on a phone: levels balanced, nothing harsh, mute works immediately.
- [ ] **Owner:** haptics on an Android phone: your turn, timer warning, pot won. (iOS Safari has no
      Vibration API, so haptics are silently skipped there.)

## Accessibility (Section 12)

- [x] axe: no WCAG 2.1 A/AA violations on menu, setup, settings, guide and table, on all five
      viewports. Automated: `tests/e2e/a11y.spec.ts`.
- [x] Cards have labels ("Ás de Espadas"); the board and hole cards are labelled groups.
- [x] A live region announces "Sua vez" with the user's cards and the amount to call, and each
      result. Automated (announcer text).
- [x] Every control is a native button, input or select, so it works with the keyboard; visible
      focus ring.
- [x] Lighthouse accessibility: 100.
- [ ] **Owner:** a pass with VoiceOver or TalkBack.

## PWA and performance (Section 12)

- [x] Lighthouse mobile (production build, local): Performance 98, Accessibility 100, Best
      Practices 100; FCP 1.9 s, LCP 2.0 s, TBT 10 ms, CLS 0.013.
- [x] Initial JS 111 KB gzipped (budget 350 KB); history, replayer and the guide load lazily.
      Automated: `npm run budget`.
- [x] No main-thread task over 50 ms while playing (long-task observer). Automated: `tests/perf`.
- [x] Manifest and service worker present. Automated: `tests/e2e/app.spec.ts`.
- [x] Works offline after the first visit: a new game starts and plays with the network off
      (checked with Playwright; fonts and workers are precached).
- [ ] **Owner:** install from Chrome on Android and "Adicionar à Tela de Início" on iOS; open from
      the home screen in standalone mode.
- [ ] **Owner:** 60 fps feel on a mid-range phone during the deal and chip animations.

## Visual regression (Section 13.3)

- [x] Baselines for the table at 2–9 players, portrait and landscape, generated in CI with the
      official Playwright Chromium (`update-visual-baselines` label, ADR-023). Regenerated after
      the user's bet was moved clear of their cards. The agent reviewed portrait 2 and 6 and
      landscape 3 and 9. Crowded but readable: in landscape with 9 players, one position label on
      the left is partly behind a neighbour's cards.
- [ ] **Owner:** review and approve the committed images in `tests/visual/__screenshots__`.

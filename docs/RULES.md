# Rules as implemented

This document describes No-Limit Texas Hold'em exactly as `src/core/engine` implements it. It MUST match `AGENTS.md` Section 5. Where the spec leaves a choice open, the choice made here is final and tested. Chip amounts are always integers.

## 1. Table and game

- 2 to 9 players, all starting with the same stack (freezeout, no rebuys, no antes). Blinds are fixed for the whole game.
- Validation: `SB ≥ 1`, `BB > SB`, and the starting stack must be at least 10 BB. (The Setup screen also warns below 20 BB.)
- Seats are numbered `0 … n-1` clockwise. "Left of X" means the next seat clockwise from X.
- The initial button is chosen uniformly at random with the secure RNG.
- A player with 0 chips after a hand is eliminated; their seat becomes empty and is skipped for the button, the blinds, dealing and action.

## 2. Button and blinds ("simplified moving button")

- Each new hand, the button moves to the next **occupied** seat clockwise.
- **Three or more players:** the small blind is the first occupied seat left of the button, and the big blind is the next occupied seat after the small blind.
- **Heads-up (2 players):** the button posts the small blind; the other player posts the big blind.
- **Transition to heads-up:** when the button move would make the same player post the big blind twice in a row, the button goes to that player instead (so they post the small blind). Example: in hand 10, A has the button, B is SB and C is BB, and A busts. The normal move would give B the button and make C the BB again, so instead C gets the button/SB and B posts the BB.
- A player who cannot cover a blind posts all their chips and is all-in.
- If the big blind is posted short (all-in for less than the big blind), the amount to call for everyone else is still the **full big blind**.

## 3. Position labels

Labels depend only on the number of players dealt in. They are listed in preflop action order, followed by the button and the blinds. One shared function (`positionLabels`) produces them for the UI and the AI.

| Players | Labels (first to act preflop → last)    |
| ------- | --------------------------------------- |
| 2       | BTN (posts SB, acts first preflop), BB  |
| 3       | BTN, SB, BB                             |
| 4       | UTG, BTN, SB, BB                        |
| 5       | UTG, CO, BTN, SB, BB                    |
| 6       | UTG, HJ, CO, BTN, SB, BB                |
| 7       | UTG, LJ, HJ, CO, BTN, SB, BB            |
| 8       | UTG, UTG+1, LJ, HJ, CO, BTN, SB, BB     |
| 9       | UTG, UTG+1, MP, LJ, HJ, CO, BTN, SB, BB |

The first player to act preflop in a 3+ player game is always labelled UTG (in 3-handed, the button acts first preflop and keeps the BTN label).

## 4. Dealing

- A fresh 52-card deck is shuffled (unbiased Fisher-Yates, crypto RNG) at the start of every hand.
- Hole cards: one card at a time, clockwise, **starting with the first player left of the button** and ending with the button, then a second round in the same order. With 3+ players this starts with the small blind; heads-up it starts with the big blind.
- One card is **burned** before the flop, the turn and the river. The flop is three cards, then the turn, then the river, all taken in order from the top of the deck.

## 5. Betting

- **Preflop:** action starts with the first player left of the big blind; heads-up, the button/SB acts first. The big blind has the **option**: posting a blind is not an action, so after limps the BB may check or raise.
- **Postflop:** action starts with the first player left of the button who can still act; heads-up, the big blind acts first and the button last.
- **Legal actions:**
  - **Fold:** only when facing a bet. Folding when a check is available is rejected (`FoldWhenCheckAvailable`); this is a rule of this game (Section 5.4 of the spec), not standard poker.
  - **Check:** only when there is nothing to call.
  - **Call:** match the current bet, or go all-in for less.
  - **Bet:** when nobody has bet on this street (preflop the big blind counts as the bet). The minimum is 1 BB, or all-in if the stack is smaller.
  - **Raise:** to a total of at least `currentBet + minRaise`, or all-in for less (a short all-in).
  - **All-in:** always available with chips; the engine turns it into the matching call, bet or raise.
- Bet and raise amounts are given **to** a total for the street ("raise to 600").
- **Minimum raise:** `minRaise` starts at 1 BB on every street. Each full bet or raise that increases the current bet by at least `minRaise` sets `minRaise` to that increase.
- **Short all-ins and reopening (TDA-consistent):** an all-in that raises by less than `minRaise` is a short raise and does not change `minRaise`. A player who has already acted this street may raise again only if the current bet has grown by **at least `minRaise` since they last acted**. So one short all-in does not reopen the action for them (call or fold only), but several short all-ins that together add up to a full raise do. Players who have not yet acted on the street may always raise.
- **Round end:** the betting round ends when every player who can still act has acted and matched the current bet (or is all-in).
- **Uncalled bets:** any part of a bet that no other player matched is returned to the bettor before pots are awarded. It is reported as `UncalledBetReturned`.
- **Hand ends early** when all but one player fold. The winner does not have to show, but may choose to (`reveal`).
- **All-in runout:** when at most one player can still bet and nobody faces an unmatched bet, all remaining hole cards are revealed and the board is dealt to the river.

## 6. Pots

- Pots are built from each player's total contribution to the hand, layer by layer at every distinct all-in level: first the main pot ("Pote principal"), then side pots ("Pote lateral 1", "Pote lateral 2", …). Folded players' chips stay in the pots, but folded players are not eligible to win.
- Each pot goes to the best hand among the players eligible for it.
- **Split pots:** a pot is divided equally among the tied winners. **Odd chips** are handed out one at a time to the tied winners in seat order, starting from the first seat left of the button.

## 7. Showdown

- **Order:** if there was a bet or raise on the river, the last river aggressor shows first. Otherwise the first player left of the button who is still in the hand shows first. Players then show clockwise.
- A player may **muck** only when their hand cannot win or tie any pot they are eligible for, compared with the hands already shown. Each player has a policy: auto-muck losing hands (the user's default, "Descartar mãos perdedoras automaticamente") or always show.
- Hands revealed in an all-in runout are already public and are never mucked.
- Every hand shown publicly is recorded for the rest of the game; the AI may use this information.

## 8. Hand rankings

Best five cards out of seven. Royal Flush > Straight Flush > Four of a Kind > Full House > Flush > Straight > Three of a Kind > Two Pair > One Pair > High Card. Suits have no rank. The ace plays high or low (A-2-3-4-5 is a five-high straight). Straights do not wrap (Q-K-A-2-3 is not a straight). The board may play.

## 9. Eliminations and game end

- Players who bust in the same hand are ranked by their stack at the start of that hand (bigger stack → better place). Players with equal starting stacks share the better place.
- The game ends when one player holds every chip.

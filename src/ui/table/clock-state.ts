import type { UserClock } from '../../app/game-controller.ts';

const WARNING_MS = 5_000;

/** Where the user's clock stands at `now`: action time first, then the time bank (AGENTS.md §9). */
export function clockState(clock: UserClock, now: number) {
  const elapsed = Math.max(0, now - clock.startedAt);
  const actionLeft = Math.max(0, clock.actionMs - elapsed);
  const bankLeft = Math.max(0, clock.bankMs - Math.max(0, elapsed - clock.actionMs));
  const inBank = actionLeft === 0;
  const left = inBank ? bankLeft : actionLeft;
  const total = inBank ? clock.bankMs : clock.actionMs;
  return {
    inBank,
    seconds: Math.ceil(left / 1000),
    fraction: total > 0 ? left / total : 0,
    warning: actionLeft + bankLeft <= WARNING_MS,
  };
}

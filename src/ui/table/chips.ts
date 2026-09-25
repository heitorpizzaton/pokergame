/**
 * Chip colours by denomination relative to the blinds (AGENTS.md §11.1): SB, BB, 5, 25, 100 and
 * 500 big blinds. Display only: amounts are always shown exactly beside the stack.
 */
export type ChipColour = 'sb' | 'bb' | '5bb' | '25bb' | '100bb' | '500bb';

const MULTIPLES: readonly (readonly [ChipColour, number])[] = [
  ['500bb', 500],
  ['100bb', 100],
  ['25bb', 25],
  ['5bb', 5],
  ['bb', 1],
];

/**
 * Greedy split of `amount` into chips, largest first, at most `max` chips (the smallest are
 * dropped from the picture beyond that). A remainder below the small blind still shows one chip.
 */
export function chipStack(
  amount: number,
  smallBlind: number,
  bigBlind: number,
  max = 7,
): ChipColour[] {
  const chips: ChipColour[] = [];
  let rest = amount;
  for (const [colour, multiple] of MULTIPLES) {
    const value = multiple * bigBlind;
    while (rest >= value && chips.length < max) {
      chips.push(colour);
      rest -= value;
    }
  }
  while (rest > 0 && chips.length < max) {
    chips.push('sb');
    rest -= Math.max(1, smallBlind);
  }
  return chips;
}

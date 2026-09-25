import { describe, expect, it } from 'vitest';
import { chipStack } from '../../src/ui/table/chips.ts';

describe('chip stacks by blind denomination (AGENTS.md §11.1)', () => {
  it('splits greedily into big-blind multiples, largest first', () => {
    expect(chipStack(100, 50, 100)).toEqual(['bb']);
    expect(chipStack(650, 50, 100)).toEqual(['5bb', 'bb', 'sb']);
    expect(chipStack(3100, 50, 100)).toEqual(['25bb', '5bb', 'bb']);
    expect(chipStack(60_000, 50, 100)).toEqual(['500bb', '100bb']);
  });

  it('shows at least one chip for any positive amount and caps the height', () => {
    expect(chipStack(1, 50, 100)).toEqual(['sb']);
    expect(chipStack(0, 50, 100)).toEqual([]);
    expect(chipStack(99_999, 50, 100, 5)).toHaveLength(5);
  });
});

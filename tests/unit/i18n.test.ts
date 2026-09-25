import { describe, expect, it } from 'vitest';
import { strings } from '../../src/i18n/index.ts';

describe('i18n', () => {
  it('carries the mandatory entertainment disclaimer (§2.6)', () => {
    expect(strings.legal.entertainment).toBe(
      'Jogo de entretenimento. As fichas não têm valor real.',
    );
  });
});

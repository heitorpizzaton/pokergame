import { webcrypto } from 'node:crypto';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { formatCards, shuffledDeck } from '../../src/core/cards/index.ts';
import {
  commitDeck,
  commitmentText,
  newSalt,
  sha256Hex,
  verifyCommitment,
} from '../../src/core/fairness/index.ts';
import { SeededRng } from '../../src/core/rng/seeded-rng.ts';
import { type CompletedHand, GameController } from '../../src/app/game-controller.ts';
import { buildHandRecord, checkFairness, type HandRecord } from '../../src/history/index.ts';
import { FakeScheduler } from '../support/fake-scheduler.ts';

const utf8 = (s: string) => new TextEncoder().encode(s);

describe('SHA-256 (FIPS 180-4)', () => {
  it('matches the NIST test vectors', () => {
    expect(sha256Hex(utf8(''))).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
    expect(sha256Hex(utf8('abc'))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
    expect(sha256Hex(utf8('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq'))).toBe(
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    );
    expect(sha256Hex(new Uint8Array(1_000_000).fill(0x61))).toBe(
      'cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0',
    );
  });

  it('agrees with WebCrypto on random inputs of every padding length', async () => {
    await fc.assert(
      fc.asyncProperty(fc.uint8Array({ maxLength: 200 }), async (bytes) => {
        const digest = new Uint8Array(await webcrypto.subtle.digest('SHA-256', bytes));
        const hex = [...digest].map((b) => b.toString(16).padStart(2, '0')).join('');
        expect(sha256Hex(bytes)).toBe(hex);
      }),
      { numRuns: 300 },
    );
  });
});

describe('deck commitment (AGENTS.md §14, Phase 8)', () => {
  const rng = new SeededRng(11);
  const deck = shuffledDeck(rng);
  const salt = newSalt(rng);
  const hash = commitDeck(deck, salt);

  it('commits to a readable text that any SHA-256 tool can check', () => {
    expect(salt).toMatch(/^[0-9a-f]{32}$/);
    expect(commitmentText(deck, salt)).toBe(`mesa-viva-deck-v1:${formatCards(deck)}:${salt}`);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(verifyCommitment(hash, { deck, salt })).toBe(true);
  });

  it('rejects any other deck, a changed salt or an incomplete deck', () => {
    const swapped = [deck[1], deck[0], ...deck.slice(2)].filter((c) => c !== undefined);
    expect(verifyCommitment(hash, { deck: swapped, salt })).toBe(false);
    const otherSalt = `${salt.slice(0, 31)}${salt.endsWith('0') ? '1' : '0'}`;
    expect(verifyCommitment(hash, { deck, salt: otherSalt })).toBe(false);
    expect(verifyCommitment(hash, { deck: deck.slice(1), salt })).toBe(false);
    const duplicated = [...deck.slice(0, 51), ...deck.slice(0, 1)];
    expect(verifyCommitment(commitDeck(duplicated, salt), { deck: duplicated, salt })).toBe(false);
  });

  it('gives fresh salts, so equal decks get different commitments', () => {
    const r = new SeededRng(5);
    expect(commitDeck(deck, newSalt(r))).not.toBe(commitDeck(deck, newSalt(r)));
  });
});

describe('commitments in play and in the history', () => {
  function play(hands: number, seed: number) {
    const completed: CompletedHand[] = [];
    const published: string[] = [];
    const scheduler = new FakeScheduler();
    const controller = new GameController({
      config: {
        players: Array.from({ length: 4 }, (_, i) => ({ name: `P${i}` })),
        startingStack: 20_000,
        smallBlind: 50,
        bigBlind: 100,
      },
      deckRng: new SeededRng(seed),
      npcRng: new SeededRng(seed + 1),
      fairnessRng: new SeededRng(seed + 2),
      scheduler,
      speed: 'instant',
      onHandComplete: (h) => completed.push(h),
    });
    controller.subscribe(() => {
      const snap = controller.getSnapshot();
      // The snapshot carries only the hash: never the deck or the salt.
      expect(JSON.stringify(snap)).not.toContain('salt');
      if (snap.commitment && published.at(-1) !== snap.commitment) published.push(snap.commitment);
    });
    controller.start();
    for (let i = 0; i < 20_000 && completed.length < hands; i++) {
      const snap = controller.getSnapshot();
      if (snap.phase === 'userTurn') {
        controller.act(snap.view.legal?.canCheck ? { type: 'check' } : { type: 'call' });
      } else if (!scheduler.runNext()) break;
    }
    return { completed, published };
  }

  it("publishes each hand's commitment during the hand and verifies it afterwards", () => {
    const runs = [21, 22, 23, 24].map((seed) => play(15, seed));
    const completed = runs.flatMap((r) => r.completed);
    const published = runs.flatMap((r) => r.published);
    expect(completed.length).toBeGreaterThanOrEqual(30);
    let showdowns = 0;
    for (const hand of completed) {
      const record = buildHandRecord(hand, 's');
      expect(published).toContain(record.fairness?.hash);
      expect(checkFairness(record)).toEqual({ commitment: true, cards: true });
      if (record.shown.length > 0) showdowns++;
    }
    // Shown cards are checked against their deal positions too.
    expect(showdowns).toBeGreaterThan(0);
  });

  it('detects a tampered reveal', () => {
    const [hand] = play(1, 5).completed;
    if (!hand?.fairness) throw new Error('no hand');
    const record = buildHandRecord(hand, 's');
    const deck = [...hand.fairness.deck];
    deck.reverse();
    expect(checkFairness({ ...record, fairness: { ...hand.fairness, deck } })).toEqual({
      commitment: false,
      cards: false,
    });
    const legacy: HandRecord = { ...record };
    delete (legacy as { fairness?: unknown }).fairness;
    expect(checkFairness(legacy)).toBeNull();
  });
});

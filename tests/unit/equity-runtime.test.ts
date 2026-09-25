import { describe, expect, it } from 'vitest';
import { parseCards } from '../../src/core/cards/index.ts';
import {
  assessCall,
  handClassLabel,
  potOdds,
  preflopClass,
  runEquity,
  TARGET_STANDARD_ERROR,
} from '../../src/core/equity/index.ts';
import { SeededRng } from '../../src/core/rng/seeded-rng.ts';
import { EquityClient, type EquityWorkerLike } from '../../src/workers/equity-client.ts';
import {
  createEquityHandler,
  type EquityWorkerRequest,
  type EquityWorkerResponse,
} from '../../src/workers/equity-protocol.ts';

const c = parseCards;

describe('runEquity strategy', () => {
  it('uses the exact preflop table heads-up preflop', async () => {
    const result = await runEquity({ hero: c('AsAh'), board: [], opponents: 1 }, new SeededRng(1));
    expect(result?.exact).toBe(true);
    expect(result?.equity).toBe(preflopClass(c('AsAh')).vsRandom.equity);
  });

  it('enumerates exactly when within budget', async () => {
    const result = await runEquity(
      { hero: c('AhKh'), board: c('Qh7h2c'), opponents: 1 },
      new SeededRng(1),
    );
    expect(result).toMatchObject({ exact: true, samples: 1081 * 990 });
  });

  it('runs Monte Carlo until the standard error is below 0.25 pp', async () => {
    const progress: number[] = [];
    const result = await runEquity({ hero: c('AhKh'), board: [], opponents: 5 }, new SeededRng(2), {
      onProgress: (r) => progress.push(r.samples),
      timeBudgetMs: 60_000,
    });
    expect(result?.exact).toBe(false);
    expect(result?.standardError).toBeLessThan(TARGET_STANDARD_ERROR);
    expect(progress.length).toBeGreaterThan(1); // progressive display
  });

  it('stops at the time cap', async () => {
    let t = 0;
    const result = await runEquity({ hero: c('AhKh'), board: [], opponents: 8 }, new SeededRng(3), {
      now: () => (t += 1000),
      timeBudgetMs: 1500,
      chunkSize: 100,
    });
    expect(result?.samples).toBeLessThanOrEqual(200);
    expect(result?.exact).toBe(false);
  });

  it('can be cancelled between chunks', async () => {
    let cancelled = false;
    const result = await runEquity({ hero: c('AhKh'), board: [], opponents: 5 }, new SeededRng(4), {
      chunkSize: 100,
      yieldControl: async () => {
        cancelled = true;
      },
      isCancelled: () => cancelled,
    });
    expect(result).toBeNull();
  });

  it('rejects invalid requests', async () => {
    await expect(
      runEquity({ hero: c('AhKh'), board: c('2c3d'), opponents: 1 }, new SeededRng(1)),
    ).rejects.toThrow(RangeError);
  });
});

describe('pot odds', () => {
  it('computes call / (pot + call)', () => {
    expect(potOdds(100, 300)).toBe(0.25);
    expect(potOdds(0, 300)).toBe(0);
  });

  it('flags +EV and −EV calls against random hands', () => {
    expect(assessCall(0.3, 100, 300)).toEqual({ requiredEquity: 0.25, positive: true });
    expect(assessCall(0.2, 100, 300)).toEqual({ requiredEquity: 0.25, positive: false });
  });
});

describe('preflop classes', () => {
  it('labels hands', () => {
    expect(handClassLabel(c('AsKs'))).toBe('AKs');
    expect(handClassLabel(c('Kd As'))).toBe('AKo');
    expect(handClassLabel(c('7c7d'))).toBe('77');
    expect(handClassLabel(c('2c7c'))).toBe('72s');
  });

  it('puts strong hands near the top', () => {
    expect(preflopClass(c('AsAh')).rank).toBe(1);
    expect(preflopClass(c('AsKs')).topShare).toBeLessThan(0.05);
    expect(preflopClass(c('7s2h')).topShare).toBeGreaterThan(0.9);
  });
});

describe('equity worker protocol and client', () => {
  function inProcessWorker(): EquityWorkerLike {
    const worker: EquityWorkerLike = {
      onmessage: null,
      postMessage: (message: EquityWorkerRequest) => {
        void handle(message);
      },
      terminate: () => undefined,
    };
    const handle = createEquityHandler(
      (response: EquityWorkerResponse) => worker.onmessage?.({ data: response }),
      new SeededRng(11),
    );
    return worker;
  }

  it('computes, reports progress, and caches by game state', async () => {
    const client = new EquityClient(inProcessWorker());
    const seen: number[] = [];
    const request = { hero: c('AhKh'), board: c('Qh7h2c'), opponents: 1 };
    const first = await client.request(request, (r) => seen.push(r.equity));
    expect(first?.exact).toBe(true);
    expect(seen.length).toBeGreaterThan(0);
    const second = await client.request({ ...request, hero: c('KhAh') });
    expect(second).toBe(first); // served from the cache
  });

  it('cancels the previous request when a new one arrives', async () => {
    const client = new EquityClient(inProcessWorker());
    const slow = client.request({ hero: c('AhKh'), board: [], opponents: 6 });
    const fast = client.request({ hero: c('AhKh'), board: c('Qh7h2c3d9s'), opponents: 1 });
    expect(await slow).toBeNull();
    expect((await fast)?.exact).toBe(true);
  });
});

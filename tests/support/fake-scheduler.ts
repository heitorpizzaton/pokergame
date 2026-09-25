import type { Scheduler } from '../../src/app/game-controller.ts';

/** A manual clock: timers run only when the test advances time. */
export class FakeScheduler implements Scheduler {
  #now = 0;
  #nextId = 1;
  #tasks = new Map<number, { at: number; fn: () => void }>();

  setTimeout(fn: () => void, ms: number): unknown {
    const id = this.#nextId++;
    this.#tasks.set(id, { at: this.#now + ms, fn });
    return id;
  }

  clearTimeout(handle: unknown): void {
    this.#tasks.delete(handle as number);
  }

  now(): number {
    return this.#now;
  }

  get pending(): number {
    return this.#tasks.size;
  }

  /** Runs the earliest timer. Returns false when none is scheduled. */
  runNext(): boolean {
    let nextId: number | null = null;
    let at = Infinity;
    for (const [id, task] of this.#tasks) {
      if (task.at < at) {
        at = task.at;
        nextId = id;
      }
    }
    if (nextId === null) return false;
    const task = this.#tasks.get(nextId);
    this.#tasks.delete(nextId);
    this.#now = Math.max(this.#now, at);
    task?.fn();
    return true;
  }

  /** Runs timers until none remain or `limit` is reached. */
  runAll(limit = 100_000): number {
    let n = 0;
    while (n < limit && this.runNext()) n++;
    return n;
  }
}

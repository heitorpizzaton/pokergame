import type { HandRecord } from './record.ts';

/** Where recorded hands live (AGENTS.md §10.2): IndexedDB in the browser, memory in tests. */
export interface HistoryStore {
  add(record: HandRecord): Promise<void>;
  /** Newest first. */
  list(): Promise<HandRecord[]>;
  clear(): Promise<void>;
}

export class MemoryHistoryStore implements HistoryStore {
  readonly #records = new Map<string, HandRecord>();

  add(record: HandRecord): Promise<void> {
    this.#records.set(record.id, record);
    return Promise.resolve();
  }

  list(): Promise<HandRecord[]> {
    return Promise.resolve([...this.#records.values()].sort(newestFirst));
  }

  clear(): Promise<void> {
    this.#records.clear();
    return Promise.resolve();
  }
}

/** Newest first; hands from the same instant fall back to hand number. */
function newestFirst(a: HandRecord, b: HandRecord): number {
  return b.startedAt - a.startedAt || b.handNumber - a.handNumber;
}

const DB_NAME = 'mesa-viva';
const STORE = 'hands';

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => {
      resolve(req.result);
    };
    req.onerror = () => {
      reject(req.error ?? new Error('IndexedDB request failed'));
    };
  });
}

export class IndexedDbHistoryStore implements HistoryStore {
  readonly #db: Promise<IDBDatabase>;

  constructor(factory: IDBFactory = globalThis.indexedDB) {
    const open = factory.open(DB_NAME, 1);
    open.onupgradeneeded = () => {
      const db = open.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
    };
    this.#db = request(open);
  }

  async add(record: HandRecord): Promise<void> {
    const db = await this.#db;
    await request(db.transaction(STORE, 'readwrite').objectStore(STORE).put(record));
  }

  async list(): Promise<HandRecord[]> {
    const db = await this.#db;
    const all = (await request(
      db.transaction(STORE, 'readonly').objectStore(STORE).getAll(),
    )) as HandRecord[];
    return all.sort(newestFirst);
  }

  async clear(): Promise<void> {
    const db = await this.#db;
    await request(db.transaction(STORE, 'readwrite').objectStore(STORE).clear());
  }
}

import { Redis } from 'ioredis';

/** Short-lived shared state: rate-limit counters and SIWE nonces. */
export interface KeyValueStore {
  /** Increments `key` (creating it with a TTL) and returns the new value. */
  incr(key: string, ttlSeconds: number): Promise<number>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  /** Returns and deletes the value atomically (one-time use). */
  take(key: string): Promise<string | null>;
  close(): Promise<void>;
}

/** One process only (development, tests). */
export class MemoryStore implements KeyValueStore {
  private readonly data = new Map<string, { value: string; expires: number }>();

  constructor(private readonly now: () => number = Date.now) {}

  private live(key: string) {
    const entry = this.data.get(key);
    if (entry === undefined) return undefined;
    if (entry.expires <= this.now()) {
      this.data.delete(key);
      return undefined;
    }
    return entry;
  }

  async incr(key: string, ttlSeconds: number): Promise<number> {
    const entry = this.live(key);
    const value = (entry === undefined ? 0 : Number(entry.value)) + 1;
    this.data.set(key, {
      value: String(value),
      expires: entry?.expires ?? this.now() + ttlSeconds * 1000,
    });
    return value;
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    this.data.set(key, { value, expires: this.now() + ttlSeconds * 1000 });
  }

  async take(key: string): Promise<string | null> {
    const entry = this.live(key);
    this.data.delete(key);
    return entry?.value ?? null;
  }

  async close(): Promise<void> {
    this.data.clear();
  }
}

export class RedisStore implements KeyValueStore {
  private readonly redis: Redis;

  constructor(url: string) {
    this.redis = new Redis(url, { lazyConnect: false, maxRetriesPerRequest: 2 });
  }

  async incr(key: string, ttlSeconds: number): Promise<number> {
    const [[, value]] = (await this.redis
      .multi()
      .incr(key)
      .expire(key, ttlSeconds, 'NX')
      .exec()) as [[Error | null, number], [Error | null, number]];
    return value;
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    await this.redis.set(key, value, 'EX', ttlSeconds);
  }

  async take(key: string): Promise<string | null> {
    return this.redis.getdel(key);
  }

  async close(): Promise<void> {
    await this.redis.quit();
  }
}

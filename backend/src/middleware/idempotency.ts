/**
 * Idempotency middleware.
 *
 * Prevents duplicate payment submission to Stellar on network retries: a
 * client sends an `Idempotency-Key` header; the first request is processed and
 * its response cached; identical retries within the TTL return the original
 * response without re-submitting to the chain. Pairs with the contract's
 * nonce-uniqueness guard for defence in depth.
 *
 * Storage is pluggable: a Redis-backed store for production (atomic SET NX),
 * and an in-memory TTL store for dev/tests when Redis is unavailable.
 */

import { Request, Response, NextFunction } from 'express';

export interface CachedResponse {
  status: number;
  body: unknown;
  /** Headers worth replaying (content-type only) */
  headers?: Record<string, string>;
}

export interface IdempotencyStore {
  /** Returns 'acquired' if we won the lock, 'processing' if a request is in
   *  flight, 'exists' if a final result is already cached. */
  tryAcquire(key: string, ttlSeconds: number): Promise<'acquired' | 'processing' | 'exists'>;
  getResult(key: string): Promise<CachedResponse | undefined>;
  setResult(key: string, value: CachedResponse, ttlSeconds: number): Promise<void>;
  /** Release the in-flight lock without caching a result (e.g. on 5xx). */
  releaseLock(key: string): Promise<void>;
}

const OK = 'OK';

/** Redis-backed store using atomic SET NX EX for the lock. */
export class RedisIdempotencyStore implements IdempotencyStore {
  constructor(private client: { set: (k: string, v: string, mode: string, ttl: string, seconds: number) => Promise<string | null>; get: (k: string) => Promise<string | null>; setex: (k: string, ttl: number, v: string) => Promise<string | null>; del: (k: string) => Promise<number>; }) {}

  async tryAcquire(key: string, ttlSeconds: number): Promise<'acquired' | 'processing' | 'exists'> {
    const resultKey = this.resultKey(key);
    // If a final result already exists, replay it.
    const existing = await this.client.get(resultKey);
    if (existing) return 'exists';
    // Try to acquire the processing lock.
    const acquired = await this.client.set(key, 'processing', 'NX', 'EX', ttlSeconds);
    return acquired === OK ? 'acquired' : 'processing';
  }

  async getResult(key: string): Promise<CachedResponse | undefined> {
    const raw = await this.client.get(this.resultKey(key));
    if (!raw) return undefined;
    try {
      return JSON.parse(raw) as CachedResponse;
    } catch {
      return undefined;
    }
  }

  async setResult(key: string, value: CachedResponse, ttlSeconds: number): Promise<void> {
    await this.client.setex(this.resultKey(key), ttlSeconds, JSON.stringify(value));
    await this.client.del(key); // release the processing lock
  }

  async releaseLock(key: string): Promise<void> {
    await this.client.del(key);
  }

  private resultKey = (key: string) => `${key}:result`;
}

interface MemEntry { value: 'processing' | CachedResponse; expiresAt: number; }

/** In-memory TTL store (dev/tests/fallback). */
export class MemoryIdempotencyStore implements IdempotencyStore {
  private store = new Map<string, MemEntry>();
  private now: () => number;
  constructor(now: () => number = Date.now) { this.now = now; }

  private prune(key: string): void {
    const e = this.store.get(key);
    if (e && e.expiresAt < this.now()) this.store.delete(key);
  }

  async tryAcquire(key: string, ttlSeconds: number): Promise<'acquired' | 'processing' | 'exists'> {
    this.prune(key);
    const e = this.store.get(key);
    if (e && e.value !== 'processing') return 'exists';
    if (e && e.value === 'processing') return 'processing';
    this.store.set(key, { value: 'processing', expiresAt: this.now() + ttlSeconds * 1000 });
    return 'acquired';
  }

  async getResult(key: string): Promise<CachedResponse | undefined> {
    this.prune(key);
    const e = this.store.get(key);
    return e && e.value !== 'processing' ? (e.value as CachedResponse) : undefined;
  }

  async setResult(key: string, value: CachedResponse, ttlSeconds: number): Promise<void> {
    this.store.set(key, { value, expiresAt: this.now() + ttlSeconds * 1000 });
  }

  async releaseLock(key: string): Promise<void> {
    this.store.delete(key);
  }
}

export interface IdempotencyOptions {
  headerName?: string;
  ttlSeconds?: number;
  store?: IdempotencyStore;
}

/** Build a scoped cache key from method + route + client key. */
function buildKey(req: Request, clientKey: string): string {
  const route = (req.route?.path || req.path || '').toString().slice(0, 64);
  return `idem:${req.method}:${route}:${clientKey}`;
}

/**
 * Express middleware. If no `Idempotency-Key` header is present the request
 * passes through unchanged (the contract nonce still guards on-chain replay).
 */
export function idempotency(opts: IdempotencyOptions = {}) {
  const headerName = (opts.headerName || 'idempotency-key').toLowerCase();
  const ttlSeconds = opts.ttlSeconds ?? 24 * 60 * 60; // 24h >= Stellar finality windows
  const store = opts.store || new MemoryIdempotencyStore();

  return async (req: Request, res: Response, next: NextFunction) => {
    const clientKey = (req.headers[headerName] as string | undefined)?.trim();
    if (!clientKey) return next(); // optional; contract nonce still protects

    const key = buildKey(req, clientKey);
    const state = await store.tryAcquire(key, ttlSeconds);

    if (state === 'exists') {
      const cached = await store.getResult(key);
      if (cached) {
        res.status(cached.status);
        if (cached.headers) for (const [k, v] of Object.entries(cached.headers)) res.set(k, v);
        res.set('X-Idempotent-Replay', 'true');
        return res.json(cached.body);
      }
    }
    if (state === 'processing') {
      return res.status(409).json({ error: 'IDEMPOTENCY_IN_FLIGHT', message: 'A request with this Idempotency-Key is already being processed' });
    }

    // state === 'acquired': capture the response and cache it.
    const originalJson = res.json.bind(res);
    res.json = ((body: unknown) => {
      const captured: CachedResponse = { status: res.statusCode, body };
      // Only cache successful + client-error responses; 5xx should be retryable,
      // so release the in-flight lock to let the client retry with the same key.
      if (res.statusCode < 500) {
        store.setResult(key, captured, ttlSeconds).catch(() => { /* non-fatal */ });
      } else {
        store.releaseLock(key).catch(() => { /* non-fatal */ });
      }
      return originalJson(body);
    }) as Response['json'];

    next();
  };
}

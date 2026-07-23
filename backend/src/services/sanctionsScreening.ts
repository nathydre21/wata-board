/**
 * Sanctions / PEP screening adapter layer.
 *
 * Defines a pluggable screening provider interface plus an in-memory mock
 * adapter and a result cache with a configurable refresh cadence. Real
 * providers (e.g. ComplyAdvantage, SumSub, Refinitiv) implement the same
 * interface and are injected at composition root.
 *
 * Raw screening artifacts are intentionally not stored here: only the derived
 * risk flags are returned so the caller can persist them in an encrypted
 * off-chain vault (see docs/KYC_ORCHESTRATION.md).
 */

export type ScreeningRisk = 'clear' | 'review' | 'rejected';

export interface ScreeningInput {
  userId: string;
  fullName: string;
  /** ISO date of birth if available */
  dateOfBirth?: string;
  /** Nationality / country codes */
  country?: string;
  /** Transaction context for risk scoring */
  transactionAmount?: number;
}

export interface ScreeningResult {
  userId: string;
  risk: ScreeningRisk;
  /** Match score 0..100 from the provider; 0 when clear */
  matchScore: number;
  /** Free-text reason from the provider (no PII at rest policy applies) */
  reason: string;
  /** Epoch ms when the screening was performed */
  screenedAt: number;
  /** Provider name for audit */
  provider: string;
  /** Whether this result came from cache */
  fromCache: boolean;
}

export interface SanctionsScreeningAdapter {
  readonly name: string;
  screen(input: ScreeningInput): Promise<ScreeningResult>;
}

/**
 * Cache entry with TTL. Screened results are reused until they expire, after
 * which a re-screen is forced (manual re-screen also supported).
 */
interface CacheEntry {
  result: ScreeningResult;
  expiresAt: number;
}

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // 24h

export class ScreeningResultCache {
  private store = new Map<string, CacheEntry>();
  constructor(private ttlMs: number = DEFAULT_TTL_MS) {}

  get(userId: string, now = Date.now()): ScreeningResult | undefined {
    const entry = this.store.get(userId);
    if (!entry) return undefined;
    if (entry.expiresAt < now) {
      this.store.delete(userId);
      return undefined;
    }
    return { ...entry.result, fromCache: true };
  }

  set(result: ScreeningResult, now = Date.now()): void {
    this.store.set(result.userId, {
      result: { ...result, fromCache: false },
      expiresAt: now + this.ttlMs,
    });
  }

  invalidate(userId: string): void {
    this.store.delete(userId);
  }

  clear(): void {
    this.store.clear();
  }
}

/**
 * Mock adapter used for tests and local development. Classifies a small set of
 * fixture names as "rejected" / "review" to exercise the orchestration paths;
 * everything else is "clear".
 */
export class MockSanctionsScreeningAdapter implements SanctionsScreeningAdapter {
  readonly name = 'mock-screening';
  private readonly blocklist = new Set(['sanctioned-entity', 'blocked-user']);
  private readonly reviewlist = new Set(['high-risk-individual']);

  async screen(input: ScreeningInput): Promise<ScreeningResult> {
    const name = (input.fullName || '').toLowerCase();
    let risk: ScreeningRisk = 'clear';
    let matchScore = 0;
    let reason = 'No matches found';

    if (this.blocklist.has(name)) {
      risk = 'rejected';
      matchScore = 98;
      reason = 'Direct match against sanctions list';
    } else if (this.reviewlist.has(name)) {
      risk = 'review';
      matchScore = 62;
      reason = 'PEP / adverse-media match requires manual review';
    } else if (input.transactionAmount && input.transactionAmount > 50000) {
      risk = 'review';
      matchScore = 35;
      reason = 'High-value transaction triggers enhanced due diligence';
    }

    return {
      userId: input.userId,
      risk,
      matchScore,
      reason,
      screenedAt: Date.now(),
      provider: this.name,
      fromCache: false,
    };
  }
}

/**
 * Cached screening facade: returns cached results when fresh, otherwise calls
 * the underlying adapter and caches the derived result.
 */
export class CachedScreeningAdapter implements SanctionsScreeningAdapter {
  readonly name: string;
  constructor(
    private readonly inner: SanctionsScreeningAdapter,
    private readonly cache: ScreeningResultCache,
  ) {
    this.name = inner.name;
  }

  async screen(input: ScreeningInput): Promise<ScreeningResult> {
    const cached = this.cache.get(input.userId);
    if (cached) return cached;
    const result = await this.inner.screen(input);
    this.cache.set(result);
    return result;
  }
}

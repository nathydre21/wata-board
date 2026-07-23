/**
 * KYC / AML orchestration service.
 *
 * Implements an idempotent, retry-safe verification state machine with a tier
 * matrix enforced on payment/refund paths, and integrates sanctions screening
 * via a pluggable adapter. Designed to be additive to the existing
 * kyc-service.ts (which stays in place for backward compatibility).
 *
 * State machine:
 *   Initiated -> DocumentsSubmitted -> Screening -> Review -> Approved
 *                                       |             |
 *                                       v             v
 *                                    Rejected      Rejected
 *
 * Transitions are idempotent: repeated identical transitions are no-ops, and
 * illegal transitions throw. A full audit log of every transition is kept.
 */

import {
  SanctionsScreeningAdapter,
  ScreeningInput,
  ScreeningResult,
  ScreeningRisk,
  CachedScreeningAdapter,
  MockSanctionsScreeningAdapter,
  ScreeningResultCache,
} from './sanctionsScreening';

export enum KycState {
  Initiated = 'Initiated',
  DocumentsSubmitted = 'DocumentsSubmitted',
  Screening = 'Screening',
  Review = 'Review',
  Approved = 'Approved',
  Rejected = 'Rejected',
}

export type KycTier = 0 | 1 | 2 | 3;

/** Hard limits enforced at the payment and refund routes per tier. */
export interface TierLimits {
  tier: KycTier;
  maxPaymentAmount: number; // 0 means blocked
  maxRefundAmount: number;
  canWithdraw: boolean;
  canOperateProviders: boolean;
}

export const TIER_MATRIX: Record<KycTier, TierLimits> = {
  0: { tier: 0, maxPaymentAmount: 0, maxRefundAmount: 0, canWithdraw: false, canOperateProviders: false },
  1: { tier: 1, maxPaymentAmount: 500, maxRefundAmount: 200, canWithdraw: false, canOperateProviders: false },
  2: { tier: 2, maxPaymentAmount: 10000, maxRefundAmount: 5000, canWithdraw: true, canOperateProviders: false },
  3: { tier: 3, maxPaymentAmount: Number.MAX_SAFE_INTEGER, maxRefundAmount: Number.MAX_SAFE_INTEGER, canWithdraw: true, canOperateProviders: true },
};

export interface KycRecord {
  userId: string;
  state: KycState;
  tier: KycTier;
  screening?: ScreeningResult;
  /** Epoch ms of last state change */
  updatedAt: number;
  /** Transition history for audit */
  history: KycAuditEntry[];
}

export interface KycAuditEntry {
  from: KycState | null;
  to: KycState;
  at: number;
  reason: string;
}

export interface KycEvent {
  type: 'state-transition' | 'screening-complete' | 'tier-upgraded' | 'screening-failed';
  userId: string;
  payload: Record<string, unknown>;
  at: number;
}

export type KycEventListener = (event: KycEvent) => void;

export interface RetryConfig {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

const DEFAULT_RETRY: RetryConfig = { maxAttempts: 4, baseDelayMs: 500, maxDelayMs: 8000 };

/** Legal transitions of the state machine. */
const ALLOWED: Record<KycState, KycState[]> = {
  [KycState.Initiated]: [KycState.DocumentsSubmitted, KycState.Rejected],
  [KycState.DocumentsSubmitted]: [KycState.Screening, KycState.Rejected],
  [KycState.Screening]: [KycState.Review, KycState.Approved, KycState.Rejected],
  [KycState.Review]: [KycState.Approved, KycState.Rejected],
  [KycState.Approved]: [],
  [KycState.Rejected]: [KycState.Initiated], // allow re-initiate after rejection
};

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export class KycOrchestrationService {
  private records = new Map<string, KycRecord>();
  private listeners: KycEventListener[] = [];

  constructor(
    private readonly screening: SanctionsScreeningAdapter = new CachedScreeningAdapter(
      new MockSanctionsScreeningAdapter(),
      new ScreeningResultCache(),
    ),
    private readonly retry: RetryConfig = DEFAULT_RETRY,
    private readonly now: () => number = Date.now,
  ) {}

  /** Subscribe to lifecycle events (webhook + email/push hooks plug in here). */
  on(listener: KycEventListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private emit(event: KycEvent): void {
    for (const l of this.listeners) {
      try {
        l(event);
      } catch {
        /* listeners must not break orchestration */
      }
    }
  }

  private getOrCreate(userId: string): KycRecord {
    let rec = this.records.get(userId);
    if (!rec) {
      rec = {
        userId,
        state: KycState.Initiated,
        tier: 0,
        updatedAt: this.now(),
        history: [{ from: null, to: KycState.Initiated, at: this.now(), reason: 'initiated' }],
      };
      this.records.set(userId, rec);
    }
    return rec;
  }

  /** Idempotent state transition. Repeated identical transitions are no-ops. */
  transition(userId: string, to: KycState, reason = ''): KycRecord {
    const rec = this.getOrCreate(userId);
    if (rec.state === to) {
      return rec; // idempotent no-op
    }
    const allowed = ALLOWED[rec.state];
    if (!allowed || !allowed.includes(to)) {
      throw new Error(`Illegal KYC transition: ${rec.state} -> ${to}`);
    }
    const from = rec.state;
    rec.history.push({ from, to, at: this.now(), reason });
    rec.state = to;
    rec.updatedAt = this.now();
    if (to === KycState.Approved && rec.tier < 1) {
      rec.tier = 1;
      this.emit({ type: 'tier-upgraded', userId, at: this.now(), payload: { tier: 1 } });
    }
    this.emit({ type: 'state-transition', userId, at: this.now(), payload: { from, to, reason } });
    return rec;
  }

  submitDocuments(userId: string): KycRecord {
    return this.transition(userId, KycState.DocumentsSubmitted, 'documents submitted');
  }

  /**
   * Run sanctions screening with retry + exponential backoff. On provider
   * failure the user is moved to Review (safe degradation) rather than left in
   * an indeterminate Screening state; high-value payments remain blocked
   * until a human resolves the review.
   */
  async runScreening(input: ScreeningInput): Promise<KycRecord> {
    const rec = this.getOrCreate(input.userId);
    // move to Screening (idempotent)
    if (rec.state !== KycState.Screening) {
      this.transition(input.userId, KycState.Screening, 'screening started');
    }

    let result: ScreeningResult | undefined;
    let lastError: unknown;
    for (let attempt = 1; attempt <= this.retry.maxAttempts; attempt++) {
      try {
        result = await this.screening.screen(input);
        break;
      } catch (err) {
        lastError = err;
        if (attempt < this.retry.maxAttempts) {
          const delay = Math.min(
            this.retry.baseDelayMs * 2 ** (attempt - 1),
            this.retry.maxDelayMs,
          );
          await sleep(delay);
        }
      }
    }

    if (!result) {
      // Graceful degradation: cannot screen -> human review, block high-value.
      this.transition(input.userId, KycState.Review, `screening provider unavailable: ${String(lastError)}`);
      this.emit({
        type: 'screening-failed',
        userId: input.userId,
        at: this.now(),
        payload: { error: String(lastError) },
      });
      return this.records.get(input.userId)!;
    }

    rec.screening = result;
    this.emit({
      type: 'screening-complete',
      userId: input.userId,
      at: this.now(),
      payload: { risk: result.risk, matchScore: result.matchScore },
    });

    if (result.risk === 'clear') {
      this.transition(input.userId, KycState.Approved, 'screening clear');
    } else {
      // 'review' or 'rejected' both route to manual Review; reviewer decides.
      this.transition(input.userId, KycState.Review, `screening=${result.risk}: ${result.reason}`);
    }
    return rec;
  }

  /** Manual reviewer decision after screening routed to Review. */
  reviewerDecision(userId: string, approve: boolean, reason = ''): KycRecord {
    if (approve) {
      this.transition(userId, KycState.Approved, reason || 'manual approval');
    } else {
      this.transition(userId, KycState.Rejected, reason || 'manual rejection');
    }
    const rec = this.records.get(userId)!;
    if (approve && rec.tier < 1) {
      rec.tier = 1;
      this.emit({ type: 'tier-upgraded', userId, at: this.now(), payload: { tier: 1 } });
    }
    return rec;
  }

  /** Operator-driven tier upgrade (e.g. after additional verification). */
  setTier(userId: string, tier: KycTier): KycRecord {
    const rec = this.getOrCreate(userId);
    if (rec.state !== KycState.Approved) {
      throw new Error(`Cannot set tier: user not in Approved state (current=${rec.state})`);
    }
    rec.tier = tier;
    rec.updatedAt = this.now();
    this.emit({ type: 'tier-upgraded', userId, at: this.now(), payload: { tier } });
    return rec;
  }

  getRecord(userId: string): KycRecord | undefined {
    return this.records.get(userId);
  }

  getTier(userId: string): KycTier {
    return this.records.get(userId)?.tier ?? 0;
  }

  getLimits(userId: string): TierLimits {
    return TIER_MATRIX[this.getTier(userId)];
  }

  /** Force a re-screen of a flagged user (bypasses cache). */
  async rescreen(userId: string, input: ScreeningInput): Promise<KycRecord> {
    // Reset to Screening; the cached adapter will return a fresh result only if
    // cache was invalidated. We invalidate explicitly to support manual re-screen.
    if (this.screening instanceof CachedScreeningAdapter) {
      (this.screening as CachedScreeningAdapter & { cache: ScreeningResultCache })['cache'].invalidate(userId);
    }
    return this.runScreening(input);
  }

  // ---- Enforcement helpers used by middleware ------------------------------

  /** Returns true if the user is allowed to make a payment of `amount`. */
  assertCanPay(userId: string, amount: number): void {
    const limits = this.getLimits(userId);
    if (limits.maxPaymentAmount === 0) {
      throw new KycEnforcementError('KYC required before making payments', 'KYC_REQUIRED');
    }
    if (amount > limits.maxPaymentAmount) {
      throw new KycEnforcementError(
        `Amount ${amount} exceeds tier ${limits.tier} payment limit ${limits.maxPaymentAmount}`,
        'TIER_LIMIT_EXCEEDED',
      );
    }
  }

  assertCanRefund(userId: string, amount: number): void {
    const limits = this.getLimits(userId);
    if (limits.maxRefundAmount === 0) {
      throw new KycEnforcementError('KYC required before issuing refunds', 'KYC_REQUIRED');
    }
    if (amount > limits.maxRefundAmount) {
      throw new KycEnforcementError(
        `Refund ${amount} exceeds tier ${limits.tier} refund limit ${limits.maxRefundAmount}`,
        'TIER_LIMIT_EXCEEDED',
      );
    }
  }
}

export class KycEnforcementError extends Error {
  constructor(message: string, public code: 'KYC_REQUIRED' | 'TIER_LIMIT_EXCEEDED') {
    super(message);
    this.name = 'KycEnforcementError';
  }
}

/** Default singleton wired with the mock adapter (swap at composition root). */
export const kycOrchestration = new KycOrchestrationService();

/**
 * Cross-provider payment router with deterministic failover, settlement
 * finality gating, and a partial-failure saga with compensation.
 *
 * Additive to MultiProviderPaymentService: this module provides the routing
 * strategy, the bulk-payment saga, and finality polling. All external
 * dependencies (submission, compensation, horizon finality, provider health)
 * are injected so the module is fully unit-testable without Stellar.
 */

export type SelectionStrategy = 'round-robin' | 'weighted' | 'health-gated';

export type LegStatus = 'pending' | 'confirmed' | 'failed' | 'compensated' | 'not_sealed';

export interface ProviderRouteInfo {
  id: string;
  name: string;
  active: boolean;
  /** Recent success rate 0..1, used by the weighted + health-gated strategies. */
  successRate: number;
}

/** Health gate — returns false when a provider's breaker is open / unhealthy. */
export interface ProviderHealth {
  isAvailable(providerId: string): boolean;
}

export interface PaymentLeg {
  providerId: string;
  meterId: string;
  amount: number;
}

export interface SubmittedLeg {
  providerId: string;
  transactionHash: string;
  status: LegStatus;
  ledger?: number;
  error?: string;
}

export interface BulkPaymentResult {
  legs: SubmittedLeg[];
  settled: boolean;
  compensated: boolean;
  finalizationStatus: 'confirmed' | 'pending' | 'failed';
}

export interface RouterDeps {
  /** Submit one leg to its provider; resolves with a transaction hash. */
  submit: (leg: PaymentLeg) => Promise<string>;
  /** Compensate (refund) an already-submitted leg by its transaction hash. */
  compensate: (transactionHash: string) => Promise<void>;
  /** Poll horizon for ledger finality of a transaction. */
  horizon: { isFinalized(transactionHash: string): Promise<{ sealed: boolean; ledger?: number }> };
  /** Provider health / circuit-breaker gate. */
  health: ProviderHealth;
  /** Per-leg finality polling budget. */
  finalityTimeoutMs?: number;
  /** Interval between finality polls. */
  finalityPollMs?: number;
  /** Clock for sleeps (ms) — injectable for fast tests. */
  sleep?: (ms: number) => Promise<void>;
}

export type SagaEvent =
  | { type: 'BulkPaymentSettled'; legs: SubmittedLeg[] }
  | { type: 'BulkPaymentCompensated'; failed: SubmittedLeg; compensated: SubmittedLeg[] }
  | { type: 'LegSubmitted'; leg: SubmittedLeg }
  | { type: 'LegFailed'; providerId: string; error: string };

export type SagaEventListener = (event: SagaEvent) => void;

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Order providers for routing / failover according to the strategy. Providers
 * whose health gate reports unavailable (open breaker) are excluded.
 */
export function routeProviders(
  providers: ProviderRouteInfo[],
  strategy: SelectionStrategy,
  health: ProviderHealth,
  rrCursor: { i: number } = { i: 0 },
): ProviderRouteInfo[] {
  const available = providers.filter((p) => p.active && health.isAvailable(p.id));
  if (!available.length) return [];

  switch (strategy) {
    case 'round-robin': {
      const start = ((rrCursor.i % available.length) + available.length) % available.length;
      rrCursor.i = start + 1;
      const ordered = [...available.slice(start), ...available.slice(0, start)];
      return ordered;
    }
    case 'weighted': {
      // Weighted by success rate (desc), with a small floor so a 0-rate provider
      // can still be tried as failover rather than never used.
      return [...available].sort((a, b) => (b.successRate + 0.05) - (a.successRate + 0.05));
    }
    case 'health-gated': {
      // Only providers above a success-rate threshold, sorted by success rate.
      const gated = available.filter((p) => p.successRate >= 0.8);
      const pool = gated.length ? gated : available; // fall back if none qualify
      return [...pool].sort((a, b) => b.successRate - a.successRate);
    }
    default:
      return available;
  }
}

/**
 * Bulk-payment saga. Submits each leg to its provider; on the first leg failure
 * it compensates (refunds) all already-submitted legs and aborts. Successful
 * submissions are NOT marked confirmed until their ledger is sealed (finality
 * polling); legs not sealed within the budget stay `not_sealed` and the bulk
 * result's finalizationStatus is `pending`.
 */
export async function processBulkPayment(
  legs: PaymentLeg[],
  deps: RouterDeps,
  listeners: SagaEventListener[] = [],
): Promise<BulkPaymentResult> {
  const emit = (e: SagaEvent) => { for (const l of listeners) { try { l(e); } catch { /* ignore */ } } };
  const submitted: SubmittedLeg[] = [];
  const finalityTimeoutMs = deps.finalityTimeoutMs ?? 30_000;
  const pollMs = deps.finalityPollMs ?? 2_000;
  const sleep = deps.sleep ?? defaultSleep;

  // 1) Submit each leg; fail-fast on the first error, then compensate.
  for (const leg of legs) {
    try {
      const hash = await deps.submit(leg);
      const s: SubmittedLeg = { providerId: leg.providerId, transactionHash: hash, status: 'pending' };
      submitted.push(s);
      emit({ type: 'LegSubmitted', leg: s });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      emit({ type: 'LegFailed', providerId: leg.providerId, error });
      // Compensate already-submitted legs (reverse order).
      const compensated: SubmittedLeg[] = [];
      for (const s of [...submitted].reverse()) {
        try {
          await deps.compensate(s.transactionHash);
          s.status = 'compensated';
          compensated.push(s);
        } catch {
          // compensation failed — leave as pending; needs manual reconciliation.
          s.status = 'pending';
        }
      }
      const failed: SubmittedLeg = { providerId: leg.providerId, transactionHash: '', status: 'failed', error };
      emit({ type: 'BulkPaymentCompensated', failed, compensated });
      return { legs: [...submitted, failed], settled: false, compensated: compensated.length > 0, finalizationStatus: 'failed' };
    }
  }

  // 2) Finality gating: do not mark confirmed until each ledger is sealed.
  let allSealed = true;
  for (const s of submitted) {
    const deadline = Date.now() + finalityTimeoutMs;
    let sealed = false;
    while (Date.now() < deadline) {
      const res = await deps.horizon.isFinalized(s.transactionHash);
      if (res.sealed) {
        sealed = true;
        s.status = 'confirmed';
        s.ledger = res.ledger;
        break;
      }
      await sleep(pollMs);
    }
    if (!sealed) {
      s.status = 'not_sealed';
      allSealed = false;
    }
  }

  if (allSealed) {
    emit({ type: 'BulkPaymentSettled', legs: submitted });
    return { legs: submitted, settled: true, compensated: false, finalizationStatus: 'confirmed' };
  }
  // Sealed partially or none yet — stay pending; legs carry their own status.
  return { legs: submitted, settled: false, compensated: false, finalizationStatus: 'pending' };
}

/**
 * Adapter that backs ProviderHealth with the existing CircuitBreaker instances.
 * A provider is "available" when its breaker is not OPEN.
 */
export function circuitBreakerHealth(
  breakers: Map<string, { getState(): { name: string; state: string } | string }>,
): ProviderHealth {
  return {
    isAvailable(providerId: string): boolean {
      const b = breakers.get(providerId);
      if (!b) return true;
      const state: any = (b as any).getState?.();
      const stateValue = typeof state === 'object' && state ? (state as any).state : state;
      return stateValue !== 'OPEN';
    },
  };
}

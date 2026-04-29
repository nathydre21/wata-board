/**
 * Contract Proxy
 *
 * Implements the transparent proxy pattern for Soroban smart contract upgrades.
 *
 * Responsibilities:
 *   1. Route payment calls to the correct contract version (active or legacy)
 *   2. Track which contract version processed each payment
 *   3. Circuit-break to the previous version when the new one fails
 *   4. Expose version-aware contract client factory
 *
 * The proxy sits between the payment service and the Soroban RPC layer.
 * It never changes the caller's interface — callers always call `proxy.invoke()`.
 */

import logger from '../utils/logger';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface ContractVersionEntry {
  version: string;
  contractId: string;
  network: 'testnet' | 'mainnet';
  wasmHash: string;
  status: 'active' | 'archived' | 'rolled_back' | 'pending';
  deployedAt: Date;
  deployedBy: string;
}

export interface ProxyInvokeOptions {
  /** Force routing to a specific version instead of the active one */
  forceVersion?: string;
  /** Payment ID to record in the routing table */
  paymentId?: string;
}

export interface ProxyInvokeResult<T = unknown> {
  result: T;
  contractId: string;
  version: string;
  routedAt: Date;
}

export interface CircuitBreakerState {
  failures: number;
  lastFailure: Date | null;
  open: boolean;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const CIRCUIT_BREAKER_THRESHOLD = 3;   // failures before opening
const CIRCUIT_BREAKER_RESET_MS  = 60_000; // 1 min half-open window

// ── ContractProxy ──────────────────────────────────────────────────────────────

export class ContractProxy {
  private versions: Map<string, ContractVersionEntry> = new Map();
  private activeVersion: string | null = null;

  /** payment_id → version string (in-memory routing cache) */
  private routingCache: Map<string, string> = new Map();

  /** version → circuit breaker state */
  private circuitBreakers: Map<string, CircuitBreakerState> = new Map();

  // ── Version Registry ─────────────────────────────────────────────────────────

  registerVersion(entry: ContractVersionEntry): void {
    this.versions.set(entry.version, entry);
    this.circuitBreakers.set(entry.version, {
      failures: 0,
      lastFailure: null,
      open: false,
    });
    logger.info('[ContractProxy] Version registered', {
      version: entry.version,
      contractId: entry.contractId,
      status: entry.status,
    });
  }

  activateVersion(version: string): void {
    const entry = this.versions.get(version);
    if (!entry) throw new Error(`Version ${version} not registered in proxy`);

    // Archive the current active version
    if (this.activeVersion && this.activeVersion !== version) {
      const prev = this.versions.get(this.activeVersion);
      if (prev) prev.status = 'archived';
    }

    entry.status = 'active';
    this.activeVersion = version;
    logger.info('[ContractProxy] Active version set', { version, contractId: entry.contractId });
  }

  rollbackVersion(targetVersion: string): void {
    const target = this.versions.get(targetVersion);
    if (!target) throw new Error(`Version ${targetVersion} not found in proxy registry`);

    if (this.activeVersion) {
      const current = this.versions.get(this.activeVersion);
      if (current) current.status = 'rolled_back';
    }

    target.status = 'active';
    this.activeVersion = targetVersion;
    logger.warn('[ContractProxy] Rolled back to version', { targetVersion });
  }

  getActiveVersion(): ContractVersionEntry | null {
    if (!this.activeVersion) return null;
    return this.versions.get(this.activeVersion) ?? null;
  }

  getVersion(version: string): ContractVersionEntry | undefined {
    return this.versions.get(version);
  }

  getAllVersions(): ContractVersionEntry[] {
    return Array.from(this.versions.values()).sort(
      (a, b) => a.deployedAt.getTime() - b.deployedAt.getTime(),
    );
  }

  // ── Routing ──────────────────────────────────────────────────────────────────

  /**
   * Resolve which contract version should handle a call.
   * - If paymentId is provided and already routed, return that version (idempotency).
   * - If forceVersion is set, use that.
   * - Otherwise use the active version, falling back to the previous archived one
   *   if the active circuit breaker is open.
   */
  resolveVersion(opts: ProxyInvokeOptions = {}): ContractVersionEntry {
    // Idempotent re-routing for existing payments
    if (opts.paymentId) {
      const cached = this.routingCache.get(opts.paymentId);
      if (cached) {
        const entry = this.versions.get(cached);
        if (entry) return entry;
      }
    }

    if (opts.forceVersion) {
      const entry = this.versions.get(opts.forceVersion);
      if (!entry) throw new Error(`Forced version ${opts.forceVersion} not found`);
      return entry;
    }

    if (!this.activeVersion) throw new Error('No active contract version registered');

    const active = this.versions.get(this.activeVersion)!;
    const cb = this.circuitBreakers.get(this.activeVersion)!;

    if (this.isCircuitOpen(cb)) {
      logger.warn('[ContractProxy] Circuit open for active version, falling back', {
        version: this.activeVersion,
      });
      const fallback = this.getFallbackVersion();
      if (!fallback) throw new Error('Circuit open and no fallback version available');
      return fallback;
    }

    return active;
  }

  /**
   * Invoke a contract method through the proxy.
   *
   * The `executor` receives the resolved ContractVersionEntry and should
   * perform the actual Soroban RPC call, returning the result.
   */
  async invoke<T>(
    executor: (entry: ContractVersionEntry) => Promise<T>,
    opts: ProxyInvokeOptions = {},
  ): Promise<ProxyInvokeResult<T>> {
    const entry = this.resolveVersion(opts);
    const routedAt = new Date();

    try {
      const result = await executor(entry);

      // Record routing for this payment
      if (opts.paymentId) {
        this.routingCache.set(opts.paymentId, entry.version);
      }

      // Reset circuit breaker on success
      this.resetCircuitBreaker(entry.version);

      return { result, contractId: entry.contractId, version: entry.version, routedAt };
    } catch (err: any) {
      this.recordFailure(entry.version);
      logger.error('[ContractProxy] Invocation failed', {
        version: entry.version,
        error: err.message,
      });
      throw err;
    }
  }

  // ── Payment Routing Lookup ───────────────────────────────────────────────────

  /** Returns the contract version that processed a given payment (from cache). */
  getPaymentVersion(paymentId: string): string | undefined {
    return this.routingCache.get(paymentId);
  }

  /** Bulk-load routing entries (e.g. from DB on startup). */
  loadRoutingCache(entries: Array<{ paymentId: string; version: string }>): void {
    for (const { paymentId, version } of entries) {
      this.routingCache.set(paymentId, version);
    }
    logger.info('[ContractProxy] Routing cache loaded', { count: entries.length });
  }

  // ── Circuit Breaker ──────────────────────────────────────────────────────────

  private isCircuitOpen(cb: CircuitBreakerState): boolean {
    if (!cb.open) return false;
    // Half-open: allow retry after reset window
    if (cb.lastFailure && Date.now() - cb.lastFailure.getTime() > CIRCUIT_BREAKER_RESET_MS) {
      cb.open = false;
      cb.failures = 0;
      return false;
    }
    return true;
  }

  private recordFailure(version: string): void {
    const cb = this.circuitBreakers.get(version);
    if (!cb) return;
    cb.failures += 1;
    cb.lastFailure = new Date();
    if (cb.failures >= CIRCUIT_BREAKER_THRESHOLD) {
      cb.open = true;
      logger.error('[ContractProxy] Circuit breaker opened', { version, failures: cb.failures });
    }
  }

  private resetCircuitBreaker(version: string): void {
    const cb = this.circuitBreakers.get(version);
    if (cb) { cb.failures = 0; cb.open = false; }
  }

  private getFallbackVersion(): ContractVersionEntry | null {
    // Find the most recently archived version
    const archived = Array.from(this.versions.values())
      .filter(v => v.status === 'archived')
      .sort((a, b) => b.deployedAt.getTime() - a.deployedAt.getTime());
    return archived[0] ?? null;
  }

  getCircuitBreakerStatus(): Record<string, CircuitBreakerState> {
    const out: Record<string, CircuitBreakerState> = {};
    this.circuitBreakers.forEach((state, version) => { out[version] = { ...state }; });
    return out;
  }
}

/** Singleton proxy instance shared across the application */
export const contractProxy = new ContractProxy();

import logger from './logger';

/**
 * Possible states of a circuit breaker.
 *
 * - CLOSED  : Normal operation — calls pass through.
 * - OPEN    : Too many failures — calls are rejected immediately without hitting
 *             the external service.
 * - HALF_OPEN: Recovery probe — one trial call is allowed after the recovery
 *             window expires. Success → CLOSED; failure → OPEN (reset timer).
 */
export enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

/** Configuration options for a CircuitBreaker instance. */
export interface CircuitBreakerConfig {
  /**
   * Number of consecutive failures required before the circuit opens.
   * @default 5
   */
  failureThreshold: number;

  /**
   * Milliseconds to wait in OPEN state before transitioning to HALF_OPEN.
   * @default 60000 (60 s)
   */
  recoveryTimeMs: number;

  /**
   * Optional human-readable name used in log messages.
   * @default 'default'
   */
  name?: string;
}

/** Error thrown when a call is attempted while the circuit is OPEN. */
export class CircuitOpenError extends Error {
  public readonly circuitName: string;
  public readonly state: CircuitState;

  constructor(circuitName: string) {
    super(
      `Circuit breaker "${circuitName}" is OPEN — external service calls are temporarily blocked.`
    );
    this.name = 'CircuitOpenError';
    this.circuitName = circuitName;
    this.state = CircuitState.OPEN;
    // Maintains proper prototype chain for instanceof checks in transpiled JS.
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * A lightweight circuit breaker that protects external service calls from
 * cascading failures.
 *
 * Usage:
 * ```ts
 * const cb = new CircuitBreaker({ failureThreshold: 3, recoveryTimeMs: 30_000, name: 'stripe' });
 * const result = await cb.execute(() => stripe.charge(payload));
 * ```
 */
export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount: number = 0;
  private lastFailureTime: number = 0;
  private readonly config: Required<CircuitBreakerConfig>;

  constructor(config: CircuitBreakerConfig) {
    this.config = {
      failureThreshold: config.failureThreshold,
      recoveryTimeMs: config.recoveryTimeMs,
      name: config.name ?? 'default',
    };
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  /**
   * Execute `fn` through the circuit breaker.
   *
   * - CLOSED    : Calls `fn`. On failure increments the counter; opens the
   *               circuit when the threshold is reached.
   * - OPEN      : Throws `CircuitOpenError` immediately without calling `fn`,
   *               unless enough time has passed to attempt a recovery probe.
   * - HALF_OPEN : Allows exactly one call. Success closes the circuit; failure
   *               re-opens it and resets the recovery timer.
   *
   * @throws {CircuitOpenError} when the circuit is OPEN and recovery time has
   *   not yet elapsed.
   * @throws The original error from `fn` on execution failure.
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    this.evaluateState();

    if (this.state === CircuitState.OPEN) {
      logger.warn('Circuit breaker is OPEN — rejecting call', {
        circuit: this.config.name,
        failureCount: this.failureCount,
        recoveryAt: new Date(this.lastFailureTime + this.config.recoveryTimeMs).toISOString(),
      });
      throw new CircuitOpenError(this.config.name);
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure(error);
      throw error;
    }
  }

  /** Current state of the circuit breaker. */
  getState(): CircuitState {
    this.evaluateState();
    return this.state;
  }

  /** Number of consecutive failures recorded since the last reset. */
  getFailureCount(): number {
    return this.failureCount;
  }

  /**
   * Manually reset the circuit breaker to CLOSED state.
   * Intended for admin/maintenance use only.
   */
  reset(): void {
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.lastFailureTime = 0;
    logger.info('Circuit breaker manually reset', { circuit: this.config.name });
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  /**
   * Re-evaluate state transitions driven by elapsed time:
   * OPEN → HALF_OPEN once `recoveryTimeMs` has passed.
   */
  private evaluateState(): void {
    if (
      this.state === CircuitState.OPEN &&
      Date.now() - this.lastFailureTime >= this.config.recoveryTimeMs
    ) {
      this.state = CircuitState.HALF_OPEN;
      logger.info('Circuit breaker transitioning to HALF_OPEN — sending probe request', {
        circuit: this.config.name,
      });
    }
  }

  /** Called after a successful execution. */
  private onSuccess(): void {
    if (this.state === CircuitState.HALF_OPEN) {
      logger.info('Circuit breaker probe succeeded — circuit CLOSED', {
        circuit: this.config.name,
      });
    }
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.lastFailureTime = 0;
  }

  /** Called after a failed execution. */
  private onFailure(error: unknown): void {
    this.failureCount += 1;
    this.lastFailureTime = Date.now();

    const errorMessage = error instanceof Error ? error.message : String(error);

    if (this.state === CircuitState.HALF_OPEN) {
      // Probe failed — reopen the circuit.
      this.state = CircuitState.OPEN;
      logger.warn('Circuit breaker probe FAILED — circuit re-OPENED', {
        circuit: this.config.name,
        error: errorMessage,
        failureCount: this.failureCount,
      });
      return;
    }

    if (this.failureCount >= this.config.failureThreshold) {
      this.state = CircuitState.OPEN;
      logger.error('Circuit breaker OPENED — failure threshold reached', {
        circuit: this.config.name,
        failureCount: this.failureCount,
        threshold: this.config.failureThreshold,
        error: errorMessage,
        recoveryAt: new Date(this.lastFailureTime + this.config.recoveryTimeMs).toISOString(),
      });
    } else {
      logger.warn('Circuit breaker recorded failure', {
        circuit: this.config.name,
        failureCount: this.failureCount,
        threshold: this.config.failureThreshold,
        error: errorMessage,
      });
    }
  }
}

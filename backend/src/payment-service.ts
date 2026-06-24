import { RateLimiter, RateLimitConfig, RateLimitResult } from './rate-limiter';
import { kycService, KYCStatus } from './services/kyc-service';
import logger, { auditLogger } from './utils/logger';
import { PaymentRequest as SharedPaymentRequest, PaymentResponse, RateLimitInfo, createApiResponse } from '../../../shared/types';
import { accountingService } from './accounting-service';
import { CircuitBreaker, CircuitBreakerConfig, CircuitOpenError } from './utils/circuitBreaker';


// Legacy interface for backward compatibility - deprecated
export interface PaymentRequest {
  meter_id: string;
  amount: number;
  userId: string;
}

// Updated interface using standardized types
export interface PaymentResult extends PaymentResponse {
  rateLimitInfo?: RateLimitResult;
}

// ─── Input validation helpers ────────────────────────────────────────────────

/** Alphanumeric + hyphens + underscores, 1-50 chars, no spaces/special chars. */
const METER_ID_RE = /^[a-zA-Z0-9_-]{1,50}$/;

/** Alphanumeric + hyphens + underscores, 1-100 chars. */
const USER_ID_RE = /^[a-zA-Z0-9_-]{1,100}$/;

function validatePaymentRequest(request: PaymentRequest): string | null {
  const { meter_id, amount, userId } = request;

  // Validate userId
  if (!userId || typeof userId !== 'string' || !USER_ID_RE.test(userId.trim())) {
    return 'Invalid user ID format';
  }

  // Validate meter_id
  if (!meter_id || typeof meter_id !== 'string' || !METER_ID_RE.test(meter_id.trim())) {
    return 'Invalid meter ID format';
  }

  // Validate amount
  if (
    amount === undefined ||
    amount === null ||
    typeof amount !== 'number' ||
    !Number.isFinite(amount) ||
    amount <= 0
  ) {
    return 'Invalid amount: must be a finite positive number';
  }

  return null; // valid
}

// Helper function to convert legacy PaymentRequest to standardized format
function convertToStandardRequest(legacyRequest: PaymentRequest): SharedPaymentRequest {
  return {
    meterId: legacyRequest.meter_id,
    amount: legacyRequest.amount,
    userId: legacyRequest.userId,
    timestamp: new Date().toISOString()
  };
}

/** Default circuit breaker configuration for the payment provider. */
const DEFAULT_CB_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  recoveryTimeMs: 60000, // 60 seconds
  name: 'payment-provider',
};

export class PaymentService {
  public rateLimiter: RateLimiter;
  private pendingPayments: Map<string, PaymentRequest> = new Map();
  public circuitBreaker: CircuitBreaker;

  constructor(rateLimitConfig: RateLimitConfig, circuitBreakerConfig?: Partial<CircuitBreakerConfig>) {
    this.rateLimiter = new RateLimiter(rateLimitConfig);
    this.circuitBreaker = new CircuitBreaker({
      ...DEFAULT_CB_CONFIG,
      ...circuitBreakerConfig,
    });
  }

  /**
   * Process payment with input validation, rate limiting, and circuit breaker
   * protection around the external provider call.
   */
  async processPayment(request: PaymentRequest): Promise<PaymentResult> {
    try {
      // 0. Input validation
      const validationError = validatePaymentRequest(request);
      if (validationError) {
        return {
          success: false,
          error: validationError,
          timestamp: new Date().toISOString()
        };
      }

      // 1. KYC Check
      const kycStatus = await kycService.getStatus(request.userId);
      if (kycStatus !== KYCStatus.VERIFIED) {
        return {
          success: false,
          error: `KYC Verification Required. Current status: ${kycStatus}`,
          timestamp: new Date().toISOString()
        };
      }

      // 2. AML Check
      const amlPassed = await kycService.performAMLCheck(request.userId, request.amount);
      if (!amlPassed) {
        return {
          success: false,
          error: 'Transaction flagged by AML monitoring system.',
          timestamp: new Date().toISOString()
        };
      }

      // Convert to standardized format (used for audit trail)
      const standardRequest = convertToStandardRequest(request);

      // 3. Rate limit check
      const rateLimitResult = await this.rateLimiter.checkLimit(request.userId);

      // Convert RateLimitResult to RateLimitInfo for standardized response
      const rateLimitInfo: RateLimitInfo = {
        remainingRequests: rateLimitResult.remainingRequests,
        resetTime: rateLimitResult.resetTime?.toISOString(),
        queued: rateLimitResult.queued,
        queuePosition: rateLimitResult.queuePosition,
        allowed: rateLimitResult.allowed,
        limit: rateLimitResult.limit
      };

      if (!rateLimitResult.allowed && !rateLimitResult.queued) {
        logger.warn('Payment rejected: rate limit exceeded', { userId: request.userId, rateLimitResult });
        auditLogger.log('Payment rejected due to rate limit', {
          userId: request.userId,
          meterId: request.meter_id,
          amount: request.amount,
          reason: 'rate_limit_exceeded'
        });
        return {
          success: false,
          error: this.getRateLimitError(rateLimitResult),
          timestamp: new Date().toISOString(),
          rateLimitInfo
        };
      }

      if (rateLimitResult.queued) {
        logger.info('Payment queued', { userId: request.userId, queuePosition: rateLimitResult.queuePosition });
        auditLogger.log('Payment queued for processing', {
          userId: request.userId,
          meterId: request.meter_id,
          amount: request.amount,
          queuePosition: rateLimitResult.queuePosition
        });
        return {
          success: false,
          error: this.getQueueMessage(rateLimitResult),
          timestamp: new Date().toISOString(),
          rateLimitInfo
        };
      }

      // 4. Execute payment through the circuit breaker
      const paymentId = this.generatePaymentId();
      this.pendingPayments.set(paymentId, request);

      try {
        const transactionId = await this.circuitBreaker.execute(() =>
          this.executePayment(request)
        );

        auditLogger.log('Payment executed successfully', {
          userId: request.userId,
          transactionId,
          meterId: request.meter_id,
          amount: request.amount,
          status: 'success'
        });

        // Asynchronously sync with accounting software
        accountingService.syncPayment({
          paymentId,
          transactionId,
          meterId: request.meter_id,
          amount: request.amount,
          userId: request.userId,
          timestamp: new Date().toISOString()
        }).catch(err => logger.error('Failed to sync payment with accounting software', { error: err }));

        return {
          success: true,
          transactionId,
          timestamp: new Date().toISOString(),
          rateLimitInfo
        };
      } catch (error) {
        if (error instanceof CircuitOpenError) {
          auditLogger.log('Payment blocked - circuit breaker is OPEN', {
            userId: request.userId,
            meterId: request.meter_id,
            amount: request.amount,
            circuit: error.circuitName
          });
          return {
            success: false,
            error: error.message,
            timestamp: new Date().toISOString(),
            rateLimitInfo
          };
        }
        throw error; // re-throw non-circuit-breaker errors to outer catch
      } finally {
        this.pendingPayments.delete(paymentId);
      }

    } catch (error) {
      logger.error('Payment processing failed', { error, request });
      auditLogger.log('Payment failed', {
        userId: request.userId,
        meterId: request.meter_id,
        amount: request.amount,
        error: error instanceof Error ? error.message : 'Unknown error',
        status: 'failed'
      });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown payment error',
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Execute the actual payment transaction (called via circuit breaker).
   */
  private async executePayment(request: PaymentRequest): Promise<string> {
    // Import the client dynamically to avoid circular dependencies
    const NepaClient = await import('../packages/nepa_client_v2');

    const client = new NepaClient.Client({
      ...NepaClient.networks.testnet,
      rpcUrl: 'https://soroban-testnet.stellar.org:443',
    });

    const tx = await client.pay_bill({
      meter_id: request.meter_id,
      amount: request.amount
    });

    // For backend processing, we need to sign with the admin key
    // Using secure key management
    const { secureEnvConfig } = await import('./utils/secureEnvConfig');
    const adminSecret = secureEnvConfig.getAdminSecretKey();

    const { Keypair } = await import('@stellar/stellar-sdk');
    const adminKeypair = Keypair.fromSecret(adminSecret);

    await tx.signAndSend({
      signTransaction: async (transaction: any) => {
        logger.debug('Signing payment transaction', { meter_id: request.meter_id });
        transaction.sign(adminKeypair);
        return transaction.toXDR();
      }
    });

    return tx.hash || 'tx_' + Date.now();
  }

  /**
   * Get user-friendly rate limit error message
   */
  private getRateLimitError(rateLimit: RateLimitResult): string {
    const waitTime = Math.ceil((rateLimit.resetTime.getTime() - Date.now()) / 1000);
    return `Rate limit exceeded. Please wait ${waitTime} seconds before trying again.`;
  }

  /**
   * Get queue message
   */
  private getQueueMessage(rateLimit: RateLimitResult): string {
    if (rateLimit.queuePosition) {
      return `Payment queued. You are position #${rateLimit.queuePosition} in the queue.`;
    }
    return 'Payment queued. Please wait for processing.';
  }

  /**
   * Generate unique payment ID
   */
  private generatePaymentId(): string {
    return 'pay_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  /**
   * Get current rate limit status for a user
   */
  getRateLimitStatus(userId: string): RateLimitResult {
    return this.rateLimiter.getStatus(userId);
  }

  /**
   * Get queue length for a user
   */
  getQueueLength(userId: string): number {
    return this.rateLimiter.getQueueLength(userId);
  }

  /**
   * Cancel a queued payment
   */
  async cancelQueuedPayment(userId: string): Promise<boolean> {
    // This would require extending the rate limiter to support cancellation
    // For now, return false to indicate not implemented
    return false;
  }

  /**
   * Get the current state of the circuit breaker.
   */
  getCircuitBreakerState() {
    return this.circuitBreaker.getState();
  }
}

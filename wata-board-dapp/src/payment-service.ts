import { RateLimiter, RateLimitConfig, RateLimitResult } from './rate-limiter';
import {
  PaymentRequest as StandardPaymentRequest,
  PaymentResponse,
  RateLimitInfo,
  Amount,
  TransactionId,
  Timestamp,
  getCurrentTimestamp,
  amountToString,
  amountToNumber,
  isPaymentRequest
} from '../../shared/types';

// Legacy interface for backward compatibility - marked as deprecated
/** @deprecated Use StandardPaymentRequest from shared/types instead */
export interface PaymentRequest {
  meter_id: string;
  amount: number;
  userId: string;
}

// Legacy interface for backward compatibility - marked as deprecated  
/** @deprecated Use PaymentResponse from shared/types instead */
export interface PaymentResult {
  success: boolean;
  transactionId?: string;
  error?: string;
  rateLimitInfo?: RateLimitInfo;
}

// Internal interface for standardized processing
interface InternalPaymentRequest extends StandardPaymentRequest {
  // Convert legacy format to standard format
}

// Conversion utilities
function convertLegacyToStandard(legacy: PaymentRequest): StandardPaymentRequest {
  return {
    meterId: legacy.meter_id,
    amount: amountToString(legacy.amount),
    userId: legacy.userId
  };
}

function convertStandardToLegacy(standard: StandardPaymentRequest): PaymentRequest {
  return {
    meter_id: standard.meterId,
    amount: amountToNumber(standard.amount),
    userId: standard.userId
  };
}

export class PaymentService {
  private rateLimiter: RateLimiter;
  private pendingPayments: Map<string, PaymentRequest> = new Map();

  constructor(rateLimitConfig: RateLimitConfig) {
    this.rateLimiter = new RateLimiter(rateLimitConfig);
  }

  /**
   * Process payment with rate limiting (legacy interface)
   * @deprecated Use processStandardPayment instead
   */
  async processPayment(request: PaymentRequest): Promise<PaymentResult> {
    // Convert to standard format and process
    const standardRequest = convertLegacyToStandard(request);
    return this.processStandardPayment(standardRequest);
  }

  /**
   * Process payment with rate limiting (standardized interface)
   */
  async processStandardPayment(request: StandardPaymentRequest): Promise<PaymentResponse> {
    try {
      // Validate request format
      if (!isPaymentRequest(request)) {
        return {
          success: false,
          error: 'Invalid payment request format',
          timestamp: getCurrentTimestamp()
        };
      }

      // Check rate limit
      const rateLimitResult = await this.rateLimiter.checkLimit(request.userId);
      
      if (!rateLimitResult.allowed && !rateLimitResult.queued) {
        return {
          success: false,
          error: this.getRateLimitError(rateLimitResult),
          rateLimitInfo: this.convertRateLimitResult(rateLimitResult),
          timestamp: getCurrentTimestamp()
        };
      }

      if (rateLimitResult.queued) {
        return {
          success: false,
          error: this.getQueueMessage(rateLimitResult),
          rateLimitInfo: this.convertRateLimitResult(rateLimitResult),
          timestamp: getCurrentTimestamp()
        };
      }

      // Process payment
      const paymentId = this.generatePaymentId();
      const legacyRequest = convertStandardToLegacy(request);
      this.pendingPayments.set(paymentId, legacyRequest);

      try {
        const transactionId = await this.executePayment(legacyRequest);
        
        return {
          success: true,
          transactionId,
          rateLimitInfo: this.convertRateLimitResult(rateLimitResult),
          timestamp: getCurrentTimestamp()
        };
      } finally {
        this.pendingPayments.delete(paymentId);
      }

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown payment error',
        timestamp: getCurrentTimestamp()
      };
    }
  }

  /**
   * Execute the actual payment transaction
   */
  private async executePayment(request: PaymentRequest): Promise<TransactionId> {
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

    // For backend processing, we'd need to sign with the admin key
    // This is a simplified version - in production, you'd want more secure key management
    const adminSecret = process.env.SECRET_KEY;
    if (!adminSecret) {
      throw new Error('Admin secret key not configured');
    }

    const { Keypair } = await import('@stellar/stellar-sdk');
    const adminKeypair = Keypair.fromSecret(adminSecret);

    await tx.signAndSend({
      signTransaction: async (transaction: any) => {
        transaction.sign(adminKeypair);
        return transaction.toXDR();
      }
    });

    return (tx.hash as TransactionId) || ('tx_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9)) as TransactionId;
  }

  /**
   * Convert RateLimitResult to RateLimitInfo
   */
  private convertRateLimitResult(result: RateLimitResult): RateLimitInfo {
    return {
      remainingRequests: result.remainingRequests,
      resetTime: result.resetTime.toISOString(),
      allowed: result.allowed,
      queued: result.queued,
      queuePosition: result.queuePosition,
      windowMs: 60000,
      maxRequests: 5
    };
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
}

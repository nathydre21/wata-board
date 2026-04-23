import { RateLimiter, RateLimitConfig, RateLimitResult } from './rate-limiter';
import logger, { auditLogger } from './utils/logger';
import { PaymentRequest as SharedPaymentRequest, PaymentResponse, RateLimitInfo, createApiResponse } from '../../../shared/types';

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

// Helper function to convert legacy PaymentRequest to standardized format
function convertToStandardRequest(legacyRequest: PaymentRequest): SharedPaymentRequest {
  return {
    meterId: legacyRequest.meter_id,
    amount: legacyRequest.amount,
    userId: legacyRequest.userId,
    timestamp: new Date().toISOString()
  };
}

export class PaymentService {
  private rateLimiter: RateLimiter;
  private pendingPayments: Map<string, PaymentRequest> = new Map();

  constructor(rateLimitConfig: RateLimitConfig) {
    this.rateLimiter = new RateLimiter(rateLimitConfig);
  }

  /**
   * Process payment with rate limiting
   */
  async processPayment(request: PaymentRequest): Promise<PaymentResult> {
    try {
      // Convert to standardized format
      const standardRequest = convertToStandardRequest(request);
      
      // Check rate limit
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
        return {
          success: false,
          error: this.getRateLimitError(rateLimitResult),
          timestamp: new Date().toISOString(),
          rateLimitInfo
        };
      }

      if (rateLimitResult.queued) {
        logger.info('Payment queued', { userId: request.userId, queuePosition: rateLimitResult.queuePosition });
        return {
          success: false,
          error: this.getQueueMessage(rateLimitResult),
          timestamp: new Date().toISOString(),
          rateLimitInfo
        };
      }

      // Process payment
      const paymentId = this.generatePaymentId();
      this.pendingPayments.set(paymentId, request);

      try {
        const transactionId = await this.executePayment(request);
        
        auditLogger.log('Payment executed successfully', { userId: request.userId, transactionId, meter_id: request.meter_id, amount: request.amount });
        
        return {
          success: true,
          transactionId,
          timestamp: new Date().toISOString(),
          rateLimitInfo
        };
      } finally {
        this.pendingPayments.delete(paymentId);
      }

    } catch (error) {
      logger.error('Payment processing failed', { error, request });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown payment error',
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Execute the actual payment transaction
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
}

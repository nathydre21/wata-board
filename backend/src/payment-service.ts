import { RateLimiter, RateLimitConfig, RateLimitResult } from './rate-limiter';
import { kycService, KYCStatus } from './services/kyc-service';
import { notifyPaymentWebhook } from './services/paymentWebhookService';
import logger, { auditLogger } from './utils/logger';
import { PaymentRequest as SharedPaymentRequest, PaymentResponse, RateLimitInfo, createApiResponse } from '../../../shared/types';
import { accountingService } from './accounting-service';


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
    const paymentId = this.generatePaymentId();

    try {
      // 1. KYC Check
      const kycStatus = await kycService.getStatus(request.userId);
      if (kycStatus !== KYCStatus.VERIFIED) {
        const timestamp = new Date().toISOString();
        const result: PaymentResult = {
          success: false,
          error: `KYC Verification Required. Current status: ${kycStatus}`,
          timestamp,
        };
        void notifyPaymentWebhook({
          event: 'payment.failed',
          paymentId,
          userId: request.userId,
          meterId: request.meter_id,
          amount: request.amount,
          status: 'kyc_required',
          timestamp,
          reason: `KYC status ${kycStatus}`,
        });
        return result;
      }

      // 2. AML Check
      const amlPassed = await kycService.performAMLCheck(request.userId, request.amount);
      if (!amlPassed) {
        const timestamp = new Date().toISOString();
        const result: PaymentResult = {
          success: false,
          error: 'Transaction flagged by AML monitoring system.',
          timestamp,
        };
        void notifyPaymentWebhook({
          event: 'payment.failed',
          paymentId,
          userId: request.userId,
          meterId: request.meter_id,
          amount: request.amount,
          status: 'aml_failed',
          timestamp,
          reason: 'AML monitoring flagged this transaction',
        });
        return result;
      }

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
        const timestamp = new Date().toISOString();
        logger.warn('Payment rejected: rate limit exceeded', { userId: request.userId, rateLimitResult });
        auditLogger.log('Payment rejected due to rate limit', { 
          userId: request.userId, 
          meterId: request.meter_id, 
          amount: request.amount,
          reason: 'rate_limit_exceeded'
        });
        const result: PaymentResult = {
          success: false,
          error: this.getRateLimitError(rateLimitResult),
          timestamp,
          rateLimitInfo
        };
        void notifyPaymentWebhook({
          event: 'payment.failed',
          paymentId,
          userId: request.userId,
          meterId: request.meter_id,
          amount: request.amount,
          status: 'rate_limit_exceeded',
          timestamp,
          reason: result.error,
          rateLimitInfo,
        });
        return result;
      }


      if (rateLimitResult.queued) {
        const timestamp = new Date().toISOString();
        logger.info('Payment queued', { userId: request.userId, queuePosition: rateLimitResult.queuePosition });
        auditLogger.log('Payment queued for processing', { 
          userId: request.userId, 
          meterId: request.meter_id, 
          amount: request.amount,
          queuePosition: rateLimitResult.queuePosition 
        });
        const result: PaymentResult = {
          success: false,
          error: this.getQueueMessage(rateLimitResult),
          timestamp,
          rateLimitInfo
        };
        void notifyPaymentWebhook({
          event: 'payment.queued',
          paymentId,
          userId: request.userId,
          meterId: request.meter_id,
          amount: request.amount,
          status: 'queued',
          timestamp,
          rateLimitInfo,
          reason: result.error,
        });
        return result;
      }

      // Process payment
      this.pendingPayments.set(paymentId, request);

      try {
        const transactionId = await this.executePayment(request);

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

        const timestamp = new Date().toISOString();
        const successResult: PaymentResult = {
          success: true,
          transactionId,
          timestamp,
          rateLimitInfo
        };

        void notifyPaymentWebhook({
          event: 'payment.completed',
          paymentId,
          transactionId,
          userId: request.userId,
          meterId: request.meter_id,
          amount: request.amount,
          status: 'success',
          timestamp,
          rateLimitInfo,
        });

        return successResult;
      } finally {
        this.pendingPayments.delete(paymentId);
      }

    } catch (error) {
      const timestamp = new Date().toISOString();
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Payment processing failed', { error, request });
      auditLogger.log('Payment failed', { 
        userId: request.userId, 
        meterId: request.meter_id, 
        amount: request.amount,
        error: errorMessage,
        status: 'failed'
      });
      void notifyPaymentWebhook({
        event: 'payment.failed',
        paymentId,
        userId: request.userId,
        meterId: request.meter_id,
        amount: request.amount,
        status: 'error',
        timestamp,
        reason: errorMessage,
      });
      return {
        success: false,
        error: errorMessage,
        timestamp,
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
}

import { RateLimiter, RateLimitConfig, RateLimitResult } from './rate-limiter';
import { kycService, KYCStatus } from './services/kyc-service';
import { notifyPaymentWebhook } from './services/paymentWebhookService';
import { EmailNotificationService } from './services/emailNotificationService';
import logger, { auditLogger } from './utils/logger';
import { PaymentRequest as SharedPaymentRequest, PaymentResponse, RateLimitInfo, createApiResponse } from '../../shared/types';
import { accountingService } from './accounting-service';


// Legacy interface for backward compatibility - deprecated

export interface PaymentRequest {
  meter_id: string;
  amount: number;
  userId: string;
  memo?: string;
}

// Updated interface using standardized types
export interface PaymentResult extends PaymentResponse {
  // Use RateLimitInfo instead of RateLimitResult to avoid type conflicts with PaymentResponse
  rateLimitInfo?: RateLimitInfo;
  success: boolean;
  error?: string;
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
  private readonly maxRetryAttempts = 4;
  private emailService?: EmailNotificationService;

  constructor(rateLimitConfig: RateLimitConfig, emailService?: EmailNotificationService) {
    this.rateLimiter = new RateLimiter(rateLimitConfig);
    this.emailService = emailService;
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
        // The limit is available in the config
        limit: (this as any).rateLimiter.config.maxRequests
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

        // Send email notification for successful payment (only if not a scheduled payment)
        if (this.emailService && !request.memo?.includes('Scheduled payment')) {
          void this.emailService.sendPaymentSuccessNotification(
            request.userId,
            paymentId,
            '', // No schedule ID for regular payments
            request.amount,
            request.meter_id,
            transactionId
          );
        }

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

      // Send email notification for failed payment (only if not a scheduled payment)
      if (this.emailService && !request.memo?.includes('Scheduled payment')) {
        void this.emailService.sendPaymentFailureNotification(
          request.userId,
          paymentId,
          '', // No schedule ID for regular payments
          request.amount,
          request.meter_id,
          errorMessage
        );
      }

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
    const NepaClient = await import('../../../contract/nepa_client_v2' as any);

    const client = new NepaClient.Client({
      ...NepaClient.networks.testnet,
      rpcUrl: 'https://soroban-testnet.stellar.org:443',
    });

    const tx = await client.pay_bill({
      meter_id: request.meter_id,
      amount: request.amount,
      memo: request.memo
    });

    // For backend processing, we'd need to sign with the admin key
    // Using secure key management
    const { secureEnvConfig } = await import('./utils/secureEnvConfig');
    const adminSecret = secureEnvConfig.getAdminSecretKey();

    const { Keypair } = await import('@stellar/stellar-sdk');
    const adminKeypair = Keypair.fromSecret(adminSecret);

    await this.executeWithRetry(
      async () => {
        await tx.signAndSend({
          signTransaction: async (transaction: any) => {
            logger.debug('Signing payment transaction', { meter_id: request.meter_id });
            transaction.sign(adminKeypair);
            return transaction.toXDR();
          }
        });
      },
      request
    );

    return tx.hash || 'tx_' + Date.now();
  }

  private async executeWithRetry(operation: () => Promise<void>, request: PaymentRequest): Promise<void> {
    let lastError: unknown;

    for (let attempt = 0; attempt < this.maxRetryAttempts; attempt += 1) {
      try {
        if (attempt > 0) {
          logger.warn('Retrying failed payment transaction', {
            meterId: request.meter_id,
            userId: request.userId,
            attempt: attempt + 1
          });
        }
        await operation();
        return;
      } catch (error) {
        lastError = error;
        const errorMessage = error instanceof Error ? error.message : String(error);
        const isCongestion = this.isCongestionError(errorMessage);
        const isRetryable = this.isRetryableError(errorMessage) || isCongestion;

        if (!isRetryable || attempt === this.maxRetryAttempts - 1) {
          break;
        }

        const delayMs = this.getRetryDelayMs(attempt, isCongestion);
        await this.sleep(delayMs);
      }
    }

    throw lastError instanceof Error ? lastError : new Error('Payment execution failed after retries');
  }

  private isRetryableError(message: string): boolean {
    const normalized = message.toLowerCase();
    return (
      normalized.includes('timeout') ||
      normalized.includes('temporar') ||
      normalized.includes('network') ||
      normalized.includes('429') ||
      normalized.includes('503') ||
      normalized.includes('rate limit')
    );
  }

  private isCongestionError(message: string): boolean {
    const normalized = message.toLowerCase();
    return (
      normalized.includes('congestion') ||
      normalized.includes('surge') ||
      normalized.includes('tx_insufficient_fee') ||
      normalized.includes('fee_bump') ||
      normalized.includes('too many requests')
    );
  }

  private getRetryDelayMs(attempt: number, congestion: boolean): number {
    const baseDelay = congestion ? 1500 : 750;
    return Math.min(baseDelay * (2 ** attempt), 12000);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
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

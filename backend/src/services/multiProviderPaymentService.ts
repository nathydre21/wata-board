import { RateLimiter, RateLimitConfig, toRateLimitInfo } from '../rate-limiter';
import { ProviderService } from './providerService';
import { ProviderPaymentRequest, ProviderPaymentResult, UtilityProvider } from '../types/provider';
import { notifyPaymentWebhook } from './paymentWebhookService';
import logger, { auditLogger } from '../utils/logger';
import { CircuitBreaker, CircuitBreakerConfig, CircuitOpenError } from '../utils/circuitBreaker';

/** Default circuit breaker config applied per provider. */
const DEFAULT_PROVIDER_CB_CONFIG: Omit<CircuitBreakerConfig, 'name'> = {
  failureThreshold: 5,
  recoveryTimeMs: 60000, // 60 seconds
};

export class MultiProviderPaymentService {
  private rateLimiter: RateLimiter;
  private providerService: ProviderService;
  private providerRateLimiters: Map<string, RateLimiter> = new Map();
  private defaultRateLimitConfig: RateLimitConfig;

  constructor(rateLimitConfig: RateLimitConfig, providerService: ProviderService) {
    this.defaultRateLimitConfig = rateLimitConfig;
    this.rateLimiter = new RateLimiter(rateLimitConfig);
    this.providerService = providerService;
    this.initializeProviderRateLimiters();
    this.initializeProviderCircuitBreakers();
  }

  /** Initialize rate limiters for each provider */
  private initializeProviderRateLimiters(): void {
    const providers = this.providerService.getActiveProviders();
    providers.forEach(provider => {
      const providerRateLimitConfig: RateLimitConfig = {
        windowMs: this.defaultRateLimitConfig.windowMs,
        maxRequests: this.defaultRateLimitConfig.maxRequests,
        queueSize: this.defaultRateLimitConfig.queueSize ?? 10,
      };
      this.providerRateLimiters.set(provider.id, new RateLimiter(providerRateLimitConfig));
    });
  }

  /** Initialize circuit breakers for each active provider. */
  private initializeProviderCircuitBreakers(): void {
    const providers = this.providerService.getActiveProviders();
    providers.forEach(provider => {
      this.providerCircuitBreakers.set(
        provider.id,
        new CircuitBreaker({
          ...DEFAULT_PROVIDER_CB_CONFIG,
          name: "provider:" + provider.id,
        })
      );
    });
  }

  /**
   * Ensure a provider-specific rate limiter exists.
   */
  private ensureProviderRateLimiter(providerId: string): RateLimiter {
    const existing = this.providerRateLimiters.get(providerId);
    if (existing) {
      return existing;
    }

    const providerRateLimitConfig: RateLimitConfig = {
      windowMs: this.defaultRateLimitConfig.windowMs,
      maxRequests: this.defaultRateLimitConfig.maxRequests,
      queueSize: this.defaultRateLimitConfig.queueSize ?? 10,
    };
    const limiter = new RateLimiter(providerRateLimitConfig);
    this.providerRateLimiters.set(providerId, limiter);
    return limiter;
  }

  /**
   * Process payment with multi-provider support
   */
  private getOrCreateCircuitBreaker(providerId: string): CircuitBreaker {
    if (!this.providerCircuitBreakers.has(providerId)) {
      this.providerCircuitBreakers.set(
        providerId,
        new CircuitBreaker({
          ...DEFAULT_PROVIDER_CB_CONFIG,
          name: "provider:" + providerId,
        })
      );
    }
    return this.providerCircuitBreakers.get(providerId)!;
  }

  /**
   * Get or lazily create a rate limiter for a provider.
   */
  private getOrCreateRateLimiter(providerId: string): RateLimiter {
    if (!this.providerRateLimiters.has(providerId)) {
      this.providerRateLimiters.set(
        providerId,
        new RateLimiter({ windowMs: 60 * 1000, maxRequests: 5, queueSize: 10 })
      );
    }
    return this.providerRateLimiters.get(providerId)!;
  }

  /** Process payment with multi-provider support */
  async processPayment(request: ProviderPaymentRequest): Promise<ProviderPaymentResult> {
    const paymentId = `provider_${request.providerId}_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;

    try {
      // Validate provider exists and is active
      const provider = this.providerService.getProviderById(request.providerId);
      if (!provider || !provider.isActive) {
        const errorMessage = `Provider ${request.providerId} is not available`;
        auditLogger.security('Payment rejected: provider unavailable', {
          userId: request.userId,
          providerId: request.providerId,
          meterId: request.meter_id,
          amount: request.amount,
          paymentId
        });
        void notifyPaymentWebhook({
          event: 'payment.failed',
          paymentId,
          userId: request.userId,
          meterId: request.meter_id,
          amount: request.amount,
          providerId: request.providerId,
          status: 'provider_unavailable',
          timestamp: new Date().toISOString(),
          reason: errorMessage
        });

        return {
          success: false,
          providerId: request.providerId,
          error: errorMessage
        };
      }

      // Check rate limit for the specific provider
      const providerRateLimiter = this.ensureProviderRateLimiter(request.providerId);
      const rateLimitResult = await providerRateLimiter.checkLimit(request.userId);
      const rateLimitInfo = toRateLimitInfo(rateLimitResult);
      
      if (!rateLimitResult.allowed && !rateLimitResult.queued) {
        const errorMessage = this.getRateLimitError(rateLimitResult);
        logger.warn('Payment rejected: provider rate limit exceeded', { 
          userId: request.userId, 
          providerId: request.providerId,
          rateLimitResult
        });
        auditLogger.security('Payment rejected: provider rate limit exceeded', {
          userId: request.userId,
          providerId: request.providerId,
          meterId: request.meter_id,
          amount: request.amount,
          paymentId,
          rateLimitInfo,
        });
        void notifyPaymentWebhook({
          event: 'payment.failed',
          paymentId,
          userId: request.userId,
          meterId: request.meter_id,
          amount: request.amount,
          providerId: request.providerId,
          status: 'rate_limit_exceeded',
          timestamp: new Date().toISOString(),
          reason: errorMessage,
          rateLimitInfo,
        });

        return {
          success: false,
          providerId: request.providerId,
          error: errorMessage,
          rateLimitInfo,
        };
      }

      if (rateLimitResult.queued) {
        const queueMessage = this.getQueueMessage(rateLimitResult);
        logger.info('Payment queued for provider', { 
          userId: request.userId, 
          providerId: request.providerId,
          queuePosition: rateLimitResult.queuePosition
        });
        auditLogger.log('Payment queued for provider', {
          userId: request.userId,
          providerId: request.providerId,
          meterId: request.meter_id,
          amount: request.amount,
          paymentId,
          queuePosition: rateLimitResult.queuePosition,
          rateLimitInfo,
        });
        void notifyPaymentWebhook({
          event: 'payment.queued',
          paymentId,
          userId: request.userId,
          meterId: request.meter_id,
          amount: request.amount,
          providerId: request.providerId,
          status: 'queued',
          timestamp: new Date().toISOString(),
          reason: queueMessage,
          rateLimitInfo,
        });

        return {
          success: false,
          providerId: request.providerId,
          error: queueMessage,
          rateLimitInfo,
        };
      }

      // Process payment with the specific provider
      const transactionId = await this.executeProviderPayment(request, provider);
      
      auditLogger.log('Payment executed successfully', { 
        userId: request.userId, 
        transactionId, 
        paymentId,
        meter_id: request.meter_id, 
        amount: request.amount,
        providerId: request.providerId,
        providerName: provider.name,
        timestamp: new Date().toISOString()
      });
      void notifyPaymentWebhook({
        event: 'payment.completed',
        paymentId,
        transactionId,
        userId: request.userId,
        meterId: request.meter_id,
        amount: request.amount,
        providerId: request.providerId,
        status: 'success',
        timestamp: new Date().toISOString(),
        rateLimitInfo,
      });
      
      return {
        success: true,
        transactionId,
        providerId: request.providerId,
        rateLimitInfo,
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown payment error';
      logger.error('Multi-provider payment processing failed', { error, request });
      auditLogger.error('Multi-provider payment processing failed', {
        userId: request.userId,
        providerId: request.providerId,
        meterId: request.meter_id,
        amount: request.amount,
        paymentId,
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined
      });
      void notifyPaymentWebhook({
        event: 'payment.failed',
        paymentId,
        userId: request.userId,
        meterId: request.meter_id,
        amount: request.amount,
        providerId: request.providerId,
        status: 'failed',
        timestamp: new Date().toISOString(),
        reason: errorMessage
      });
      return {
        success: false,
        providerId: request.providerId,
        error: errorMessage
      };
    }
  }

  /** Execute payment using a specific provider's contract */
  private async executeProviderPayment(request: ProviderPaymentRequest, provider: UtilityProvider): Promise<string> {
    const { updateTransactionStatus } = await import('./websocketService');
    
    // Import the client dynamically to avoid circular dependencies
    const NepaClient = await import('../../packages/nepa_client_v2' as any);
    
    const client = new NepaClient.Client({
      networkPassphrase: provider.network === 'testnet' ? 'Test SDF Network ; September 2015' : 'Public Global Stellar Network ; September 2015',
      contractId: provider.contractId,
      rpcUrl: provider.rpcUrl,
    });

    const tx = await client.pay_bill({
      meter_id: request.meter_id,
      amount: request.amount,
      memo: (request as any).memo
    });

    const transactionId = tx.hash || `tx_${request.providerId}_${Date.now()}`;
    
    // Update status to pending when transaction is created
    await updateTransactionStatus(transactionId, 'pending');
    logger.info('Transaction created', { transactionId, meterId: request.meter_id, providerId: request.providerId });

    // For backend processing, we'd need to sign with the admin key
    // This is a simplified version - in production, you'd want more secure key management
    const adminSecret = process.env.ADMIN_SECRET_KEY;
    if (!adminSecret) {
      throw new Error('Admin secret key not configured');
    }

    const { Keypair } = await import('@stellar/stellar-sdk');
    const adminKeypair = Keypair.fromSecret(adminSecret);

    // Update status to confirming when submitting to blockchain
    await updateTransactionStatus(transactionId, 'confirming');
    logger.info('Transaction submitting to blockchain', { transactionId, meterId: request.meter_id, providerId: request.providerId });

    await tx.signAndSend({
      signTransaction: async (transaction: any) => {
        logger.debug('Signing payment transaction', {
          meter_id: request.meter_id,
          providerId: request.providerId,
          providerName: provider.name,
          transactionId
        });
        transaction.sign(adminKeypair);
        return transaction.toXDR();
      }
    });

    return transactionId;
  }

  /** Get total paid amount for a meter using a specific provider */
  async getTotalPaid(meterId: string, providerId: string): Promise<{ total: number; provider: UtilityProvider }> {
    const provider = this.providerService.getProviderById(providerId);
    if (!provider || !provider.isActive) {
      throw new Error("Provider " + providerId + " is not available");
    }

    // Import the client dynamically
    const NepaClient = await import('../../packages/nepa_client_v2' as any);
    
    const client = new NepaClient.Client({
      networkPassphrase: provider.network === 'testnet' ? 'Test SDF Network ; September 2015' : 'Public Global Stellar Network ; September 2015',
      contractId: provider.contractId,
      rpcUrl: provider.rpcUrl,
    });

    const result = await client.get_total_paid({ meter_id: meterId });
    const total = Number(result.result);

    return { total, provider };
  }

  /** Get rate limit status for a user across all providers */
  getRateLimitStatus(userId: string): Record<string, any> {
    const status: Record<string, any> = {};

    this.providerService.getActiveProviders().forEach((provider) => {
      const rateLimiter = this.ensureProviderRateLimiter(provider.id);
      status[provider.id] = rateLimiter.getStatus(userId);
    });
    return status;
  }

  /** Get rate limit status for a specific provider */
  getProviderRateLimitStatus(userId: string, providerId: string): any {
    const rateLimiter = this.ensureProviderRateLimiter(providerId);
    return rateLimiter.getStatus(userId);
  }

  /** Get circuit breaker state for a specific provider */
  getProviderCircuitBreakerState(providerId: string): string {
    const cb = this.providerCircuitBreakers.get(providerId);
    if (!cb) return 'UNKNOWN';
    return cb.getState();
  }

  private getRateLimitError(rateLimit: any): string {
    const waitTime = Math.ceil((rateLimit.resetTime.getTime() - Date.now()) / 1000);
    return "Rate limit exceeded. Please wait " + waitTime + " seconds before trying again.";
  }

  private getQueueMessage(rateLimit: any): string {
    if (rateLimit.queuePosition) {
      return "Payment queued. You are position #" + rateLimit.queuePosition + " in the queue.";
    }
    return 'Payment queued. Please wait for processing.';
  }

  getAvailableProviders(): UtilityProvider[] {
    return this.providerService.getActiveProviders();
  }

  getProvidersByMeterType(meterType: 'electricity' | 'water' | 'gas'): UtilityProvider[] {
    return this.providerService.getProvidersByMeterType(meterType);
  }
}

import { RateLimiter, RateLimitConfig } from '../rate-limiter';
import { ProviderService } from './providerService';
import { ProviderPaymentRequest, ProviderPaymentResult, UtilityProvider } from '../types/provider';
import logger, { auditLogger } from '../utils/logger';
import { retryWithBackoff, isRetryableError, RetryError } from '../utils/retry';

export class MultiProviderPaymentService {
  private rateLimiter: RateLimiter;
  private providerService: ProviderService;
  private providerRateLimiters: Map<string, RateLimiter> = new Map();

  constructor(rateLimitConfig: RateLimitConfig, providerService: ProviderService) {
    this.rateLimiter = new RateLimiter(rateLimitConfig);
    this.providerService = providerService;
    this.initializeProviderRateLimiters();
  }

  /**
   * Initialize rate limiters for each provider
   */
  private initializeProviderRateLimiters(): void {
    const providers = this.providerService.getActiveProviders();
    
    providers.forEach(provider => {
      this.providerRateLimiters.set(provider.id, this.createProviderRateLimiter());
    });
  }

  /**
   * Create a new rate limiter with the default provider configuration
   */
  private createProviderRateLimiter(): RateLimiter {
    const providerRateLimitConfig: RateLimitConfig = {
      windowMs: 60 * 1000,  // 1 minute
      maxRequests: 5,        // 5 transactions per minute
      queueSize: 10          // Allow 10 queued requests
    };
    return new RateLimiter(providerRateLimitConfig);
  }

  /**
   * Process payment with multi-provider support
   */
  async processPayment(request: ProviderPaymentRequest): Promise<ProviderPaymentResult> {
    try {
      // Validate provider exists and is active
      const provider = this.providerService.getProviderById(request.providerId);
      if (!provider || !provider.isActive) {
        return {
          success: false,
          providerId: request.providerId,
          error: `Provider ${request.providerId} is not available`
        };
      }

      // Check if provider supports the meter type (would need meter info from database)
      // For now, we'll proceed assuming the provider supports the meter type

      // Check rate limit for the specific provider (lazy initialization)
      let providerRateLimiter = this.providerRateLimiters.get(request.providerId);
      if (!providerRateLimiter) {
        // Lazily initialize rate limiter for providers added after construction
        providerRateLimiter = this.createProviderRateLimiter();
        this.providerRateLimiters.set(request.providerId, providerRateLimiter);
        logger.info('Lazily initialized rate limiter for provider', { providerId: request.providerId });
      }

      const rateLimitResult = await providerRateLimiter.checkLimit(request.userId);
      
      if (!rateLimitResult.allowed && !rateLimitResult.queued) {
        logger.warn('Payment rejected: provider rate limit exceeded', { 
          userId: request.userId, 
          providerId: request.providerId,
          rateLimitResult 
        });
        return {
          success: false,
          providerId: request.providerId,
          error: this.getRateLimitError(rateLimitResult),
          rateLimitInfo: rateLimitResult
        };
      }

      if (rateLimitResult.queued) {
        logger.info('Payment queued for provider', { 
          userId: request.userId, 
          providerId: request.providerId,
          queuePosition: rateLimitResult.queuePosition 
        });
        return {
          success: false,
          providerId: request.providerId,
          error: this.getQueueMessage(rateLimitResult),
          rateLimitInfo: rateLimitResult
        };
      }

      // Process payment with the specific provider using retry logic
      const retryResult = await retryWithBackoff(
        () => this.executeProviderPayment(request, provider),
        {
          maxRetries: 3,
          baseDelayMs: 1000,
          maxDelayMs: 30000,
          retryableError: isRetryableError,
          context: 'multi-provider-payment',
        },
      );

      const transactionId = retryResult.result;
      const retryCount = retryResult.retries;

      if (retryCount > 0) {
        logger.info('Multi-provider payment succeeded after retries', {
          userId: request.userId,
          transactionId,
          meter_id: request.meter_id,
          amount: request.amount,
          providerId: request.providerId,
          providerName: provider.name,
          retryCount,
          attempts: retryResult.attempts,
        });
      }
      
      auditLogger.log('Payment executed successfully', { 
        userId: request.userId, 
        transactionId, 
        meter_id: request.meter_id, 
        amount: request.amount,
        providerId: request.providerId,
        providerName: provider.name,
        retryCount,
      });
      
      return {
        success: true,
        transactionId,
        providerId: request.providerId,
        rateLimitInfo: rateLimitResult,
        retryCount,
      };

    } catch (error) {
      const retryCount = error instanceof RetryError ? error.retries : 0;
      const actualError = error instanceof RetryError ? error.cause : error;
      const errorMessage = actualError instanceof Error ? actualError.message : String(actualError);

      logger.error('Multi-provider payment processing failed', { error: errorMessage, retryCount, request });
      return {
        success: false,
        providerId: request.providerId,
        error: errorMessage,
        retryCount,
      };
    }
  }

  /**
   * Execute payment using a specific provider's contract
   */
  private async executeProviderPayment(request: ProviderPaymentRequest, provider: UtilityProvider): Promise<string> {
    // Import the client dynamically to avoid circular dependencies
    const NepaClient = await import('../packages/nepa_client_v2');
    
    const client = new NepaClient.Client({
      networkPassphrase: provider.network === 'testnet' ? 'Test SDF Network ; September 2015' : 'Public Global Stellar Network ; September 2015',
      contractId: provider.contractId,
      rpcUrl: provider.rpcUrl,
    });

    const tx = await client.pay_bill({
      meter_id: request.meter_id,
      amount: request.amount
    });

    // For backend processing, we'd need to sign with the admin key
    // This is a simplified version - in production, you'd want more secure key management
    const adminSecret = process.env.ADMIN_SECRET_KEY;
    if (!adminSecret) {
      throw new Error('Admin secret key not configured');
    }

    const { Keypair } = await import('@stellar/stellar-sdk');
    const adminKeypair = Keypair.fromSecret(adminSecret);

    await tx.signAndSend({
      signTransaction: async (transaction: any) => {
        logger.debug('Signing payment transaction', { 
          meter_id: request.meter_id,
          providerId: request.providerId,
          providerName: provider.name
        });
        transaction.sign(adminKeypair);
        return transaction.toXDR();
      }
    });

    return tx.hash || `tx_${request.providerId}_${Date.now()}`;
  }

  /**
   * Get total paid amount for a meter using a specific provider
   */
  async getTotalPaid(meterId: string, providerId: string): Promise<{ total: number; provider: UtilityProvider }> {
    const provider = this.providerService.getProviderById(providerId);
    if (!provider || !provider.isActive) {
      throw new Error(`Provider ${providerId} is not available`);
    }

    // Import the client dynamically
    const NepaClient = await import('../packages/nepa_client_v2');
    
    const client = new NepaClient.Client({
      networkPassphrase: provider.network === 'testnet' ? 'Test SDF Network ; September 2015' : 'Public Global Stellar Network ; September 2015',
      contractId: provider.contractId,
      rpcUrl: provider.rpcUrl,
    });

    const result = await client.get_total_paid({ meter_id: meterId });
    const total = Number(result.result);

    return {
      total,
      provider
    };
  }

  /**
   * Get rate limit status for a user across all providers
   */
  getRateLimitStatus(userId: string): Record<string, any> {
    const status: Record<string, any> = {};
    
    // Include all active providers, lazily initializing rate limiters as needed
    const activeProviders = this.providerService.getActiveProviders();
    activeProviders.forEach(provider => {
      if (!this.providerRateLimiters.has(provider.id)) {
        this.providerRateLimiters.set(provider.id, this.createProviderRateLimiter());
      }
      const rateLimiter = this.providerRateLimiters.get(provider.id)!;
      status[provider.id] = rateLimiter.getStatus(userId);
    });

    return status;
  }

  /**
   * Get rate limit status for a specific provider
   */
  getProviderRateLimitStatus(userId: string, providerId: string): any {
    let rateLimiter = this.providerRateLimiters.get(providerId);
    if (!rateLimiter) {
      // Lazily initialize rate limiter for providers added after construction
      rateLimiter = this.createProviderRateLimiter();
      this.providerRateLimiters.set(providerId, rateLimiter);
    }

    return rateLimiter.getStatus(userId);
  }

  /**
   * Get user-friendly rate limit error message
   */
  private getRateLimitError(rateLimit: any): string {
    const waitTime = Math.ceil((rateLimit.resetTime.getTime() - Date.now()) / 1000);
    return `Rate limit exceeded. Please wait ${waitTime} seconds before trying again.`;
  }

  /**
   * Get queue message
   */
  private getQueueMessage(rateLimit: any): string {
    if (rateLimit.queuePosition) {
      return `Payment queued. You are position #${rateLimit.queuePosition} in the queue.`;
    }
    return 'Payment queued. Please wait for processing.';
  }

  /**
   * Get available providers for a user
   */
  getAvailableProviders(): UtilityProvider[] {
    return this.providerService.getActiveProviders();
  }

  /**
   * Get providers that support a specific meter type
   */
  getProvidersByMeterType(meterType: 'electricity' | 'water' | 'gas'): UtilityProvider[] {
    return this.providerService.getProvidersByMeterType(meterType);
  }
}

import { RateLimiter, RateLimitConfig } from '../rate-limiter';
import { ProviderService } from './providerService';
import { ProviderPaymentRequest, ProviderPaymentResult, UtilityProvider } from '../types/provider';
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
  /** Per-provider circuit breakers keyed by provider ID. */
  private providerCircuitBreakers: Map<string, CircuitBreaker> = new Map();

  constructor(rateLimitConfig: RateLimitConfig, providerService: ProviderService) {
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
        windowMs: 60 * 1000,
        maxRequests: 5,
        queueSize: 10
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
   * Get or lazily create a circuit breaker for a provider.
   * This handles providers that are added after construction.
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
    try {
      // Validate provider exists and is active
      const provider = this.providerService.getProviderById(request.providerId);
      if (!provider || !provider.isActive) {
        return {
          success: false,
          providerId: request.providerId,
          error: "Provider " + request.providerId + " is not available"
        };
      }

      // Check rate limit for the specific provider
      const providerRateLimiter = this.getOrCreateRateLimiter(request.providerId);
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

      // Execute payment through the per-provider circuit breaker
      const circuitBreaker = this.getOrCreateCircuitBreaker(request.providerId);

      try {
        const transactionId = await circuitBreaker.execute(() =>
          this.executeProviderPayment(request, provider)
        );

        auditLogger.log('Payment executed successfully', {
          userId: request.userId,
          transactionId,
          meter_id: request.meter_id,
          amount: request.amount,
          providerId: request.providerId,
          providerName: provider.name
        });

        return {
          success: true,
          transactionId,
          providerId: request.providerId,
          rateLimitInfo: rateLimitResult
        };
      } catch (error) {
        if (error instanceof CircuitOpenError) {
          auditLogger.log('Payment blocked - provider circuit breaker is OPEN', {
            userId: request.userId,
            providerId: request.providerId,
            circuit: error.circuitName
          });
          return {
            success: false,
            providerId: request.providerId,
            error: error.message
          };
        }
        throw error;
      }

    } catch (error) {
      logger.error('Multi-provider payment processing failed', { error, request });
      return {
        success: false,
        providerId: request.providerId,
        error: error instanceof Error ? error.message : 'Unknown payment error'
      };
    }
  }

  /** Execute payment using a specific provider's contract */
  private async executeProviderPayment(request: ProviderPaymentRequest, provider: UtilityProvider): Promise<string> {
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

    return tx.hash || "tx_" + request.providerId + "_" + Date.now();
  }

  /** Get total paid amount for a meter using a specific provider */
  async getTotalPaid(meterId: string, providerId: string): Promise<{ total: number; provider: UtilityProvider }> {
    const provider = this.providerService.getProviderById(providerId);
    if (!provider || !provider.isActive) {
      throw new Error("Provider " + providerId + " is not available");
    }

    const NepaClient = await import('../packages/nepa_client_v2');

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
    this.providerRateLimiters.forEach((rateLimiter, providerId) => {
      status[providerId] = rateLimiter.getStatus(userId);
    });
    return status;
  }

  /** Get rate limit status for a specific provider */
  getProviderRateLimitStatus(userId: string, providerId: string): any {
    const rateLimiter = this.providerRateLimiters.get(providerId);
    if (!rateLimiter) {
      throw new Error("Rate limiter not found for provider " + providerId);
    }
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

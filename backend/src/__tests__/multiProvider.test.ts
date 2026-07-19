import { ProviderService } from '../services/providerService';
import { MultiProviderPaymentService } from '../services/multiProviderPaymentService';
import { RateLimiter, RateLimitConfig } from '../rate-limiter';
import { UtilityProvider, ProviderPaymentRequest } from '../types/provider';

describe('Multi-Provider System', () => {
  let providerService: ProviderService;
  let multiProviderPaymentService: MultiProviderPaymentService;
  let rateLimitConfig: RateLimitConfig;

  beforeEach(() => {
    rateLimitConfig = {
      windowMs: 60 * 1000, // 1 minute
      maxRequests: 5,
      queueSize: 10
    };

    providerService = new ProviderService();
    multiProviderPaymentService = new MultiProviderPaymentService(rateLimitConfig, providerService);
  });

  describe('ProviderService', () => {
    describe('Provider Management', () => {
      test('should initialize with default provider', () => {
        const providers = providerService.getActiveProviders();
        expect(providers).toHaveLength(1);
        expect(providers[0].id).toBe('wata-board');
        expect(providers[0].name).toBe('Wata-Board');
        expect(providers[0].isActive).toBe(true);
      });

      test('should add a new provider', () => {
        const newProvider: UtilityProvider = {
          id: 'nepa',
          name: 'National Electric Power Authority',
          contractId: 'CDRRJ7IPYDL36YSK5ZQLBG3LICULETIBXX327AGJQNTWXNKY2UMDO4DB',
          network: 'testnet',
          rpcUrl: 'https://soroban-testnet.stellar.org',
          isActive: true,
          supportedMeterTypes: ['electricity'],
          metadata: {
            region: 'Nigeria',
            description: 'National electricity provider'
          }
        };

        providerService.addProvider(newProvider);
        const providers = providerService.getActiveProviders();
        expect(providers).toHaveLength(2);
        expect(providers.find(p => p.id === 'nepa')).toBeDefined();
      });

      test('should not add duplicate provider', () => {
        const duplicateProvider: UtilityProvider = {
          id: 'wata-board',
          name: 'Duplicate Wata-Board',
          contractId: 'CDRRJ7IPYDL36YSK5ZQLBG3LICULETIBXX327AGJQNTWXNKY2UMDO4DA',
          network: 'testnet',
          rpcUrl: 'https://soroban-testnet.stellar.org',
          isActive: true,
          supportedMeterTypes: ['electricity', 'water', 'gas']
        };

        expect(() => providerService.addProvider(duplicateProvider)).toThrow('Provider with ID wata-board already exists');
      });

      test('should update existing provider', () => {
        const updates = {
          name: 'Updated Wata-Board',
          isActive: false
        };

        providerService.updateProvider('wata-board', updates);
        const provider = providerService.getProviderById('wata-board');
        expect(provider?.name).toBe('Updated Wata-Board');
        expect(provider?.isActive).toBe(false);
      });

      test('should deactivate provider', () => {
        providerService.addProvider({
          id: 'temp-provider',
          name: 'Temporary Provider',
          contractId: 'TEMP_CONTRACT_ID_HERE',
          network: 'testnet',
          rpcUrl: 'https://soroban-testnet.stellar.org',
          isActive: true,
          supportedMeterTypes: ['water']
        });

        providerService.deactivateProvider('temp-provider');
        const provider = providerService.getProviderById('temp-provider');
        expect(provider?.isActive).toBe(false);
      });

      test('should not deactivate default provider', () => {
        expect(() => providerService.deactivateProvider('wata-board')).toThrow('Cannot deactivate the default provider');
      });

      test('should get providers by meter type', () => {
        providerService.addProvider({
          id: 'electric-only',
          name: 'Electric Only Provider',
          contractId: 'ELECTRIC_CONTRACT_ID',
          network: 'testnet',
          rpcUrl: 'https://soroban-testnet.stellar.org',
          isActive: true,
          supportedMeterTypes: ['electricity']
        });

        const electricityProviders = providerService.getProvidersByMeterType('electricity');
        const waterProviders = providerService.getProvidersByMeterType('water');

        expect(electricityProviders).toHaveLength(2); // wata-board + electric-only
        expect(waterProviders).toHaveLength(1); // only wata-board
      });

      test('should validate provider configuration', () => {
        const invalidProvider = {
          id: '',
          name: 'Invalid Provider',
          contractId: 'INVALID_CONTRACT',
          network: 'invalid' as any,
          rpcUrl: '',
          isActive: true,
          supportedMeterTypes: [] as any[]
        };

        expect(() => providerService.addProvider(invalidProvider)).toThrow();
      });
    });

    describe('Provider Loading from Environment', () => {
      beforeEach(() => {
        // Mock environment variables
        process.env.PROVIDER_COUNT = '2';
        process.env.PROVIDER_1_ID = 'env-provider-1';
        process.env.PROVIDER_1_NAME = 'Environment Provider 1';
        process.env.PROVIDER_1_CONTRACT_ID = 'ENV_CONTRACT_1';
        process.env.PROVIDER_1_NETWORK = 'testnet';
        process.env.PROVIDER_1_RPC_URL = 'https://soroban-testnet.stellar.org';
        process.env.PROVIDER_1_ACTIVE = 'true';
        process.env.PROVIDER_1_METER_TYPES = 'electricity,water';

        process.env.PROVIDER_2_ID = 'env-provider-2';
        process.env.PROVIDER_2_NAME = 'Environment Provider 2';
        process.env.PROVIDER_2_CONTRACT_ID = 'ENV_CONTRACT_2';
        process.env.PROVIDER_2_NETWORK = 'mainnet';
        process.env.PROVIDER_2_RPC_URL = 'https://soroban.stellar.org';
        process.env.PROVIDER_2_ACTIVE = 'false';
        process.env.PROVIDER_2_METER_TYPES = 'gas';
      });

      afterEach(() => {
        // Clean up environment variables
        delete process.env.PROVIDER_COUNT;
        delete process.env.PROVIDER_1_ID;
        delete process.env.PROVIDER_1_NAME;
        delete process.env.PROVIDER_1_CONTRACT_ID;
        delete process.env.PROVIDER_1_NETWORK;
        delete process.env.PROVIDER_1_RPC_URL;
        delete process.env.PROVIDER_1_ACTIVE;
        delete process.env.PROVIDER_1_METER_TYPES;
        delete process.env.PROVIDER_2_ID;
        delete process.env.PROVIDER_2_NAME;
        delete process.env.PROVIDER_2_CONTRACT_ID;
        delete process.env.PROVIDER_2_NETWORK;
        delete process.env.PROVIDER_2_RPC_URL;
        delete process.env.PROVIDER_2_ACTIVE;
        delete process.env.PROVIDER_2_METER_TYPES;
      });

      test('should load providers from environment variables', () => {
        const newProviderService = new ProviderService();
        newProviderService.loadProvidersFromEnvironment();

        const providers = newProviderService.getActiveProviders();
        expect(providers.length).toBeGreaterThan(0);

        const envProvider1 = newProviderService.getProviderById('env-provider-1');
        expect(envProvider1).toBeDefined();
        expect(envProvider1?.name).toBe('Environment Provider 1');
        expect(envProvider1?.network).toBe('testnet');
        expect(envProvider1?.supportedMeterTypes).toEqual(['electricity', 'water']);
      });
    });
  });

  describe('MultiProviderPaymentService', () => {
    beforeEach(() => {
      // Add test providers
      providerService.addProvider({
        id: 'test-provider-1',
        name: 'Test Provider 1',
        contractId: 'TEST_CONTRACT_1',
        network: 'testnet',
        rpcUrl: 'https://soroban-testnet.stellar.org',
        isActive: true,
        supportedMeterTypes: ['electricity']
      });

      providerService.addProvider({
        id: 'test-provider-2',
        name: 'Test Provider 2',
        contractId: 'TEST_CONTRACT_2',
        network: 'testnet',
        rpcUrl: 'https://soroban-testnet.stellar.org',
        isActive: true,
        supportedMeterTypes: ['water']
      });
    });

    describe('Payment Processing', () => {
      test('should process payment with valid provider', async () => {
        const paymentRequest: ProviderPaymentRequest = {
          meter_id: 'METER001',
          amount: 100,
          userId: 'USER123',
          providerId: 'test-provider-1'
        };

        // Mock the contract client call
        const mockExecutePayment = jest.spyOn(multiProviderPaymentService as any, 'executeProviderPayment');
        mockExecutePayment.mockResolvedValue('tx_123456');

        const result = await multiProviderPaymentService.processPayment(paymentRequest);

        expect(result.success).toBe(true);
        expect(result.transactionId).toBe('tx_123456');
        expect(result.providerId).toBe('test-provider-1');
        expect(mockExecutePayment).toHaveBeenCalledWith(paymentRequest, expect.any(Object));
      });

      test('should reject payment with inactive provider', async () => {
        // Deactivate the provider
        providerService.deactivateProvider('test-provider-1');

        const paymentRequest: ProviderPaymentRequest = {
          meter_id: 'METER001',
          amount: 100,
          userId: 'USER123',
          providerId: 'test-provider-1'
        };

        const result = await multiProviderPaymentService.processPayment(paymentRequest);

        expect(result.success).toBe(false);
        expect(result.error).toBe('Provider test-provider-1 is not available');
        expect(result.providerId).toBe('test-provider-1');
      });

      test('should reject payment with non-existent provider', async () => {
        const paymentRequest: ProviderPaymentRequest = {
          meter_id: 'METER001',
          amount: 100,
          userId: 'USER123',
          providerId: 'non-existent-provider'
        };

        const result = await multiProviderPaymentService.processPayment(paymentRequest);

        expect(result.success).toBe(false);
        expect(result.error).toBe('Provider non-existent-provider is not available');
        expect(result.providerId).toBe('non-existent-provider');
      });

      test('should handle payment processing errors', async () => {
        const paymentRequest: ProviderPaymentRequest = {
          meter_id: 'METER001',
          amount: 100,
          userId: 'USER123',
          providerId: 'test-provider-1'
        };

        // Mock the contract client to throw an error
        const mockExecutePayment = jest.spyOn(multiProviderPaymentService as any, 'executeProviderPayment');
        mockExecutePayment.mockRejectedValue(new Error('Contract execution failed'));

        const result = await multiProviderPaymentService.processPayment(paymentRequest);

        expect(result.success).toBe(false);
        expect(result.error).toBe('Contract execution failed');
        expect(result.providerId).toBe('test-provider-1');
      });
    });

    describe('Rate Limiting', () => {
      beforeEach(() => {
        multiProviderPaymentService = new MultiProviderPaymentService(
          { windowMs: 60 * 1000, maxRequests: 5, queueSize: 0 },
          providerService
        );
      });

      test('should enforce per-provider rate limits', async () => {
        const paymentRequest: ProviderPaymentRequest = {
          meter_id: 'METER001',
          amount: 100,
          userId: 'USER123',
          providerId: 'test-provider-1'
        };

        // Mock successful payment
        const mockExecutePayment = jest.spyOn(multiProviderPaymentService as any, 'executeProviderPayment');
        mockExecutePayment.mockResolvedValue('tx_123456');

        // Process payments up to the limit
        for (let i = 0; i < 5; i++) {
          const result = await multiProviderPaymentService.processPayment(paymentRequest);
          expect(result.success).toBe(true);
        }

        // Next payment should be rate limited
        const rateLimitedResult = await multiProviderPaymentService.processPayment(paymentRequest);
        expect(rateLimitedResult.success).toBe(false);
        expect(rateLimitedResult.error).toContain('Rate limit exceeded');
      });

      test('should get rate limit status for specific provider', () => {
        const userId = 'USER123';
        const providerId = 'test-provider-1';

        const status = multiProviderPaymentService.getProviderRateLimitStatus(userId, providerId);

        expect(status).toBeDefined();
        expect(typeof status.allowed).toBe('boolean');
        expect(typeof status.remainingRequests).toBe('number');
      });

      test('should get rate limit status for all providers', () => {
        const userId = 'USER123';

        const allStatus = multiProviderPaymentService.getRateLimitStatus(userId);

        expect(allStatus).toBeDefined();
        expect(allStatus['wata-board']).toBeDefined();
        expect(allStatus['test-provider-1']).toBeDefined();
        expect(allStatus['test-provider-2']).toBeDefined();
      });
    });

    describe('Provider Management', () => {
      test('should get available providers', () => {
        const providers = multiProviderPaymentService.getAvailableProviders();

        expect(providers.length).toBeGreaterThan(0);
        expect(providers.every(p => p.isActive)).toBe(true);
      });

      test('should get providers by meter type', () => {
        const electricityProviders = multiProviderPaymentService.getProvidersByMeterType('electricity');
        const waterProviders = multiProviderPaymentService.getProvidersByMeterType('water');

        expect(electricityProviders.length).toBeGreaterThan(0);
        expect(waterProviders.length).toBeGreaterThan(0);
        expect(electricityProviders.some(p => p.id === 'test-provider-1')).toBe(true);
        expect(waterProviders.some(p => p.id === 'test-provider-2')).toBe(true);
      });
    });

    describe('Total Paid Query', () => {
      test('should get total paid for specific provider', async () => {
        const meterId = 'METER001';
        const providerId = 'test-provider-1';

        const { Client } = require('../../packages/nepa_client_v2');
        (Client as jest.Mock).mockImplementation(() => ({
          get_total_paid: jest.fn().mockResolvedValue({ result: 500 }),
        }));

        const result = await multiProviderPaymentService.getTotalPaid(meterId, providerId);

        expect(result.total).toBe(500);
        expect(result.provider.id).toBe(providerId);
      });
    });
  });

  describe('Integration Tests', () => {
    test('should handle complete multi-provider workflow', async () => {
      // 1. Add multiple providers
      providerService.addProvider({
        id: 'electric-provider',
        name: 'Electric Company',
        contractId: 'ELECTRIC_CONTRACT',
        network: 'testnet',
        rpcUrl: 'https://soroban-testnet.stellar.org',
        isActive: true,
        supportedMeterTypes: ['electricity']
      });

      providerService.addProvider({
        id: 'water-provider',
        name: 'Water Company',
        contractId: 'WATER_CONTRACT',
        network: 'testnet',
        rpcUrl: 'https://soroban-testnet.stellar.org',
        isActive: true,
        supportedMeterTypes: ['water']
      });

      // 2. Get providers for electricity meter
      const electricityProviders = multiProviderPaymentService.getProvidersByMeterType('electricity');
      expect(electricityProviders.some(p => p.id === 'electric-provider')).toBe(true);

      // 3. Process payment with electricity provider
      const mockExecutePayment = jest.spyOn(multiProviderPaymentService as any, 'executeProviderPayment');
      mockExecutePayment.mockResolvedValue('tx_electric_123');

      const electricPayment: ProviderPaymentRequest = {
        meter_id: 'ELECTRIC_METER_001',
        amount: 150,
        userId: 'USER456',
        providerId: 'electric-provider'
      };

      const electricResult = await multiProviderPaymentService.processPayment(electricPayment);
      expect(electricResult.success).toBe(true);
      expect(electricResult.providerId).toBe('electric-provider');

      // 4. Process payment with water provider
      mockExecutePayment.mockResolvedValue('tx_water_456');

      const waterPayment: ProviderPaymentRequest = {
        meter_id: 'WATER_METER_001',
        amount: 75,
        userId: 'USER456',
        providerId: 'water-provider'
      };

      const waterResult = await multiProviderPaymentService.processPayment(waterPayment);
      expect(waterResult.success).toBe(true);
      expect(waterResult.providerId).toBe('water-provider');

      // 5. Verify provider statistics
      const electricStatus = multiProviderPaymentService.getProviderRateLimitStatus('USER456', 'electric-provider');
      const waterStatus = multiProviderPaymentService.getProviderRateLimitStatus('USER456', 'water-provider');

      expect(electricStatus).toBeDefined();
      expect(waterStatus).toBeDefined();
    });

    test('should handle provider deactivation gracefully', async () => {
      // Add a provider
      providerService.addProvider({
        id: 'temp-provider',
        name: 'Temporary Provider',
        contractId: 'TEMP_CONTRACT',
        network: 'testnet',
        rpcUrl: 'https://soroban-testnet.stellar.org',
        isActive: true,
        supportedMeterTypes: ['gas']
      });

      // Process payment successfully
      const mockExecutePayment = jest.spyOn(multiProviderPaymentService as any, 'executeProviderPayment');
      mockExecutePayment.mockResolvedValue('tx_temp_123');

      const paymentRequest: ProviderPaymentRequest = {
        meter_id: 'GAS_METER_001',
        amount: 50,
        userId: 'USER789',
        providerId: 'temp-provider'
      };

      const result1 = await multiProviderPaymentService.processPayment(paymentRequest);
      expect(result1.success).toBe(true);

      // Deactivate the provider
      providerService.deactivateProvider('temp-provider');

      // Next payment should fail
      const result2 = await multiProviderPaymentService.processPayment(paymentRequest);
      expect(result2.success).toBe(false);
      expect(result2.error).toContain('not available');

      // Provider should not appear in active providers list
      const activeProviders = multiProviderPaymentService.getAvailableProviders();
      expect(activeProviders.some(p => p.id === 'temp-provider')).toBe(false);
    });
  });
});

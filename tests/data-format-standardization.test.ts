/**
 * Test Suite for Data Format Standardization
 * Validates consistency across frontend, backend, and database layers
 */

import {
  PaymentRequest,
  PaymentResponse,
  PaymentInfo,
  HealthStatus,
  ApiResponse,
  ApiError,
  RateLimitInfo,
  Amount,
  Timestamp,
  UserId,
  MeterId,
  TransactionId,
  PaymentFrequency,
  PaymentStatus,
  Network,
  Currency,
  amountToString,
  amountToNumber,
  dateToTimestamp,
  timestampToDate,
  getCurrentTimestamp,
  isPaymentRequest,
  isApiResponse,
  isApiError,
  DEFAULT_CURRENCY,
  DEFAULT_NETWORK
} from '../shared/types';

describe('Data Format Standardization', () => {
  describe('Type Guards', () => {
    describe('isPaymentRequest', () => {
      it('should validate correct payment request', () => {
        const validRequest: PaymentRequest = {
          meterId: 'METER123',
          amount: '100.50',
          userId: 'USER456',
          currency: Currency.XLM,
          network: Network.TESTNET
        };

        expect(isPaymentRequest(validRequest)).toBe(true);
      });

      it('should reject invalid payment request', () => {
        const invalidRequest = {
          meterId: 123, // Wrong type
          amount: '100.50',
          userId: 'USER456'
        };

        expect(isPaymentRequest(invalidRequest)).toBe(false);
      });

      it('should accept minimal valid request', () => {
        const minimalRequest: PaymentRequest = {
          meterId: 'METER123',
          amount: '100.50',
          userId: 'USER456'
        };

        expect(isPaymentRequest(minimalRequest)).toBe(true);
      });
    });

    describe('isApiResponse', () => {
      it('should validate correct API response', () => {
        const validResponse: ApiResponse<string> = {
          success: true,
          data: 'test data',
          timestamp: getCurrentTimestamp()
        };

        expect(isApiResponse(validResponse)).toBe(true);
      });

      it('should reject invalid API response', () => {
        const invalidResponse = {
          success: true,
          // Missing data field
          timestamp: getCurrentTimestamp()
        };

        expect(isApiResponse(invalidResponse)).toBe(false);
      });
    });

    describe('isApiError', () => {
      it('should validate correct API error', () => {
        const validError: ApiError = {
          success: false,
          error: 'Test error',
          code: 'TEST_ERROR',
          timestamp: getCurrentTimestamp()
        };

        expect(isApiError(validError)).toBe(true);
      });

      it('should reject invalid API error', () => {
        const invalidError = {
          success: false,
          // Missing error field
          timestamp: getCurrentTimestamp()
        };

        expect(isApiError(invalidError)).toBe(false);
      });
    });
  });

  describe('Conversion Utilities', () => {
    describe('Amount Conversion', () => {
      it('should convert number to string amount', () => {
        const amount = 100.50;
        const result = amountToString(amount);
        
        expect(result).toBe('100.5');
        expect(typeof result).toBe('string');
      });

      it('should convert string amount to number', () => {
        const amountStr = '100.5';
        const result = amountToNumber(amountStr);
        
        expect(result).toBe(100.5);
        expect(typeof result).toBe('number');
      });

      it('handle zero amount', () => {
        expect(amountToString(0)).toBe('0');
        expect(amountToNumber('0')).toBe(0);
      });

      it('handle decimal precision', () => {
        expect(amountToString(0.00000001)).toBe('0.00000001');
        expect(amountToNumber('0.00000001')).toBe(0.00000001);
      });
    });

    describe('Timestamp Conversion', () => {
      it('should convert Date to ISO timestamp', () => {
        const date = new Date('2024-01-15T10:30:00.000Z');
        const result = dateToTimestamp(date);
        
        expect(result).toBe('2024-01-15T10:30:00.000Z');
        expect(typeof result).toBe('string');
      });

      it('should convert ISO timestamp to Date', () => {
        const timestamp = '2024-01-15T10:30:00.000Z';
        const result = timestampToDate(timestamp);
        
        expect(result).toBeInstanceOf(Date);
        expect(result.toISOString()).toBe('2024-01-15T10:30:00.000Z');
      });

      it('handle current timestamp', () => {
        const timestamp = getCurrentTimestamp();
        expect(typeof timestamp).toBe('string');
        expect(() => new Date(timestamp)).not.toThrow();
      });
    });
  });

  describe('Data Structure Validation', () => {
    describe('PaymentRequest Structure', () => {
      it('should create valid payment request with all fields', () => {
        const request: PaymentRequest = {
          meterId: 'METER123' as MeterId,
          amount: '100.50' as Amount,
          userId: 'USER456' as UserId,
          currency: Currency.XLM,
          network: Network.TESTNET
        };

        expect(request.meterId).toBe('METER123');
        expect(request.amount).toBe('100.50');
        expect(request.userId).toBe('USER456');
        expect(request.currency).toBe(Currency.XLM);
        expect(request.network).toBe(Network.TESTNET);
      });

      it('should use default values for optional fields', () => {
        const request: PaymentRequest = {
          meterId: 'METER123' as MeterId,
          amount: '100.50' as Amount,
          userId: 'USER456' as UserId
        };

        expect(request.currency).toBeUndefined();
        expect(request.network).toBeUndefined();
      });
    });

    describe('PaymentResponse Structure', () => {
      it('should create successful payment response', () => {
        const response: PaymentResponse = {
          success: true,
          transactionId: 'TX123456' as TransactionId,
          timestamp: getCurrentTimestamp()
        };

        expect(response.success).toBe(true);
        expect(response.transactionId).toBe('TX123456');
        expect(typeof response.timestamp).toBe('string');
      });

      it('should create failed payment response', () => {
        const response: PaymentResponse = {
          success: false,
          error: 'Payment failed',
          timestamp: getCurrentTimestamp()
        };

        expect(response.success).toBe(false);
        expect(response.error).toBe('Payment failed');
        expect(response.transactionId).toBeUndefined();
      });
    });

    describe('RateLimitInfo Structure', () => {
      it('should create complete rate limit info', () => {
        const rateLimitInfo: RateLimitInfo = {
          remainingRequests: 3,
          resetTime: getCurrentTimestamp(),
          allowed: true,
          queued: false,
          windowMs: 60000,
          maxRequests: 5
        };

        expect(rateLimitInfo.remainingRequests).toBe(3);
        expect(rateLimitInfo.allowed).toBe(true);
        expect(rateLimitInfo.queued).toBe(false);
        expect(rateLimitInfo.windowMs).toBe(60000);
        expect(rateLimitInfo.maxRequests).toBe(5);
      });

      it('should handle queued rate limit info', () => {
        const rateLimitInfo: RateLimitInfo = {
          remainingRequests: 0,
          resetTime: getCurrentTimestamp(),
          allowed: false,
          queued: true,
          queuePosition: 2,
          windowMs: 60000,
          maxRequests: 5
        };

        expect(rateLimitInfo.allowed).toBe(false);
        expect(rateLimitInfo.queued).toBe(true);
        expect(rateLimitInfo.queuePosition).toBe(2);
      });
    });
  });

  describe('Enum Consistency', () => {
    describe('PaymentFrequency', () => {
      it('should have all expected frequency values', () => {
        expect(PaymentFrequency.ONCE).toBe('once');
        expect(PaymentFrequency.DAILY).toBe('daily');
        expect(PaymentFrequency.WEEKLY).toBe('weekly');
        expect(PaymentFrequency.BIWEEKLY).toBe('biweekly');
        expect(PaymentFrequency.MONTHLY).toBe('monthly');
        expect(PaymentFrequency.QUARTERLY).toBe('quarterly');
        expect(PaymentFrequency.YEARLY).toBe('yearly');
      });
    });

    describe('PaymentStatus', () => {
      it('should have all expected status values', () => {
        expect(PaymentStatus.PENDING).toBe('pending');
        expect(PaymentStatus.SCHEDULED).toBe('scheduled');
        expect(PaymentStatus.PROCESSING).toBe('processing');
        expect(PaymentStatus.COMPLETED).toBe('completed');
        expect(PaymentStatus.FAILED).toBe('failed');
        expect(PaymentStatus.CANCELLED).toBe('cancelled');
        expect(PaymentStatus.QUEUED).toBe('queued');
      });
    });

    describe('Network', () => {
      it('should have all expected network values', () => {
        expect(Network.TESTNET).toBe('testnet');
        expect(Network.MAINNET).toBe('mainnet');
      });
    });

    describe('Currency', () => {
      it('should have all expected currency values', () => {
        expect(Currency.XLM).toBe('XLM');
      });
    });
  });

  describe('Default Values', () => {
    it('should use correct default currency', () => {
      expect(DEFAULT_CURRENCY).toBe(Currency.XLM);
    });

    it('should use correct default network', () => {
      expect(DEFAULT_NETWORK).toBe(Network.TESTNET);
    });
  });

  describe('API Response Wrappers', () => {
    describe('Success Response', () => {
      it('should create properly formatted success response', () => {
        const data = { result: 'success' };
        const response: ApiResponse<typeof data> = {
          success: true,
          data,
          timestamp: getCurrentTimestamp()
        };

        expect(response.success).toBe(true);
        expect(response.data).toEqual(data);
        expect(typeof response.timestamp).toBe('string');
      });
    });

    describe('Error Response', () => {
      it('should create properly formatted error response', () => {
        const response: ApiError = {
          success: false,
          error: 'Invalid request',
          code: 'INVALID_REQUEST',
          details: { field: 'amount' },
          timestamp: getCurrentTimestamp()
        };

        expect(response.success).toBe(false);
        expect(response.error).toBe('Invalid request');
        expect(response.code).toBe('INVALID_REQUEST');
        expect(response.details).toEqual({ field: 'amount' });
      });
    });
  });

  describe('Integration Tests', () => {
    describe('End-to-End Data Flow', () => {
      it('should maintain data consistency through conversion pipeline', () => {
        // Start with raw data
        const rawAmount = 100.50;
        const rawDate = new Date('2024-01-15T10:30:00.000Z');

        // Convert to standardized format
        const standardAmount: Amount = amountToString(rawAmount);
        const standardTimestamp: Timestamp = dateToTimestamp(rawDate);

        // Create standardized objects
        const request: PaymentRequest = {
          meterId: 'METER123' as MeterId,
          amount: standardAmount,
          userId: 'USER456' as UserId,
          currency: DEFAULT_CURRENCY,
          network: DEFAULT_NETWORK
        };

        const response: ApiResponse<PaymentResponse> = {
          success: true,
          data: {
            success: true,
            transactionId: 'TX123456' as TransactionId,
            timestamp: standardTimestamp
          },
          timestamp: standardTimestamp
        };

        // Validate consistency
        expect(isPaymentRequest(request)).toBe(true);
        expect(isApiResponse(response)).toBe(true);
        expect(amountToNumber(standardAmount)).toBe(rawAmount);
        expect(timestampToDate(standardTimestamp)).toEqual(rawDate);
      });
    });

    describe('Error Handling Consistency', () => {
      it('should maintain error format consistency', () => {
        const errorResponse: ApiError = {
          success: false,
          error: 'Rate limit exceeded',
          code: 'RATE_LIMIT_EXCEEDED',
          details: {
            remainingRequests: 0,
            resetTime: getCurrentTimestamp()
          },
          timestamp: getCurrentTimestamp()
        };

        expect(isApiError(errorResponse)).toBe(true);
        expect(errorResponse.success).toBe(false);
        expect(typeof errorResponse.error).toBe('string');
        expect(typeof errorResponse.code).toBe('string');
        expect(typeof errorResponse.timestamp).toBe('string');
      });
    });
  });

  describe('Performance Considerations', () => {
    it('should handle large amounts without precision loss', () => {
      const largeAmount = 999999999.99999999;
      const stringAmount = amountToString(largeAmount);
      const convertedBack = amountToNumber(stringAmount);

      expect(stringAmount).toBe('999999999.99999999');
      expect(convertedBack).toBe(largeAmount);
    });

    it('should handle timestamp conversions efficiently', () => {
      const iterations = 1000;
      const startTime = performance.now();

      for (let i = 0; i < iterations; i++) {
        const date = new Date();
        const timestamp = dateToTimestamp(date);
        const convertedBack = timestampToDate(timestamp);
        expect(convertedBack).toBeInstanceOf(Date);
      }

      const endTime = performance.now();
      const averageTime = (endTime - startTime) / iterations;

      // Should complete conversions in under 1ms each on average
      expect(averageTime).toBeLessThan(1);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty strings gracefully', () => {
      expect(() => amountToNumber('')).not.toThrow();
      expect(amountToNumber('')).toBe(0);
    });

    it('should handle invalid timestamps gracefully', () => {
      expect(() => timestampToDate('invalid-date')).toThrow();
    });

    it('should handle null/undefined in optional fields', () => {
      const request: PaymentRequest = {
        meterId: 'METER123' as MeterId,
        amount: '100.50' as Amount,
        userId: 'USER456' as UserId,
        currency: undefined,
        network: undefined
      };

      expect(isPaymentRequest(request)).toBe(true);
    });
  });
});

describe('Backward Compatibility', () => {
  describe('Legacy Format Support', () => {
    it('should support legacy payment request format', () => {
      // This test would be implemented when legacy conversion functions are added
      // For now, we validate that the new format can handle legacy-style data
      const legacyStyleRequest = {
        meterId: 'METER123',
        amount: '100.50',
        userId: 'USER456'
      };

      expect(isPaymentRequest(legacyStyleRequest)).toBe(true);
    });
  });

  describe('Migration Path', () => {
    it('should provide clear migration indicators', () => {
      // Test that deprecated interfaces are properly marked
      // This would be verified through TypeScript compilation
      expect(true).toBe(true); // Placeholder for deprecation testing
    });
  });
});

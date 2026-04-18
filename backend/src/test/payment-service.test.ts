import { PaymentService, PaymentRequest } from '../payment-service'
import { RateLimiter, RateLimitConfig } from '../rate-limiter'
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals'

// Mock the NEPA client
jest.mock('../packages/nepa_client_v2', () => ({
  Client: jest.fn().mockImplementation(() => ({
    pay_bill: jest.fn().mockResolvedValue({
      hash: 'test_payment_hash_12345',
      result: { success: true }
    })
  }))
}))

// Mock Stellar SDK
jest.mock('@stellar/stellar-sdk', () => ({
  Keypair: {
    fromSecret: jest.fn().mockReturnValue({
      publicKey: 'GTEST1234567890abcdef1234567890abcdef12345678',
      sign: jest.fn()
    })
  }
}))

describe('PaymentService', () => {
  let paymentService: PaymentService
  let rateLimitConfig: RateLimitConfig

  beforeEach(() => {
    // Mock environment variables
    process.env.SECRET_KEY = 'SABER1234567890abcdef1234567890abcdef1234567890abcdef1234567890'
    
    rateLimitConfig = {
      windowMs: 60000, // 1 minute
      maxRequests: 5,   // 5 requests per minute
      queueSize: 10
    }
    
    paymentService = new PaymentService(rateLimitConfig)
    
    // Mock Date for consistent timing
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.useRealTimers()
    delete process.env.SECRET_KEY
  })

  describe('Payment Processing', () => {
    const validPaymentRequest: PaymentRequest = {
      meter_id: 'METER-001',
      amount: 100,
      userId: 'user123'
    }

    it('should process valid payment successfully', async () => {
      const result = await paymentService.processPayment(validPaymentRequest)

      expect(result.success).toBe(true)
      expect(result.transactionId).toBeTruthy()
      expect(result.error).toBeUndefined()
      expect(result.rateLimitInfo).toBeTruthy()
    })

    it('should reject payment with invalid meter ID', async () => {
      const invalidRequest: PaymentRequest = {
        meter_id: '',
        amount: 100,
        userId: 'user123'
      }

      const result = await paymentService.processPayment(invalidRequest)

      expect(result.success).toBe(false)
      expect(result.error).toContain('Invalid meter ID')
      expect(result.transactionId).toBeUndefined()
    })

    it('should reject payment with invalid amount', async () => {
      const invalidRequests: PaymentRequest[] = [
        { meter_id: 'METER-001', amount: 0, userId: 'user123' },
        { meter_id: 'METER-001', amount: -10, userId: 'user123' },
        { meter_id: 'METER-001', amount: Number.POSITIVE_INFINITY, userId: 'user123' },
        { meter_id: 'METER-001', amount: Number.NaN, userId: 'user123' }
      ]

      for (const request of invalidRequests) {
        const result = await paymentService.processPayment(request)
        expect(result.success).toBe(false)
        expect(result.error).toContain('Invalid amount')
      }
    })

    it('should reject payment with invalid user ID', async () => {
      const invalidRequests: PaymentRequest[] = [
        { meter_id: 'METER-001', amount: 100, userId: '' },
        { meter_id: 'METER-001', amount: 100, userId: null as any },
        { meter_id: 'METER-001', amount: 100, userId: undefined as any }
      ]

      for (const request of invalidRequests) {
        const result = await paymentService.processPayment(request)
        expect(result.success).toBe(false)
        expect(result.error).toContain('Invalid user ID')
      }
    })

    it('should handle very large amounts', async () => {
      const largeAmountRequest: PaymentRequest = {
        meter_id: 'METER-001',
        amount: Number.MAX_SAFE_INTEGER,
        userId: 'user123'
      }

      const result = await paymentService.processPayment(largeAmountRequest)

      expect(result.success).toBe(true)
      expect(result.transactionId).toBeTruthy()
    })

    it('should handle decimal amounts', async () => {
      const decimalAmountRequest: PaymentRequest = {
        meter_id: 'METER-001',
        amount: 100.5,
        userId: 'user123'
      }

      const result = await paymentService.processPayment(decimalAmountRequest)

      expect(result.success).toBe(true)
      expect(result.transactionId).toBeTruthy()
    })
  })

  describe('Rate Limiting Integration', () => {
    const validPaymentRequest: PaymentRequest = {
      meter_id: 'METER-001',
      amount: 100,
      userId: 'user123'
    }

    it('should respect rate limits', async () => {
      // Process payments up to the limit
      for (let i = 0; i < 5; i++) {
        const result = await paymentService.processPayment(validPaymentRequest)
        expect(result.success).toBe(true)
      }

      // Next payment should be rate limited
      const result = await paymentService.processPayment(validPaymentRequest)
      expect(result.success).toBe(false)
      expect(result.error).toContain('Rate limit exceeded')
      expect(result.rateLimitInfo?.allowed).toBe(false)
    })

    it('should queue payments when rate limit exceeded', async () => {
      // Use up all requests
      for (let i = 0; i < 5; i++) {
        await paymentService.processPayment(validPaymentRequest)
      }

      // Queue a payment
      const queuePromise = paymentService.processPayment(validPaymentRequest)
      
      // Should return queued status immediately
      const result = await queuePromise
      expect(result.success).toBe(false)
      expect(result.error).toContain('queued')
      expect(result.rateLimitInfo?.queued).toBe(true)
    })

    it('should process queued payments when rate limit resets', async () => {
      // Use up all requests
      for (let i = 0; i < 5; i++) {
        await paymentService.processPayment(validPaymentRequest)
      }

      // Queue a payment
      const queuePromise = paymentService.processPayment(validPaymentRequest)
      
      // Advance time to reset rate limit
      jest.advanceTimersByTime(61000) // 61 seconds
      
      // Wait for queue processing
      jest.advanceTimersByTime(1000)
      
      const result = await queuePromise
      expect(result.success).toBe(true)
      expect(result.transactionId).toBeTruthy()
    })

    it('should handle rate limit errors gracefully', async () => {
      // Mock rate limiter to throw an error
      const mockRateLimiter = {
        checkLimit: jest.fn().mockRejectedValue(new Error('Rate limiter error'))
      }
      
      const serviceWithMockLimiter = new (PaymentService as any)(rateLimitConfig)
      serviceWithMockLimiter.rateLimiter = mockRateLimiter

      const result = await serviceWithMockLimiter.processPayment(validPaymentRequest)
      
      expect(result.success).toBe(false)
      expect(result.error).toContain('Rate limiter error')
    })
  })

  describe('Transaction Execution', () => {
    it('should handle contract payment errors', async () => {
      // Mock contract client to throw an error
      const { Client } = require('../packages/nepa_client_v2')
      Client.mockImplementation(() => ({
        pay_bill: jest.fn().mockRejectedValue(new Error('Contract error'))
      }))

      const result = await paymentService.processPayment({
        meter_id: 'METER-001',
        amount: 100,
        userId: 'user123'
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain('Contract error')
    })

    it('should handle missing secret key', async () => {
      delete process.env.SECRET_KEY

      const result = await paymentService.processPayment({
        meter_id: 'METER-001',
        amount: 100,
        userId: 'user123'
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain('Admin secret key not configured')
    })

    it('should handle transaction signing errors', async () => {
      // Mock Keypair to throw an error
      const { Keypair } = require('@stellar/stellar-sdk')
      Keypair.fromSecret = jest.fn().mockImplementation(() => {
        throw new Error('Invalid secret key')
      })

      const result = await paymentService.processPayment({
        meter_id: 'METER-001',
        amount: 100,
        userId: 'user123'
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain('Invalid secret key')
    })

    it('should generate unique transaction IDs', async () => {
      const requests = [
        { meter_id: 'METER-001', amount: 100, userId: 'user123' },
        { meter_id: 'METER-002', amount: 200, userId: 'user456' },
        { meter_id: 'METER-003', amount: 300, userId: 'user789' }
      ]

      const results = await Promise.all(
        requests.map(request => paymentService.processPayment(request))
      )

      const transactionIds = results
        .filter(r => r.success)
        .map(r => r.transactionId)

      expect(transactionIds).toHaveLength(3)
      expect(new Set(transactionIds)).toHaveLength(3) // All unique
    })
  })

  describe('Utility Methods', () => {
    it('should return rate limit status', () => {
      const userId = 'user123'
      const status = paymentService.getRateLimitStatus(userId)

      expect(status).toHaveProperty('allowed')
      expect(status).toHaveProperty('remainingRequests')
      expect(status).toHaveProperty('resetTime')
      expect(status).toHaveProperty('queued')
    })

    it('should return queue length', () => {
      const userId = 'user123'
      const queueLength = paymentService.getQueueLength(userId)

      expect(typeof queueLength).toBe('number')
      expect(queueLength).toBeGreaterThanOrEqual(0)
    })

    it('should handle canceling queued payments', async () => {
      const result = await paymentService.cancelQueuedPayment('user123')
      
      // Currently not implemented, should return false
      expect(result).toBe(false)
    })
  })

  describe('Input Validation', () => {
    it('should validate meter ID format', async () => {
      const validMeterIds = [
        'METER-001',
        'METER123',
        'METER_001',
        '123456',
        'ABCDEF',
        'meter-001', // Should accept lowercase too
        'a1b2c3'
      ]

      for (const meterId of validMeterIds) {
        const result = await paymentService.processPayment({
          meter_id: meterId,
          amount: 100,
          userId: 'user123'
        })
        expect(result.success).toBe(true)
      }
    })

    it('should reject invalid meter ID formats', async () => {
      const invalidMeterIds = [
        '',
        '   ',
        '\t\n',
        'METER-001-INVALID-TOO-LONG-'.repeat(10),
        'METER 001', // Spaces not allowed
        'METER@001', // Special characters not allowed
        'METER#001'
      ]

      for (const meterId of invalidMeterIds) {
        const result = await paymentService.processPayment({
          meter_id: meterId,
          amount: 100,
          userId: 'user123'
        })
        expect(result.success).toBe(false)
        expect(result.error).toContain('Invalid meter ID')
      }
    })

    it('should validate user ID format', async () => {
      const validUserIds = [
        'user123',
        'user_123',
        'user-123',
        '123456',
        'abc123',
        'USER123', // Should accept uppercase
        'a1b2c3d4e5f6'
      ]

      for (const userId of validUserIds) {
        const result = await paymentService.processPayment({
          meter_id: 'METER-001',
          amount: 100,
          userId
        })
        expect(result.success).toBe(true)
      }
    })

    it('should reject invalid user ID formats', async () => {
      const invalidUserIds = [
        '',
        '   ',
        '\t\n',
        'user@123', // Special characters
        'user#123',
        'user 123', // Spaces
        'user.123',
        'user,123'
      ]

      for (const userId of invalidUserIds) {
        const result = await paymentService.processPayment({
          meter_id: 'METER-001',
          amount: 100,
          userId
        })
        expect(result.success).toBe(false)
        expect(result.error).toContain('Invalid user ID')
      }
    })
  })

  describe('Concurrent Payments', () => {
    it('should handle concurrent payments for different users', async () => {
      const requests = [
        { meter_id: 'METER-001', amount: 100, userId: 'user1' },
        { meter_id: 'METER-002', amount: 200, userId: 'user2' },
        { meter_id: 'METER-003', amount: 300, userId: 'user3' }
      ]

      const results = await Promise.all(
        requests.map(request => paymentService.processPayment(request))
      )

      results.forEach(result => {
        expect(result.success).toBe(true)
        expect(result.transactionId).toBeTruthy()
      })
    })

    it('should handle concurrent payments for same user within limits', async () => {
      const requests = Array(5).fill(null).map((_, i) => ({
        meter_id: `METER-${String(i + 1).padStart(3, '0')}`,
        amount: 100,
        userId: 'user123'
      }))

      const results = await Promise.all(
        requests.map(request => paymentService.processPayment(request))
      )

      results.forEach(result => {
        expect(result.success).toBe(true)
        expect(result.transactionId).toBeTruthy()
      })
    })

    it('should handle concurrent payments exceeding limits', async () => {
      const requests = Array(10).fill(null).map((_, i) => ({
        meter_id: `METER-${String(i + 1).padStart(3, '0')}`,
        amount: 100,
        userId: 'user123'
      }))

      const results = await Promise.all(
        requests.map(request => paymentService.processPayment(request))
      )

      // First 5 should succeed
      const successfulResults = results.filter(r => r.success)
      expect(successfulResults).toHaveLength(5)

      // Remaining 5 should be rate limited or queued
      const rateLimitedResults = results.filter(r => !r.success)
      expect(rateLimitedResults).toHaveLength(5)
      
      rateLimitedResults.forEach(result => {
        expect(result.error).toMatch(/Rate limit|queued/)
      })
    })
  })
})

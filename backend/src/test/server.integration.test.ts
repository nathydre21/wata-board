import request from 'supertest'
import app from '../server'
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals'

// Mock the NEPA client
jest.mock('../packages/nepa_client_v2', () => ({
  Client: jest.fn().mockImplementation(() => ({
    pay_bill: jest.fn().mockResolvedValue({
      hash: 'test_payment_hash_12345',
      result: { success: true }
    }),
    get_total_paid: jest.fn().mockResolvedValue({
      result: '100.5000000'
    })
  })),
  networks: {
    testnet: {
      networkPassphrase: 'Test SDF Network ; September 2015',
      contractId: 'CDRRJ7IPYDL36YSK5ZQLBG3LICULETIBXX327AGJQNTWXNKY2UMDO4DA'
    }
  }
}))

describe('API Integration Tests', () => {
  beforeEach(() => {
    // Mock environment variables (envConfig singleton already loaded from setup.ts)
    process.env.SECRET_KEY = 'SCZANGBA5RLKJZ65NOCRQSMUXNK3LSNZEOZ5WLBAOWCA6ZXHM7NIYFP4'
    process.env.NODE_ENV = 'test'
  })

  afterEach(() => {
    delete process.env.SECRET_KEY
  })

  describe('Health Check Endpoints', () => {
    it('GET /health (Liveness) should return health status UP', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200)

      expect(response.body).toHaveProperty('status', 'UP')
      expect(response.body).toHaveProperty('timestamp')
    })

    it('GET /health/ready (Readiness) should return 200/503 based on dependencies', async () => {
      const response = await request(app)
        .get('/health/ready')
      
      expect(response.status).toBe(200) // Mocked Stellar is UP
      expect(response.body).toHaveProperty('status', 'UP')
      expect(response.body).toHaveProperty('ready', true)
    })

    it('GET /health/full (Diagnostics) should return system metrics', async () => {
      const response = await request(app)
        .get('/health/full')
        .expect(200)

      expect(response.body).toHaveProperty('status', 'UP')
      expect(response.body).toHaveProperty('system')
      expect(response.body.system).toHaveProperty('memory')
      expect(response.body).toHaveProperty('dependencies')
    })
  })

  describe('Payment API', () => {
    describe('POST /api/payment', () => {
      it('should process valid payment', async () => {
        const paymentData = {
          meter_id: 'METER-001',
          amount: 100,
          userId: 'user123'
        }

        const response = await request(app)
          .post('/api/payment')
          .send(paymentData)
          .expect(200)

        expect(response.body.success).toBe(true)
        expect(response.body.transactionId).toBeTruthy()
        expect(response.body.rateLimitInfo).toBeTruthy()
      })

      it('should reject payment with missing fields', async () => {
        const invalidRequests = [
          {}, // Empty body
          { meter_id: 'METER-001' }, // Missing amount and userId
          { amount: 100 }, // Missing meter_id and userId
          { userId: 'user123' }, // Missing meter_id and amount
          { meter_id: '', amount: 100, userId: 'user123' }, // Empty meter_id
          { meter_id: 'METER-001', amount: 0, userId: 'user123' }, // Zero amount
          { meter_id: 'METER-001', amount: -10, userId: 'user123' } // Negative amount
        ]

        for (const requestData of invalidRequests) {
          const response = await request(app)
            .post('/api/payment')
            .send(requestData)
            .expect(400)

          expect(response.body.success).toBe(false)
          expect(response.body.error).toBeTruthy()
        }
      })

      it('should reject payment with invalid field types', async () => {
        const invalidRequests = [
          { meter_id: 123, amount: 100, userId: 'user123' }, // meter_id as number
          { meter_id: 'METER-001', amount: '100', userId: 'user123' }, // amount as string
          { meter_id: 'METER-001', amount: 100, userId: 123 } // userId as number
        ]

        for (const requestData of invalidRequests) {
          const response = await request(app)
            .post('/api/payment')
            .send(requestData)
            .expect(400)

          expect(response.body.success).toBe(false)
          expect(response.body.error).toContain('Invalid field types')
        }
      })

      it('should handle rate limiting', async () => {
        const paymentData = {
          meter_id: 'METER-001',
          amount: 100,
          userId: 'user123'
        }

        // Process payments up to the limit
        for (let i = 0; i < 5; i++) {
          await request(app)
            .post('/api/payment')
            .send(paymentData)
            .expect(200)
        }

        // Next payment should be rate limited
        const response = await request(app)
          .post('/api/payment')
          .send(paymentData)
          .expect(429)

        expect(response.body.success).toBe(false)
        expect(response.body.error).toContain('Rate limit exceeded')
        expect(response.body.rateLimitInfo).toBeTruthy()
      })

      it('should handle queued payments', async () => {
        const paymentData = {
          meter_id: 'METER-001',
          amount: 100,
          userId: 'user123'
        }

        // Use up all requests
        for (let i = 0; i < 5; i++) {
          await request(app)
            .post('/api/payment')
            .send(paymentData)
            .expect(200)
        }

        // Queue additional requests
        for (let i = 0; i < 3; i++) {
          const response = await request(app)
            .post('/api/payment')
            .send(paymentData)
            .expect(202)

          expect(response.body.success).toBe(false)
          expect(response.body.error).toContain('queued')
          expect(response.body.rateLimitInfo).toBeTruthy()
        }
      })

      it('should include CORS headers', async () => {
        const paymentData = {
          meter_id: 'METER-001',
          amount: 100,
          userId: 'user123'
        }

        const response = await request(app)
          .post('/api/payment')
          .send(paymentData)
          .expect(200)

        expect(response.headers).toHaveProperty('access-control-allow-origin')
        expect(response.headers).toHaveProperty('x-rate-limit-remaining')
      })

      it('should handle malformed JSON', async () => {
        const response = await request(app)
          .post('/api/payment')
          .send('invalid json')
          .set('Content-Type', 'application/json')
          .expect(400)

        expect(response.body.success).toBe(false)
      })

      it('should handle very large payloads', async () => {
        const largePayload = {
          meter_id: 'METER-' + 'A'.repeat(10000),
          amount: 100,
          userId: 'user-' + 'B'.repeat(10000)
        }

        const response = await request(app)
          .post('/api/payment')
          .send(largePayload)
          .expect(400)

        expect(response.body.success).toBe(false)
        expect(response.body.error).toContain('Invalid meter ID')
      })
    })

    describe('GET /api/payment/:meterId', () => {
      it('should return total paid amount for meter', async () => {
        const meterId = 'METER-001'

        const response = await request(app)
          .get(`/api/payment/${meterId}`)
          .expect(200)

        expect(response.body.success).toBe(true)
        expect(response.body.data).toHaveProperty('meterId', meterId)
        expect(response.body.data).toHaveProperty('totalPaid', 100.5)
        expect(response.body.data).toHaveProperty('network', 'testnet')
      })

      it('should handle missing meter ID', async () => {
        const response = await request(app)
          .get('/api/payment/')
          .expect(404)

        expect(response.body.success).toBe(false)
        expect(response.body.error).toContain('Endpoint not found')
      })

      it('should handle empty meter ID', async () => {
        const response = await request(app)
          .get('/api/payment/')
          .expect(404)
      })

      it('should handle contract errors', async () => {
        // Mock contract client to throw an error
        const { Client } = require('../packages/nepa_client_v2')
        Client.mockImplementation(() => ({
          get_total_paid: jest.fn().mockRejectedValue(new Error('Contract error'))
        }))

        const response = await request(app)
          .get('/api/payment/METER-001')
          .expect(500)

        expect(response.body.success).toBe(false)
        expect(response.body.error).toContain('Failed to retrieve payment information')
      })
    })

    describe('GET /api/rate-limit/:userId', () => {
      it('should return rate limit status for user', async () => {
        const userId = 'user123'

        const response = await request(app)
          .get(`/api/rate-limit/${userId}`)
          .expect(200)

        expect(response.body.success).toBe(true)
        expect(response.body.data).toHaveProperty('allowed')
        expect(response.body.data).toHaveProperty('remainingRequests')
        expect(response.body.data).toHaveProperty('resetTime')
        expect(response.body.data).toHaveProperty('queueLength')
      })

      it('should handle missing user ID', async () => {
        const response = await request(app)
          .get('/api/rate-limit/')
          .expect(404)

        expect(response.body.success).toBe(false)
      })

      it('should update rate limit after payments', async () => {
        const userId = 'user123'
        const paymentData = {
          meter_id: 'METER-001',
          amount: 100,
          userId
        }

        // Get initial status
        const initialResponse = await request(app)
          .get(`/api/rate-limit/${userId}`)
          .expect(200)

        const initialRemaining = initialResponse.body.data.remainingRequests

        // Make a payment
        await request(app)
          .post('/api/payment')
          .send(paymentData)
          .expect(200)

        // Get updated status
        const updatedResponse = await request(app)
          .get(`/api/rate-limit/${userId}`)
          .expect(200)

        expect(updatedResponse.body.data.remainingRequests).toBe(initialRemaining - 1)
      })
    })
  })

  describe('CORS Configuration', () => {
    it('should handle preflight requests', async () => {
      const response = await request(app)
        .options('/api/payment')
        .set('Origin', 'http://localhost:3000')
        .set('Access-Control-Request-Method', 'POST')
        .expect(200)

      expect(response.headers).toHaveProperty('access-control-allow-origin')
      expect(response.headers).toHaveProperty('access-control-allow-methods')
      expect(response.headers).toHaveProperty('access-control-allow-headers')
    })

    it('should reject disallowed origins in production', async () => {
      // envConfig is a validated singleton set at startup (NODE_ENV=test).
      // CORS origin rejection is tested by sending an origin not in ALLOWED_ORIGINS
      // and not matching the localhost dev-mode allowlist.
      const response = await request(app)
        .post('/api/payment')
        .set('Origin', 'https://malicious.com')
        .send({
          meter_id: 'METER-001',
          amount: 100,
          userId: 'user123'
        })

      // In test env with no ALLOWED_ORIGINS set, unknown origins are rejected by CORS
      expect([403, 500]).toContain(response.status)
    })

    it('should allow localhost in development', async () => {
      // envConfig.NODE_ENV is 'test' (set in setup.ts); localhost is allowed in dev/test
      const response = await request(app)
        .post('/api/payment')
        .set('Origin', 'http://localhost:3000')
        .send({
          meter_id: 'METER-001',
          amount: 100,
          userId: 'user123'
        })

      // localhost is always allowed when NODE_ENV !== 'production'
      expect(response.status).not.toBe(403)
    })
  })

  describe('Error Handling', () => {
    it('should handle 404 for unknown endpoints', async () => {
      const response = await request(app)
        .get('/unknown/endpoint')
        .expect(404)

      expect(response.body.success).toBe(false)
      expect(response.body.error).toContain('Endpoint not found')
    })

    it('should handle internal server errors', async () => {
      // Mock the payment service to throw an error
      const originalPaymentService = require('../payment-service').PaymentService
      const mockPaymentService = {
        processPayment: jest.fn().mockRejectedValue(new Error('Internal error'))
      }

      // This would require dependency injection to test properly
      // For now, we'll test the error handling middleware directly
      const response = await request(app)
        .post('/api/payment')
        .send({
          meter_id: 'METER-001',
          amount: 100,
          userId: 'user123'
        })
        .expect(500)

      expect(response.body.success).toBe(false)
      expect(response.body.error).toContain('Internal server error')
    })

    it('should handle request timeout', async () => {
      // This would require configuring a timeout middleware
      // For now, we'll test that the server doesn't crash
      const response = await request(app)
        .post('/api/payment')
        .send({
          meter_id: 'METER-001',
          amount: 100,
          userId: 'user123'
        })
        .timeout(1000) // 1 second timeout

      expect(response.status).toBeLessThan(500)
    })
  })

  describe('Security Headers', () => {
    it('should include security headers', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200)

      expect(response.headers).toHaveProperty('x-content-type-options')
      expect(response.headers).toHaveProperty('x-frame-options')
      expect(response.headers).toHaveProperty('x-xss-protection')
    })

    it('should include CSP header', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200)

      expect(response.headers).toHaveProperty('content-security-policy')
    })
  })

  describe('Request Validation', () => {
    it('should reject oversized requests', async () => {
      const largePayload = {
        meter_id: 'METER-001',
        amount: 100,
        userId: 'user123',
        data: 'x'.repeat(11 * 1024 * 1024) // 11MB payload
      }

      const response = await request(app)
        .post('/api/payment')
        .send(largePayload)
        .expect(413) // Payload Too Large
    })

    it('should handle malformed request bodies', async () => {
      const response = await request(app)
        .post('/api/payment')
        .send('{"invalid": json}') // Malformed JSON
        .set('Content-Type', 'application/json')
        .expect(400)

      expect(response.body.success).toBe(false)
    })

    it('should validate content type', async () => {
      const response = await request(app)
        .post('/api/payment')
        .send('plain text data')
        .set('Content-Type', 'text/plain')
        .expect(400)

      expect(response.body.success).toBe(false)
    })
  })
})

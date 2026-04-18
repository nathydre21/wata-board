import { RateLimiter, RateLimitConfig } from '../rate-limiter'
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals'

describe('RateLimiter', () => {
  let rateLimiter: RateLimiter
  let config: RateLimitConfig

  beforeEach(() => {
    // Mock Date to control timing
    jest.useFakeTimers()
    
    config = {
      windowMs: 60000, // 1 minute
      maxRequests: 5,   // 5 requests per minute
      queueSize: 10     // Allow 10 queued requests
    }
    
    rateLimiter = new RateLimiter(config)
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  describe('Basic Rate Limiting', () => {
    it('should allow requests within limit', async () => {
      const userId = 'user123'
      
      for (let i = 0; i < 5; i++) {
        const result = await rateLimiter.checkLimit(userId)
        expect(result.allowed).toBe(true)
        expect(result.remainingRequests).toBe(4 - i)
        expect(result.queued).toBe(false)
      }
    })

    it('should block requests when limit exceeded', async () => {
      const userId = 'user123'
      
      // Use up all requests
      for (let i = 0; i < 5; i++) {
        await rateLimiter.checkLimit(userId)
      }
      
      // Next request should be blocked
      const result = await rateLimiter.checkLimit(userId)
      expect(result.allowed).toBe(false)
      expect(result.remainingRequests).toBe(0)
      expect(result.queued).toBe(false)
    })

    it('should reset after window expires', async () => {
      const userId = 'user123'
      
      // Use up all requests
      for (let i = 0; i < 5; i++) {
        await rateLimiter.checkLimit(userId)
      }
      
      // Should be blocked
      let result = await rateLimiter.checkLimit(userId)
      expect(result.allowed).toBe(false)
      
      // Advance time past window
      jest.advanceTimersByTime(61000) // 61 seconds
      
      // Should be allowed again
      result = await rateLimiter.checkLimit(userId)
      expect(result.allowed).toBe(true)
      expect(result.remainingRequests).toBe(4)
    })
  })

  describe('Queue Management', () => {
    it('should queue requests when limit exceeded', async () => {
      const userId = 'user123'
      
      // Use up all requests
      for (let i = 0; i < 5; i++) {
        await rateLimiter.checkLimit(userId)
      }
      
      // Next request should be queued
      const result = await rateLimiter.checkLimit(userId)
      expect(result.allowed).toBe(false)
      expect(result.queued).toBe(true)
      expect(result.queuePosition).toBe(1)
    })

    it('should process queued requests when window resets', async () => {
      const userId = 'user123'
      
      // Use up all requests
      for (let i = 0; i < 5; i++) {
        await rateLimiter.checkLimit(userId)
      }
      
      // Queue a request
      const queuePromise = rateLimiter.checkLimit(userId)
      
      // Advance time to reset window
      jest.advanceTimersByTime(61000)
      
      // Wait for queue processing
      jest.advanceTimersByTime(1000)
      
      const result = await queuePromise
      expect(result.allowed).toBe(true)
      expect(result.queued).toBe(false)
    })

    it('should reject when queue is full', async () => {
      const userId = 'user123'
      
      // Use up all requests
      for (let i = 0; i < 5; i++) {
        await rateLimiter.checkLimit(userId)
      }
      
      // Fill the queue
      const queuePromises = []
      for (let i = 0; i < 10; i++) {
        queuePromises.push(rateLimiter.checkLimit(userId))
      }
      
      // Next request should be rejected (queue full)
      const result = await rateLimiter.checkLimit(userId)
      expect(result.allowed).toBe(false)
      expect(result.queued).toBe(false)
      expect(result.queuePosition).toBeUndefined()
    })

    it('should maintain queue order', async () => {
      const userId = 'user123'
      
      // Use up all requests
      for (let i = 0; i < 5; i++) {
        await rateLimiter.checkLimit(userId)
      }
      
      // Queue multiple requests
      const queuePromises = []
      for (let i = 0; i < 3; i++) {
        queuePromises.push(rateLimiter.checkLimit(userId))
      }
      
      // Check queue positions
      for (let i = 0; i < 3; i++) {
        const result = await queuePromises[i]
        expect(result.queuePosition).toBe(i + 1)
      }
    })
  })

  describe('Multiple Users', () => {
    it('should handle multiple users independently', async () => {
      const user1 = 'user1'
      const user2 = 'user2'
      
      // User 1 uses up their requests
      for (let i = 0; i < 5; i++) {
        await rateLimiter.checkLimit(user1)
      }
      
      // User 1 should be blocked
      let result = await rateLimiter.checkLimit(user1)
      expect(result.allowed).toBe(false)
      
      // User 2 should still be allowed
      result = await rateLimiter.checkLimit(user2)
      expect(result.allowed).toBe(true)
      expect(result.remainingRequests).toBe(4)
    })

    it('should maintain separate queues for each user', async () => {
      const user1 = 'user1'
      const user2 = 'user2'
      
      // Use up requests for both users
      for (let i = 0; i < 5; i++) {
        await rateLimiter.checkLimit(user1)
        await rateLimiter.checkLimit(user2)
      }
      
      // Queue requests for both users
      const queue1 = rateLimiter.checkLimit(user1)
      const queue2 = rateLimiter.checkLimit(user2)
      
      const result1 = await queue1
      const result2 = await queue2
      
      expect(result1.queuePosition).toBe(1)
      expect(result2.queuePosition).toBe(1)
    })
  })

  describe('Status and Utility Methods', () => {
    it('should return correct status', async () => {
      const userId = 'user123'
      
      // Initial status
      let status = rateLimiter.getStatus(userId)
      expect(status.allowed).toBe(true)
      expect(status.remainingRequests).toBe(5)
      
      // Use some requests
      for (let i = 0; i < 3; i++) {
        await rateLimiter.checkLimit(userId)
      }
      
      status = rateLimiter.getStatus(userId)
      expect(status.allowed).toBe(true)
      expect(status.remainingRequests).toBe(2)
      
      // Use up all requests
      for (let i = 0; i < 2; i++) {
        await rateLimiter.checkLimit(userId)
      }
      
      status = rateLimiter.getStatus(userId)
      expect(status.allowed).toBe(false)
      expect(status.remainingRequests).toBe(0)
    })

    it('should return correct queue length', async () => {
      const userId = 'user123'
      
      // Use up all requests
      for (let i = 0; i < 5; i++) {
        await rateLimiter.checkLimit(userId)
      }
      
      // Queue should be empty initially
      expect(rateLimiter.getQueueLength(userId)).toBe(0)
      
      // Add to queue
      rateLimiter.checkLimit(userId)
      expect(rateLimiter.getQueueLength(userId)).toBe(1)
      
      // Add more to queue
      for (let i = 0; i < 3; i++) {
        rateLimiter.checkLimit(userId)
      }
      expect(rateLimiter.getQueueLength(userId)).toBe(4)
    })

    it('should reset user limits', async () => {
      const userId = 'user123'
      
      // Use up all requests
      for (let i = 0; i < 5; i++) {
        await rateLimiter.checkLimit(userId)
      }
      
      // Should be blocked
      let result = await rateLimiter.checkLimit(userId)
      expect(result.allowed).toBe(false)
      
      // Reset user
      rateLimiter.resetUser(userId)
      
      // Should be allowed again
      result = await rateLimiter.checkLimit(userId)
      expect(result.allowed).toBe(true)
      expect(result.remainingRequests).toBe(4)
      
      // Queue should be empty
      expect(rateLimiter.getQueueLength(userId)).toBe(0)
    })
  })

  describe('Edge Cases', () => {
    it('should handle very short windows', async () => {
      const shortConfig: RateLimitConfig = {
        windowMs: 100, // 100ms
        maxRequests: 2,
        queueSize: 5
      }
      
      const shortLimiter = new RateLimiter(shortConfig)
      const userId = 'user123'
      
      // Use up requests
      await shortLimiter.checkLimit(userId)
      await shortLimiter.checkLimit(userId)
      
      // Should be blocked
      let result = await shortLimiter.checkLimit(userId)
      expect(result.allowed).toBe(false)
      
      // Wait for window to reset
      jest.advanceTimersByTime(150)
      
      // Should be allowed again
      result = await shortLimiter.checkLimit(userId)
      expect(result.allowed).toBe(true)
    })

    it('should handle zero queue size', async () => {
      const noQueueConfig: RateLimitConfig = {
        windowMs: 60000,
        maxRequests: 2,
        queueSize: 0
      }
      
      const noQueueLimiter = new RateLimiter(noQueueConfig)
      const userId = 'user123'
      
      // Use up requests
      await noQueueLimiter.checkLimit(userId)
      await noQueueLimiter.checkLimit(userId)
      
      // Should be rejected immediately (no queue)
      const result = await noQueueLimiter.checkLimit(userId)
      expect(result.allowed).toBe(false)
      expect(result.queued).toBe(false)
    })

    it('should handle invalid user IDs', async () => {
      const invalidUserIds = ['', null, undefined]
      
      for (const userId of invalidUserIds) {
        const result = await rateLimiter.checkLimit(userId as any)
        expect(result.allowed).toBe(true)
        expect(result.remainingRequests).toBe(4)
      }
    })

    it('should clean up old requests properly', async () => {
      const userId = 'user123'
      
      // Make requests at different times
      await rateLimiter.checkLimit(userId)
      
      jest.advanceTimersByTime(30000) // 30 seconds later
      await rateLimiter.checkLimit(userId)
      
      jest.advanceTimersByTime(40000) // 40 seconds later (70 seconds total)
      await rateLimiter.checkLimit(userId)
      
      // Only the last request should be counted (first one expired)
      const status = rateLimiter.getStatus(userId)
      expect(status.remainingRequests).toBe(4) // 5 - 1 = 4
    })
  })
})

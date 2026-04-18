import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { usePaymentWithRateLimit } from '../hooks/useRateLimit'

// Mock fetch for API calls
global.fetch = vi.fn()

const mockFetch = vi.mocked(fetch)

describe('usePaymentWithRateLimit Hook', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFetch.mockClear()
  })

  it('returns initial rate limit status', () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          allowed: true,
          remainingRequests: 5,
          resetTime: new Date(Date.now() + 60000).toISOString(),
          queueLength: 0
        }
      })
    } as Response)

    const { result } = renderHook(() => usePaymentWithRateLimit())

    expect(result.current.canMakeRequest).toBe(true)
    expect(result.current.isProcessing).toBe(false)
    expect(result.current.status?.remainingRequests).toBe(5)
    expect(result.current.queueLength).toBe(0)
  })

  it('handles rate limit exceeded', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          allowed: false,
          remainingRequests: 0,
          resetTime: new Date(Date.now() + 60000).toISOString(),
          queueLength: 0
        }
      })
    } as Response)

    const { result } = renderHook(() => usePaymentWithRateLimit())

    expect(result.current.canMakeRequest).toBe(false)
    expect(result.current.status?.remainingRequests).toBe(0)
  })

  it('processes payment successfully', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            allowed: true,
            remainingRequests: 4,
            resetTime: new Date(Date.now() + 60000).toISOString(),
            queueLength: 0
          }
        })
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          transactionId: 'tx_1234567890',
          rateLimitInfo: {
            remainingRequests: 4,
            resetTime: new Date(Date.now() + 60000).toISOString()
          }
        })
      } as Response)

    const { result } = renderHook(() => usePaymentWithRateLimit())

    let paymentResult
    await act(async () => {
      paymentResult = await result.current.processPayment({
        meter_id: 'METER-001',
        amount: 10,
        userId: 'user123'
      })
    })

    expect(paymentResult.success).toBe(true)
    expect(paymentResult.transactionId).toBe('tx_1234567890')
  })

  it('handles payment failure', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            allowed: true,
            remainingRequests: 4,
            resetTime: new Date(Date.now() + 60000).toISOString(),
            queueLength: 0
          }
        })
      } as Response)
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          success: false,
          error: 'Insufficient balance'
        })
      } as Response)

    const { result } = renderHook(() => usePaymentWithRateLimit())

    let paymentResult
    await act(async () => {
      paymentResult = await result.current.processPayment({
        meter_id: 'METER-001',
        amount: 10,
        userId: 'user123'
      })
    })

    expect(paymentResult.success).toBe(false)
    expect(paymentResult.error).toBe('Insufficient balance')
  })

  it('handles rate limit during payment', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            allowed: true,
            remainingRequests: 0,
            resetTime: new Date(Date.now() + 60000).toISOString(),
            queueLength: 0
          }
        })
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 429,
        json: async () => ({
          success: false,
          error: 'Rate limit exceeded. Please wait 60 seconds before trying again.',
          rateLimitInfo: {
            remainingRequests: 0,
            resetTime: new Date(Date.now() + 60000).toISOString()
          }
        })
      } as Response)

    const { result } = renderHook(() => usePaymentWithRateLimit())

    let paymentResult
    await act(async () => {
      paymentResult = await result.current.processPayment({
        meter_id: 'METER-001',
        amount: 10,
        userId: 'user123'
      })
    })

    expect(paymentResult.success).toBe(false)
    expect(paymentResult.error).toContain('Rate limit exceeded')
  })

  it('calculates time until reset correctly', () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          allowed: false,
          remainingRequests: 0,
          resetTime: new Date(Date.now() + 30000).toISOString(),
          queueLength: 0
        }
      })
    } as Response)

    const { result } = renderHook(() => usePaymentWithRateLimit())

    expect(result.current.timeUntilReset).toBeGreaterThan(0)
    expect(result.current.timeUntilReset).toBeLessThanOrEqual(31000) // Allow 1 second tolerance
  })

  it('handles API errors gracefully', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'))

    const { result } = renderHook(() => usePaymentWithRateLimit())

    // Should handle errors without throwing
    expect(result.current.canMakeRequest).toBe(false)
    expect(result.current.paymentError).toBeTruthy()
  })

  it('updates status after payment', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            allowed: true,
            remainingRequests: 5,
            resetTime: new Date(Date.now() + 60000).toISOString(),
            queueLength: 0
          }
        })
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          transactionId: 'tx_1234567890',
          rateLimitInfo: {
            remainingRequests: 4,
            resetTime: new Date(Date.now() + 60000).toISOString()
          }
        })
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            allowed: true,
            remainingRequests: 4,
            resetTime: new Date(Date.now() + 60000).toISOString(),
            queueLength: 0
          }
        })
      } as Response)

    const { result } = renderHook(() => usePaymentWithRateLimit())

    // Initial status
    expect(result.current.status?.remainingRequests).toBe(5)

    await act(async () => {
      await result.current.processPayment({
        meter_id: 'METER-001',
        amount: 10,
        userId: 'user123'
      })
    })

    // Status should be updated after payment
    expect(result.current.status?.remainingRequests).toBe(4)
  })
})

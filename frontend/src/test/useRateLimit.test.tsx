import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useRateLimit, usePaymentWithRateLimit } from '../hooks/useRateLimit'

describe('useRateLimit Hook', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns initial rate limit state', () => {
    const { result } = renderHook(() => useRateLimit())

    expect(result.current.canMakeRequest).toBe(true)
    expect(result.current.isLoading).toBe(false)
    expect(result.current.queueLength).toBe(0)
  })

  it('can check rate limit for a user', async () => {
    const { result } = renderHook(() => useRateLimit())

    await act(async () => {
      await result.current.checkRateLimit('user123')
    })

    expect(result.current.status).not.toBeNull()
    expect(result.current.status!.allowed).toBe(true)
    expect(result.current.status!.remainingRequests).toBeGreaterThanOrEqual(0)
  })

  it('starts with canMakeRequest as true', () => {
    const { result } = renderHook(() => useRateLimit())
    expect(result.current.canMakeRequest).toBe(true)
  })

  it('can reset status', () => {
    const { result } = renderHook(() => useRateLimit())

    act(() => {
      result.current.resetStatus()
    })

    expect(result.current.status).toBeNull()
    expect(result.current.error).toBeNull()
  })
})

describe('usePaymentWithRateLimit Hook', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns initial payment state', () => {
    const { result } = renderHook(() => usePaymentWithRateLimit())

    expect(result.current.canMakeRequest).toBe(true)
    expect(result.current.isProcessing).toBe(false)
    expect(result.current.paymentError).toBeNull()
    expect(result.current.queueLength).toBe(0)
  })

  it('processes payment successfully', async () => {
    const mockPaymentFn = vi.fn().mockResolvedValue({ transactionId: 'tx_1234567890' })

    const { result } = renderHook(() => usePaymentWithRateLimit())

    let paymentResult: any
    await act(async () => {
      paymentResult = await result.current.processPayment(mockPaymentFn, 'user123')
    })

    expect(paymentResult.success).toBe(true)
    expect(paymentResult.data).toEqual({ transactionId: 'tx_1234567890' })
    expect(mockPaymentFn).toHaveBeenCalled()
  })

  it('handles payment function failure', async () => {
    const mockPaymentFn = vi.fn().mockRejectedValue(new Error('Insufficient balance'))

    const { result } = renderHook(() => usePaymentWithRateLimit())

    let paymentResult: any
    await act(async () => {
      paymentResult = await result.current.processPayment(mockPaymentFn, 'user123')
    })

    expect(paymentResult.success).toBe(false)
    expect(paymentResult.error).toBe('Insufficient balance')
  })

  it('can clear payment error', () => {
    const { result } = renderHook(() => usePaymentWithRateLimit())

    act(() => {
      result.current.clearPaymentError()
    })

    expect(result.current.paymentError).toBeNull()
  })
})

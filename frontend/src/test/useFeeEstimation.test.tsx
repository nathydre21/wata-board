import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useFeeEstimation } from '../hooks/useFeeEstimation'

// Mock Stellar SDK
vi.mock('@stellar/stellar-sdk', () => ({
  Server: vi.fn().mockImplementation(() => ({
    loadAccount: vi.fn().mockResolvedValue({
      accountId: 'GTEST1234567890abcdef1234567890abcdef12345678',
      sequence: '1',
      balances: [{ asset_type: 'native', balance: '1000.0000000' }]
    }),
    submitTransaction: vi.fn().mockResolvedValue({
      hash: 'test_transaction_hash',
      ledger: 12345,
      resultMetaXdr: ''
    })
  })),
  TransactionBuilder: vi.fn().mockImplementation(() => ({
    addOperation: vi.fn().mockReturnThis(),
    setTimeout: vi.fn().mockReturnThis(),
    build: vi.fn().mockReturnValue({
      toXDR: vi.fn().mockReturnValue('test_xdr'),
      fee: vi.fn().mockReturnValue('100')
    })
  })),
  Operation: {
    payment: vi.fn().mockReturnValue({ type: 'payment' })
  },
  Asset: {
    native: vi.fn().mockReturnValue({ asset_type: 'native' })
  },
  BASE_FEE: '100',
  Networks: {
    TESTNET: 'Test SDF Network ; September 2015'
  }
}))

describe('useFeeEstimation Hook', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('initializes with no estimate', () => {
    const { result } = renderHook(() => useFeeEstimation())

    expect(result.current.estimate).toBeNull()
    expect(result.current.isLoading).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it('estimates fees for valid amount', async () => {
    const { result } = renderHook(() => useFeeEstimation())

    await act(async () => {
      await result.current.estimateFee('10')
    })

    expect(result.current.isLoading).toBe(false)
    expect(result.current.estimate).toBeTruthy()
    expect(result.current.estimate?.totalFee).toBeGreaterThan(0)
    expect(result.current.estimate?.networkFee).toBeGreaterThan(0)
    expect(result.current.estimate?.operationFee).toBeGreaterThan(0)
  })

  it('handles invalid amount', async () => {
    const { result } = renderHook(() => useFeeEstimation())

    await act(async () => {
      await result.current.estimateFee('invalid')
    })

    expect(result.current.isLoading).toBe(false)
    expect(result.current.error).toBeTruthy()
    expect(result.current.estimate).toBeNull()
  })

  it('handles zero amount', async () => {
    const { result } = renderHook(() => useFeeEstimation())

    await act(async () => {
      await result.current.estimateFee('0')
    })

    expect(result.current.isLoading).toBe(false)
    expect(result.current.error).toBeTruthy()
    expect(result.current.estimate).toBeNull()
  })

  it('handles negative amount', async () => {
    const { result } = renderHook(() => useFeeEstimation())

    await act(async () => {
      await result.current.estimateFee('-10')
    })

    expect(result.current.isLoading).toBe(false)
    expect(result.current.error).toBeTruthy()
    expect(result.current.estimate).toBeNull()
  })

  it('calculates fees correctly for different amounts', async () => {
    const { result } = renderHook(() => useFeeEstimation())

    // Test small amount
    await act(async () => {
      await result.current.estimateFee('1')
    })

    const smallAmountFee = result.current.estimate?.totalFee || 0

    // Test large amount
    await act(async () => {
      await result.current.estimateFee('1000')
    })

    const largeAmountFee = result.current.estimate?.totalFee || 0

    // Fees should be reasonable (not zero, not excessive)
    expect(smallAmountFee).toBeGreaterThan(0)
    expect(smallAmountFee).toBeLessThan(1) // Less than 1 XLM for small amount
    expect(largeAmountFee).toBeGreaterThan(0)
    expect(largeAmountFee).toBeLessThan(10) // Less than 10 XLM for large amount
  })

  it('handles network errors during fee estimation', async () => {
    const { Server } = await import('@stellar/stellar-sdk')
    const mockServer = vi.mocked(Server)
    
    mockServer.mockImplementation(() => ({
      loadAccount: vi.fn().mockRejectedValue(new Error('Network error'))
    } as any))

    const { result } = renderHook(() => useFeeEstimation())

    await act(async () => {
      await result.current.estimateFee('10')
    })

    expect(result.current.isLoading).toBe(false)
    expect(result.current.error).toBeTruthy()
    expect(result.current.estimate).toBeNull()
  })

  it('sets loading state during estimation', async () => {
    const { result } = renderHook(() => useFeeEstimation())

    // Start estimation
    act(() => {
      result.current.estimateFee('10')
    })

    expect(result.current.isLoading).toBe(true)

    // Wait for completion
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0))
    })

    expect(result.current.isLoading).toBe(false)
  })

  it('cancels previous estimation when new one starts', async () => {
    const { result } = renderHook(() => useFeeEstimation())

    // Start first estimation
    act(() => {
      result.current.estimateFee('10')
    })

    expect(result.current.isLoading).toBe(true)

    // Start second estimation before first completes
    act(() => {
      result.current.estimateFee('20')
    })

    expect(result.current.isLoading).toBe(true)

    // Wait for completion
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0))
    })

    expect(result.current.isLoading).toBe(false)
    expect(result.current.estimate).toBeTruthy()
  })

  it('validates amount format', () => {
    const { result } = renderHook(() => useFeeEstimation())

    // Test various invalid formats
    const invalidAmounts = [
      '',
      'abc',
      '10.5.5',
      '--10',
      '++10',
      '10e10',
      'NaN',
      'Infinity'
    ]

    invalidAmounts.forEach(amount => {
      expect(() => {
        // This should be handled gracefully without throwing
        result.current.estimateFee(amount)
      }).not.toThrow()
    })
  })

  it('includes all fee components in estimate', async () => {
    const { result } = renderHook(() => useFeeEstimation())

    await act(async () => {
      await result.current.estimateFee('10')
    })

    const estimate = result.current.estimate
    expect(estimate).toBeTruthy()
    expect(estimate?.totalFee).toBeGreaterThan(0)
    expect(estimate?.networkFee).toBeGreaterThan(0)
    expect(estimate?.operationFee).toBeGreaterThan(0)

    // Total fee should be sum of components
    expect(estimate?.totalFee).toBeCloseTo(
      (estimate?.networkFee || 0) + (estimate?.operationFee || 0),
      7 // 7 decimal places for XLM precision
    )
  })

  it('handles very large amounts', async () => {
    const { result } = renderHook(() => useFeeEstimation())

    await act(async () => {
      await result.current.estimateFee('999999999')
    })

    expect(result.current.isLoading).toBe(false)
    expect(result.current.estimate).toBeTruthy()
    expect(result.current.estimate?.totalFee).toBeGreaterThan(0)
  })

  it('provides formatted fee strings', async () => {
    const { result } = renderHook(() => useFeeEstimation())

    await act(async () => {
      await result.current.estimateFee('10')
    })

    const estimate = result.current.estimate
    expect(estimate?.formattedNetworkFee).toMatch(/^\d+\.\d{7}\s+XLM$/)
    expect(estimate?.formattedOperationFee).toMatch(/^\d+\.\d{7}\s+XLM$/)
    expect(estimate?.formattedTotalFee).toMatch(/^\d+\.\d{7}\s+XLM$/)
  })
})

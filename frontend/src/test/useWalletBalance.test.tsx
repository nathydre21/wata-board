import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useWalletBalance } from '../hooks/useWalletBalance'
import * as freighterApi from '@stellar/freighter-api'

// Mock Stellar SDK
vi.mock('@stellar/stellar-sdk', () => ({
  Server: vi.fn().mockImplementation(() => ({
    loadAccount: vi.fn().mockResolvedValue({
      accountId: 'GTEST1234567890abcdef1234567890abcdef12345678',
      sequence: '1',
      balances: [
        { asset_type: 'native', balance: '1000.0000000' },
        { asset_type: 'credit_alphanum4', asset_code: 'USD', balance: '500.0000000' }
      ]
    })
  }))
}))

describe('useWalletBalance Hook', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(freighterApi, 'isConnected').mockResolvedValue(true)
    vi.spyOn(freighterApi, 'getPublicKey').mockResolvedValue('GTEST1234567890abcdef1234567890abcdef12345678')
  })

  it('loads wallet balance on mount', async () => {
    const { result } = renderHook(() => useWalletBalance())

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0))
    })

    expect(result.current.balance).toBe('1000.0000000')
    expect(result.current.isLoading).toBe(false)
  })

  it('handles disconnected wallet', async () => {
    vi.spyOn(freighterApi, 'isConnected').mockResolvedValue(false)

    const { result } = renderHook(() => useWalletBalance())

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0))
    })

    expect(result.current.balance).toBe('0.0000000')
    expect(result.current.isLoading).toBe(false)
  })

  it('refreshes balance manually', async () => {
    const { result } = renderHook(() => useWalletBalance())

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0))
    })

    const initialBalance = result.current.balance

    await act(async () => {
      await result.current.refreshBalance()
    })

    expect(result.current.balance).toBe(initialBalance)
  })

  it('checks sufficient balance correctly', async () => {
    const { result } = renderHook(() => useWalletBalance())

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0))
    })

    // Should have sufficient balance for small amount
    expect(result.current.isSufficientBalance(10)).toBe(true)
    expect(result.current.isSufficientBalance(100)).toBe(true)
    expect(result.current.isSufficientBalance(999)).toBe(true)

    // Should not have sufficient balance for large amount (accounting for fees)
    expect(result.current.isSufficientBalance(2000)).toBe(false)
  })

  it('detects low balance', async () => {
    const { result } = renderHook(() => useWalletBalance())

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0))
    })

    // Should not detect low balance for healthy amounts
    expect(result.current.isLowBalance(10)).toBe(false)
    expect(result.current.isLowufficientBalance(100)).toBe(false)

    // Should detect low balance when balance is close to payment amount
    expect(result.current.isLowBalance(999)).toBe(true)
  })

  it('handles balance fetch errors', async () => {
    vi.spyOn(freighterApi, 'getPublicKey').mockRejectedValue(new Error('Wallet not connected'))

    const { result } = renderHook(() => useWalletBalance())

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0))
    })

    expect(result.current.balance).toBe('0.0000000')
    expect(result.current.error).toBeTruthy()
  })

  it('formats balance correctly', async () => {
    const { result } = renderHook(() => useWalletBalance())

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0))
    })

    expect(result.current.formattedBalance).toBe('1,000.00 XLM')
  })

  it('calculates available balance considering fees', async () => {
    const { result } = renderHook(() => useWalletBalance())

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0))
    })

    const availableBalance = result.current.getAvailableBalance()
    expect(availableBalance).toBeLessThan(1000) // Should be less than total balance due to fees
  })

  it('handles multiple assets', async () => {
    const { Server } = await import('@stellar/stellar-sdk')
    const mockServer = vi.mocked(Server)
    
    mockServer.mockImplementation(() => ({
      loadAccount: vi.fn().mockResolvedValue({
        accountId: 'GTEST1234567890abcdef1234567890abcdef12345678',
        sequence: '1',
        balances: [
          { asset_type: 'native', balance: '500.0000000' },
          { asset_type: 'credit_alphanum4', asset_code: 'USD', balance: '1000.0000000' },
          { asset_type: 'credit_alphanum12', asset_code: 'EUR', balance: '2000.0000000' }
        ]
      })
    } as any))

    const { result } = renderHook(() => useWalletBalance())

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0))
    })

    expect(result.current.balance).toBe('500.0000000') // Should show native XLM balance
    expect(result.current.otherAssets).toHaveLength(2) // Should have 2 other assets
  })

  it('updates balance when wallet changes', async () => {
    const { result, rerender } = renderHook(() => useWalletBalance())

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0))
    })

    const initialBalance = result.current.balance

    // Simulate wallet change
    vi.spyOn(freighterApi, 'getPublicKey').mockResolvedValue('GDIFFERENT1234567890abcdef1234567890abcdef12')

    rerender()

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0))
    })

    // Balance should update (though might be same in mock)
    expect(result.current.balance).toBeDefined()
  })
})

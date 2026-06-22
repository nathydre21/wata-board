import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock wallet-bridge before importing the hook
vi.mock('../utils/wallet-bridge', () => ({
  isConnected: vi.fn().mockResolvedValue({ isConnected: true }),
  getPublicKey: vi.fn().mockResolvedValue('GTEST1234567890abcdef1234567890abcdef12345678'),
}))

// Mock walletBalance service
vi.mock('../services/walletBalance', () => ({
  walletBalanceService: {
    refreshBalance: vi.fn().mockResolvedValue({
      totalBalance: '1000.0000000',
      availableBalance: '999.9999000',
      lastUpdated: new Date(),
      assets: []
    }),
    getBalanceByAsset: vi.fn().mockReturnValue(null),
    formatBalance: vi.fn((balance: string) => `${parseFloat(balance).toFixed(2)} XLM`),
    isSufficientBalance: vi.fn().mockReturnValue(true),
    isLowBalance: vi.fn().mockReturnValue(false),
    subscribe: vi.fn().mockReturnValue(() => {}),
    startRealTimeUpdates: vi.fn(),
    stopRealTimeUpdates: vi.fn(),
  }
}))

import { useWalletBalance } from '../hooks/useWalletBalance'

describe('useWalletBalance Hook', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('initializes with default state', () => {
    const { result } = renderHook(() => useWalletBalance(false))

    expect(result.current.balance).toBeNull()
    expect(result.current.isConnected).toBe(false)
  })

  it('refreshes balance manually', async () => {
    const { result } = renderHook(() => useWalletBalance(false))

    await act(async () => {
      await result.current.refreshBalance()
    })

    expect(result.current.balance).not.toBeNull()
    expect(result.current.isLoading).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it('checks sufficient balance correctly', async () => {
    const { result } = renderHook(() => useWalletBalance(false))

    await act(async () => {
      await result.current.refreshBalance()
    })

    expect(result.current.isSufficientBalance(10)).toBe(true)
  })

  it('detects low balance', async () => {
    const { result } = renderHook(() => useWalletBalance(false))

    await act(async () => {
      await result.current.refreshBalance()
    })

    expect(result.current.isLowBalance).toBe(false)
  })

  it('handles balance fetch errors gracefully', async () => {
    const { walletBalanceService } = await import('../services/walletBalance')
    // Override for this test only - the useEffect's refreshBalance will consume this
    vi.mocked(walletBalanceService.refreshBalance).mockRejectedValueOnce(new Error('Wallet not connected'))

    const { result } = renderHook(() => useWalletBalance(false))

    // Wait for the useEffect's async refreshBalance to complete and error to propagate
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 100))
    })

    expect(result.current.balance).toBeNull()
    expect(result.current.error).toBeTruthy()
  })

  it('formats balance correctly', async () => {
    const { result } = renderHook(() => useWalletBalance(false))

    await act(async () => {
      await result.current.refreshBalance()
    })

    const formatted = result.current.formatBalance('1000.0000000')
    expect(formatted).toBe('1000.00 XLM')
  })

  it('gets balance by asset', async () => {
    const { result } = renderHook(() => useWalletBalance(false))

    await act(async () => {
      await result.current.refreshBalance()
    })

    const assetBalance = result.current.getBalanceByAsset('USD')
    expect(assetBalance).toBeNull() // mock returns null by default
  })
})

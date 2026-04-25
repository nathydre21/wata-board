import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import App from '../App'
import * as freighterApi from '@stellar/freighter-api'
import * as NepaClient from '../contracts'

// Mock the contracts
vi.mock('../contracts', () => ({
  networks: {
    testnet: {
      networkPassphrase: 'Test SDF Network ; September 2015',
      contractId: 'CDRRJ7IPYDL36YSK5ZQLBG3LICULETIBXX327AGJQNTWXNKY2UMDO4DA'
    }
  }
}))

// Mock hooks
vi.mock('../hooks/useRateLimit', () => ({
  usePaymentWithRateLimit: () => ({
    canMakeRequest: true,
    isProcessing: false,
    status: { remainingRequests: 5 },
    timeUntilReset: 0,
    queueLength: 0,
    paymentError: null
  })
}))

vi.mock('../hooks/useFeeEstimation', () => ({
  useFeeEstimation: () => ({
    estimate: {
      totalFee: 0.0001,
      networkFee: 0.0001,
      operationFee: 0.0001
    },
    isLoading: false,
    estimateFee: vi.fn()
  })
}))

vi.mock('../hooks/useWalletBalance', () => ({
  useWalletBalance: () => ({
    balance: '1000.0000000',
    refreshBalance: vi.fn(),
    isSufficientBalance: vi.fn().mockReturnValue(true),
    isLowBalance: false
  })
}))

vi.mock('../utils/network-config', () => ({
  getCurrentNetworkConfig: () => ({
    rpcUrl: 'https://soroban-testnet.stellar.org',
    networkPassphrase: 'Test SDF Network ; September 2015'
  })
}))

// Mock components
vi.mock('../components/NetworkSwitcher', () => ({
  NetworkSwitcher: ({ showLabel }: { showLabel: boolean }) => (
    <div data-testid="network-switcher">
      {showLabel && <span>Network:</span>}
      <button>Testnet</button>
    </div>
  )
}))

vi.mock('../components/WalletBalance', () => ({
  WalletBalance: ({ className }: { className?: string }) => (
    <div className={className} data-testid="wallet-balance">
      Balance: 1000.0000000 XLM
    </div>
  ),
  WalletBalanceCompact: ({ className }: { className?: string }) => (
    <div className={className} data-testid="wallet-balance-compact">
      1000.0000000 XLM
    </div>
  )
}))

// Mock pages
vi.mock('../pages/About', () => ({
  default: () => <div data-testid="about-page">About Page</div>
}))

vi.mock('../pages/Contact', () => ({
  default: () => <div data-testid="contact-page">Contact Page</div>
}))

vi.mock('../pages/Rate', () => ({
  default: () => <div data-testid="rate-page">Rate Page</div>
}))

const renderApp = () => {
  return render(
    <BrowserRouter>
      <App />
    </BrowserRouter>
  )
}

describe('App Component', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Mock freighter API
    vi.spyOn(freighterApi, 'isConnected').mockResolvedValue(true)
    vi.spyOn(freighterApi, 'requestAccess').mockResolvedValue('GTEST1234567890abcdef1234567890abcdef12345678')
    vi.spyOn(freighterApi, 'signTransaction').mockResolvedValue('signed_xdr_transaction')
  })

  it('renders navigation correctly', () => {
    renderApp()
    
    expect(screen.getByText('Wata-Board')).toBeInTheDocument()
    expect(screen.getByText('Pay Bill')).toBeInTheDocument()
    expect(screen.getByText('About')).toBeInTheDocument()
    expect(screen.getByText('Contact')).toBeInTheDocument()
    expect(screen.getByText('Rate Us')).toBeInTheDocument()
  })

  it('renders home page with payment form', () => {
    renderApp()
    
    expect(screen.getByText('Meter number')).toBeInTheDocument()
    expect(screen.getByText('Amount')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('e.g. METER-123')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Whole number')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Pay bill' })).toBeInTheDocument()
  })

  it('displays wallet balance', () => {
    renderApp()
    
    expect(screen.getByTestId('wallet-balance')).toBeInTheDocument()
    expect(screen.getByTestId('wallet-balance-compact')).toBeInTheDocument()
  })

  it('displays rate limit status', () => {
    renderApp()
    
    expect(screen.getByText('Rate Limit Status')).toBeInTheDocument()
    expect(screen.getByText('5/5 requests available')).toBeInTheDocument()
  })

  it('displays fee estimation', () => {
    renderApp()
    
    expect(screen.getByText('Transaction Fee Estimation')).toBeInTheDocument()
    expect(screen.getByText('Payment Amount:')).toBeInTheDocument()
    expect(screen.getByText('Estimated Network Fee:')).toBeInTheDocument()
    expect(screen.getByText('Total Cost:')).toBeInTheDocument()
  })

  it('validates meter ID input', async () => {
    renderApp()
    
    const payButton = screen.getByRole('button', { name: 'Pay bill' })
    fireEvent.click(payButton)
    
    await waitFor(() => {
      expect(screen.getByText('Please enter a meter number.')).toBeInTheDocument()
    })
  })

  it('validates amount input', async () => {
    renderApp()
    
    const meterInput = screen.getByPlaceholderText('e.g. METER-123')
    const payButton = screen.getByRole('button', { name: 'Pay bill' })
    
    fireEvent.change(meterInput, { target: { value: 'METER-001' } })
    fireEvent.click(payButton)
    
    await waitFor(() => {
      expect(screen.getByText('Please enter a valid amount greater than 0.')).toBeInTheDocument()
    })
  })

  it('rejects negative amounts', async () => {
    renderApp()
    
    const meterInput = screen.getByPlaceholderText('e.g. METER-123')
    const amountInput = screen.getByPlaceholderText('Whole number')
    const payButton = screen.getByRole('button', { name: 'Pay bill' })
    
    fireEvent.change(meterInput, { target: { value: 'METER-001' } })
    fireEvent.change(amountInput, { target: { value: '-5' } })
    fireEvent.click(payButton)
    
    await waitFor(() => {
      expect(screen.getByText('Please enter a valid amount greater than 0.')).toBeInTheDocument()
    })
  })

  it('rejects zero amount', async () => {
    renderApp()
    
    const meterInput = screen.getByPlaceholderText('e.g. METER-123')
    const amountInput = screen.getByPlaceholderText('Whole number')
    const payButton = screen.getByRole('button', { name: 'Pay bill' })
    
    fireEvent.change(meterInput, { target: { value: 'METER-001' } })
    fireEvent.change(amountInput, { target: { value: '0' } })
    fireEvent.click(payButton)
    
    await waitFor(() => {
      expect(screen.getByText('Please enter a valid amount greater than 0.')).toBeInTheDocument()
    })
  })

  it('rejects decimal amounts', async () => {
    renderApp()
    
    const meterInput = screen.getByPlaceholderText('e.g. METER-123')
    const amountInput = screen.getByPlaceholderText('Whole number')
    const payButton = screen.getByRole('button', { name: 'Pay bill' })
    
    fireEvent.change(meterInput, { target: { value: 'METER-001' } })
    fireEvent.change(amountInput, { target: { value: '10.5' } })
    fireEvent.click(payButton)
    
    await waitFor(() => {
      expect(screen.getByText('Amount must be a whole number.')).toBeInTheDocument()
    })
  })

  it('handles successful payment', async () => {
    renderApp()
    
    const meterInput = screen.getByPlaceholderText('e.g. METER-123')
    const amountInput = screen.getByPlaceholderText('Whole number')
    const payButton = screen.getByRole('button', { name: 'Pay bill' })
    
    fireEvent.change(meterInput, { target: { value: 'METER-001' } })
    fireEvent.change(amountInput, { target: { value: '10' } })
    fireEvent.click(payButton)
    
    await waitFor(() => {
      expect(screen.getByText(/Payment successful!/)).toBeInTheDocument()
    })
  })

  it('handles freighter wallet not connected', async () => {
    vi.spyOn(freighterApi, 'isConnected').mockResolvedValue(false)
    
    renderApp()
    
    const payButton = screen.getByRole('button', { name: 'Pay bill' })
    fireEvent.click(payButton)
    
    await waitFor(() => {
      expect(screen.getByText('Please install Freighter Wallet extension!')).toBeInTheDocument()
    })
  })

  it('handles payment errors', async () => {
    vi.spyOn(freighterApi, 'signTransaction').mockRejectedValue(new Error('Transaction failed'))
    
    renderApp()
    
    const meterInput = screen.getByPlaceholderText('e.g. METER-123')
    const amountInput = screen.getByPlaceholderText('Whole number')
    const payButton = screen.getByRole('button', { name: 'Pay bill' })
    
    fireEvent.change(meterInput, { target: { value: 'METER-001' } })
    fireEvent.change(amountInput, { target: { value: '10' } })
    fireEvent.click(payButton)
    
    await waitFor(() => {
      expect(screen.getByText('Payment failed: Transaction failed')).toBeInTheDocument()
    })
  })

  it('navigates to different pages', () => {
    renderApp()
    
    const aboutLink = screen.getByText('About')
    const contactLink = screen.getByText('Contact')
    const rateLink = screen.getByText('Rate Us')
    
    fireEvent.click(aboutLink)
    expect(screen.getByTestId('about-page')).toBeInTheDocument()
    
    fireEvent.click(contactLink)
    expect(screen.getByTestId('contact-page')).toBeInTheDocument()
    
    fireEvent.click(rateLink)
    expect(screen.getByTestId('rate-page')).toBeInTheDocument()
  })

  it('displays correct network indicator', () => {
    renderApp()
    
    expect(screen.getByText('TESTNET')).toBeInTheDocument()
  })
})

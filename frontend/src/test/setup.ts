import '@testing-library/jest-dom'

// Mock Stellar Freighter API
global.window = Object.create(window);
global.window.freighterApi = {
  isConnected: () => Promise.resolve(true),
  requestAccess: () => Promise.resolve('GTEST1234567890abcdef1234567890abcdef12345678'),
  signTransaction: (xdr: string) => Promise.resolve('signed_xdr_transaction'),
  getPublicKey: () => Promise.resolve('GTEST1234567890abcdef1234567890abcdef12345678'),
  getNetwork: () => Promise.resolve('TESTNET'),
  getUserInfo: () => Promise.resolve({ publicKey: 'GTEST1234567890abcdef1234567890abcdef12345678' })
}

// Mock fetch for API calls
global.fetch = vi.fn()

// Mock location
Object.defineProperty(window, 'location', {
  value: {
    pathname: '/',
    origin: 'http://localhost:3000'
  },
  writable: true
})

// Mock console methods for cleaner test output
global.console = {
  ...console,
  log: vi.fn(),
  warn: vi.fn(),
  error: vi.fn()
}

import { vi } from 'vitest'

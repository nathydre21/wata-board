/**
 * Test suite for payment events and automatic balance refresh
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { paymentEvents, type PaymentEvent } from '../utils/paymentEvents';
import { useWalletBalance } from '../hooks/useWalletBalance';

// Mock the wallet balance service
jest.mock('../services/walletBalance', () => ({
  walletBalanceService: {
    refreshBalance: jest.fn().mockResolvedValue({
      publicKey: 'test-public-key',
      balances: [{ assetCode: 'XLM', balance: '100', isNative: true }],
      nativeBalance: 100,
      lastUpdated: new Date(),
      network: 'testnet'
    }),
    subscribe: jest.fn().mockReturnValue(() => {}),
    startRealTimeUpdates: jest.fn(),
    stopRealTimeUpdates: jest.fn(),
    isLowBalance: jest.fn().mockReturnValue(false)
  }
}));

// Mock wallet bridge
jest.mock('../utils/wallet-bridge', () => ({
  isConnected: jest.fn().mockResolvedValue({ isConnected: true })
}));

describe('Payment Events System', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('PaymentEventSystem', () => {
    it('should emit and receive payment completed events', () => {
      const mockListener = jest.fn();
      const unsubscribe = paymentEvents.addListener(mockListener);

      const eventData = {
        transactionId: 'test-tx-123',
        amount: 50,
        meterId: 'METER-001',
        source: 'manual_payment' as const
      };

      act(() => {
        paymentEvents.emitPaymentCompleted(eventData);
      });

      expect(mockListener).toHaveBeenCalledWith({
        type: 'payment_completed',
        ...eventData,
        timestamp: expect.any(Date)
      });

      unsubscribe();
    });

    it('should emit and receive payment retry events', () => {
      const mockListener = jest.fn();
      const unsubscribe = paymentEvents.addListener(mockListener);

      const eventData = {
        transactionId: 'test-tx-456',
        amount: 25,
        meterId: 'METER-002'
      };

      act(() => {
        paymentEvents.emitPaymentRetry(eventData);
      });

      expect(mockListener).toHaveBeenCalledWith({
        type: 'payment_retry',
        ...eventData,
        timestamp: expect.any(Date),
        source: 'retry_payment'
      });

      unsubscribe();
    });

    it('should emit and receive payment failed events', () => {
      const mockListener = jest.fn();
      const unsubscribe = paymentEvents.addListener(mockListener);

      const eventData = {
        transactionId: 'test-tx-789',
        amount: 75,
        meterId: 'METER-003',
        source: 'qr_payment' as const
      };

      act(() => {
        paymentEvents.emitPaymentFailed(eventData);
      });

      expect(mockListener).toHaveBeenCalledWith({
        type: 'payment_failed',
        ...eventData,
        timestamp: expect.any(Date)
      });

      unsubscribe();
    });

    it('should handle multiple listeners', () => {
      const mockListener1 = jest.fn();
      const mockListener2 = jest.fn();
      
      const unsubscribe1 = paymentEvents.addListener(mockListener1);
      const unsubscribe2 = paymentEvents.addListener(mockListener2);

      act(() => {
        paymentEvents.emitPaymentCompleted({
          transactionId: 'test-tx-multi',
          amount: 100,
          meterId: 'METER-MULTI',
          source: 'manual_payment'
        });
      });

      expect(mockListener1).toHaveBeenCalled();
      expect(mockListener2).toHaveBeenCalled();

      unsubscribe1();
      unsubscribe2();
    });
  });

  describe('useWalletBalance integration', () => {
    it('should trigger balance refresh on payment completed event', async () => {
      const { refreshBalance } = renderHook(() => useWalletBalance()).result.current;

      // Wait for initial setup
      await waitFor(() => {
        expect(refreshBalance).toBeDefined();
      });

      // Emit payment completed event
      act(() => {
        paymentEvents.emitPaymentCompleted({
          transactionId: 'test-tx-refresh',
          amount: 50,
          meterId: 'METER-REFRESH',
          source: 'manual_payment'
        });
      });

      // Wait for the delayed refresh (1.5 seconds)
      await waitFor(
        () => {
          expect(refreshBalance).toHaveBeenCalled();
        },
        { timeout: 2000 }
      );
    });

    it('should trigger balance refresh on payment retry event', async () => {
      const { refreshBalance } = renderHook(() => useWalletBalance()).result.current;

      // Wait for initial setup
      await waitFor(() => {
        expect(refreshBalance).toBeDefined();
      });

      // Emit payment retry event
      act(() => {
        paymentEvents.emitPaymentRetry({
          transactionId: 'test-tx-retry',
          amount: 30,
          meterId: 'METER-RETRY'
        });
      });

      // Wait for the delayed refresh (1 second)
      await waitFor(
        () => {
          expect(refreshBalance).toHaveBeenCalled();
        },
        { timeout: 1500 }
      );
    });

    it('should not trigger balance refresh on payment failed event', async () => {
      const { refreshBalance } = renderHook(() => useWalletBalance()).result.current;

      // Wait for initial setup
      await waitFor(() => {
        expect(refreshBalance).toBeDefined();
      });

      // Clear any previous calls
      jest.clearAllMocks();

      // Emit payment failed event
      act(() => {
        paymentEvents.emitPaymentFailed({
          transactionId: 'test-tx-failed',
          amount: 25,
          meterId: 'METER-FAILED',
          source: 'qr_payment'
        });
      });

      // Wait a bit to ensure no refresh is called
      await new Promise(resolve => setTimeout(resolve, 500));

      expect(refreshBalance).not.toHaveBeenCalled();
    });
  });

  describe('DOM Events', () => {
    it('should also emit DOM events for backward compatibility', () => {
      const mockDOMListener = jest.fn();
      
      // Add DOM event listener
      window.addEventListener('paymentEvent', mockDOMListener);

      const eventData = {
        transactionId: 'test-tx-dom',
        amount: 60,
        meterId: 'METER-DOM',
        source: 'manual_payment' as const
      };

      act(() => {
        paymentEvents.emitPaymentCompleted(eventData);
      });

      expect(mockDOMListener).toHaveBeenCalledWith(
        expect.objectContaining({
          detail: {
            type: 'payment_completed',
            ...eventData,
            timestamp: expect.any(Date)
          }
        })
      );

      window.removeEventListener('paymentEvent', mockDOMListener);
    });
  });
});

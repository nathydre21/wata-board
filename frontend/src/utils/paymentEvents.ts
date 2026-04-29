/**
 * Global payment event system for coordinating balance updates across the application
 */

export interface PaymentEvent {
  type: 'payment_completed' | 'payment_failed' | 'payment_retry';
  transactionId?: string;
  amount?: number;
  meterId?: string;
  timestamp: Date;
  source: 'manual_payment' | 'qr_payment' | 'scheduled_payment' | 'retry_payment';
}

export interface PaymentEventListener {
  (event: PaymentEvent): void;
}

class PaymentEventSystem {
  private listeners: Set<PaymentEventListener> = new Set();
  private static instance: PaymentEventSystem;

  static getInstance(): PaymentEventSystem {
    if (!PaymentEventSystem.instance) {
      PaymentEventSystem.instance = new PaymentEventSystem();
    }
    return PaymentEventSystem.instance;
  }

  /**
   * Subscribe to payment events
   */
  addListener(listener: PaymentEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Emit a payment event
   */
  emit(event: PaymentEvent): void {
    console.log('[PaymentEventSystem] Emitting event:', event);
    this.listeners.forEach(listener => {
      try {
        listener(event);
      } catch (error) {
        console.error('[PaymentEventSystem] Error in event listener:', error);
      }
    });

    // Also emit as DOM event for components that prefer that pattern
    window.dispatchEvent(new CustomEvent('paymentEvent', {
      detail: event
    }));
  }

  /**
   * Convenience method for successful payments
   */
  emitPaymentCompleted(params: {
    transactionId: string;
    amount?: number;
    meterId?: string;
    source: PaymentEvent['source'];
  }): void {
    this.emit({
      type: 'payment_completed',
      transactionId: params.transactionId,
      amount: params.amount,
      meterId: params.meterId,
      timestamp: new Date(),
      source: params.source
    });
  }

  /**
   * Convenience method for failed payments
   */
  emitPaymentFailed(params: {
    transactionId?: string;
    amount?: number;
    meterId?: string;
    source: PaymentEvent['source'];
  }): void {
    this.emit({
      type: 'payment_failed',
      transactionId: params.transactionId,
      amount: params.amount,
      meterId: params.meterId,
      timestamp: new Date(),
      source: params.source
    });
  }

  /**
   * Convenience method for payment retries
   */
  emitPaymentRetry(params: {
    transactionId?: string;
    amount?: number;
    meterId?: string;
  }): void {
    this.emit({
      type: 'payment_retry',
      transactionId: params.transactionId,
      amount: params.amount,
      meterId: params.meterId,
      timestamp: new Date(),
      source: 'retry_payment'
    });
  }
}

export const paymentEvents = PaymentEventSystem.getInstance();

/**
 * Hook for components to listen to payment events
 */
export const usePaymentEvents = (listener: PaymentEventListener) => {
  // This would typically be used in React components with useEffect
  // For now, just return the add/remove functionality
  return {
    subscribe: () => paymentEvents.addListener(listener),
    unsubscribe: () => {
      // The listener function itself handles removal when called
    }
  };
};

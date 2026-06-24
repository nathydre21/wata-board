import React, { useState } from 'react';
import { useRealtimeTransactions } from '../hooks/useRealtimeTransactions';
import { TransactionStatus } from './TransactionStatus';
import { TransactionConfirmation } from './TransactionConfirmation';

interface PaymentWithTrackingProps {
  onPaymentComplete?: (transactionId: string) => void;
}

export const PaymentWithTracking: React.FC<PaymentWithTrackingProps> = ({ onPaymentComplete }) => {
  const [transactionId, setTransactionId] = useState<string | undefined>(undefined);
  const [showConfirmation, setShowConfirmation] = useState(false);

  const {
    connectionState,
    transactionState,
    error,
    lastUpdated,
    blockNumber,
    confirmations,
    explorerUrl
  } = useRealtimeTransactions(transactionId);

  const handlePaymentSubmit = async (meterId: string, amount: number, userId: string) => {
    try {
      const response = await fetch('/api/payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ meter_id: meterId, amount, userId })
      });

      const result = await response.json();
      
      if (result.success && result.transactionId) {
        setTransactionId(result.transactionId);
        setShowConfirmation(true);
      }
    } catch (err) {
      console.error('Payment failed:', err);
    }
  };

  React.useEffect(() => {
    if (transactionState === 'confirmed' && transactionId) {
      onPaymentComplete?.(transactionId);
    }
  }, [transactionState, transactionId, onPaymentComplete]);

  return (
    <div>
      {transactionId && (
        <>
          <TransactionStatus
            transactionId={transactionId}
            connectionState={connectionState}
            transactionState={transactionState}
            lastUpdated={lastUpdated}
            error={error}
            blockNumber={blockNumber}
            confirmations={confirmations}
            explorerUrl={explorerUrl}
          />
          
          {showConfirmation && (
            <TransactionConfirmation
              transactionId={transactionId}
              transactionState={transactionState}
              explorerUrl={explorerUrl}
              onClose={() => setShowConfirmation(false)}
            />
          )}
        </>
      )}
    </div>
  );
};

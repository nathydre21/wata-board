import React, { useEffect, useState } from 'react';
import type { TransactionState } from '../hooks/useRealtimeTransactions';

interface TransactionConfirmationProps {
  transactionId: string;
  transactionState: TransactionState;
  explorerUrl?: string;
  onClose?: () => void;
}

export const TransactionConfirmation: React.FC<TransactionConfirmationProps> = ({
  transactionId,
  transactionState,
  explorerUrl,
  onClose
}) => {
  const [show, setShow] = useState(false);
  const [previousState, setPreviousState] = useState<TransactionState>(transactionState);

  useEffect(() => {
    if (transactionState !== previousState) {
      if (transactionState === 'confirmed' || transactionState === 'failed') {
        setShow(true);
      }
      setPreviousState(transactionState);
    }
  }, [transactionState, previousState]);

  const handleClose = () => {
    setShow(false);
    onClose?.();
  };

  if (!show) return null;

  const isSuccess = transactionState === 'confirmed';
  const isFailed = transactionState === 'failed';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="relative max-w-md w-full rounded-3xl border bg-slate-900 p-6 shadow-2xl animate-in slide-in-from-bottom-4 duration-500"
           style={{
             borderColor: isSuccess ? 'rgb(16 185 129 / 0.3)' : isFailed ? 'rgb(239 68 68 / 0.3)' : 'rgb(148 163 184 / 0.3)'
           }}>
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-200 transition-colors"
          aria-label="Close"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <div className="flex flex-col items-center text-center">
          {isSuccess && (
            <>
              <div className="h-16 w-16 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400 mb-4">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-emerald-400 mb-2">Transaction Confirmed!</h2>
              <p className="text-slate-300 mb-6">Your payment has been successfully processed on the blockchain.</p>
            </>
          )}

          {isFailed && (
            <>
              <div className="h-16 w-16 rounded-full bg-red-500/20 flex items-center justify-center text-red-400 mb-4">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-red-400 mb-2">Transaction Failed</h2>
              <p className="text-slate-300 mb-6">Your payment could not be processed. Please try again.</p>
            </>
          )}

          <div className="w-full rounded-2xl bg-slate-950/80 p-4 mb-6">
            <p className="text-xs uppercase tracking-[0.24em] text-slate-500 mb-2">Transaction Hash</p>
            <p className="text-sm text-slate-200 break-all font-mono">{transactionId}</p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 w-full">
            {explorerUrl && (
              <a
                href={explorerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-sky-500/10 border border-sky-500/30 px-4 py-3 text-sm font-medium text-sky-300 hover:bg-sky-500/20 transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
                View on Explorer
              </a>
            )}
            <button
              onClick={handleClose}
              className="flex-1 rounded-xl bg-slate-700 hover:bg-slate-600 px-4 py-3 text-sm font-medium text-slate-100 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

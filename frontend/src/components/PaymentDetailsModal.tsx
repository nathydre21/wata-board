import React, { useState } from 'react';
import type { ScheduledPayment } from '../types/scheduling';
import { ReceiptVoucher } from './ReceiptVoucher';
import { receiptService } from '../services/receiptService';
import { LoadingSpinner } from './LoadingSpinner';

interface PaymentDetailsModalProps {
  payment: ScheduledPayment;
  meterId?: string;
  onClose: () => void;
  onRetry?: () => void;
}

export function PaymentDetailsModal({ 
  payment, 
  meterId, 
  onClose, 
  onRetry 
}: PaymentDetailsModalProps) {
  const [showReceipt, setShowReceipt] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);

  const receipt = receiptService.getReceiptByPaymentId(payment.id);

  const handleRetry = async () => {
    setIsRetrying(true);
    try {
      onRetry?.();
    } finally {
      setIsRetrying(false);
    }
  };

  const handleDownloadReceipt = async () => {
    if (receipt) {
      try {
        await receiptService.downloadReceiptPDF(receipt);
      } catch (error) {
        console.error('Failed to download receipt:', error);
      }
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return (
          <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center">
            <svg className="w-6 h-6 text-green-400" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
          </div>
        );
      case 'failed':
        return (
          <div className="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center">
            <svg className="w-6 h-6 text-red-400" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
          </div>
        );
      case 'pending':
      case 'scheduled':
        return (
          <div className="w-12 h-12 rounded-full bg-amber-500/20 flex items-center justify-center">
            <svg className="w-6 h-6 text-amber-400" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v3.586L7.707 9.293a1 1 0 00-1.414 1.414l3 3a1 1 0 001.414 0l3-3a1 1 0 00-1.414-1.414L11 10.586V7z" clipRule="evenodd" />
            </svg>
          </div>
        );
      default:
        return (
          <div className="w-12 h-12 rounded-full bg-slate-500/20 flex items-center justify-center">
            <svg className="w-6 h-6 text-slate-400" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 5v8a2 2 0 01-2 2h-5l-5 4v-4H4a2 2 0 01-2-2V5a2 2 0 012-2h12a2 2 0 012 2z" clipRule="evenodd" />
            </svg>
          </div>
        );
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'text-green-400';
      case 'failed':
        return 'text-red-400';
      case 'pending':
      case 'scheduled':
        return 'text-amber-400';
      case 'processing':
        return 'text-blue-400';
      default:
        return 'text-slate-400';
    }
  };

  if (showReceipt && receipt) {
    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
        <div className="bg-slate-900 rounded-2xl max-h-[90vh] overflow-y-auto w-full max-w-2xl">
          <div className="flex items-center justify-between sticky top-0 bg-slate-900 border-b border-slate-800 p-4 z-10">
            <h3 className="text-lg font-semibold text-slate-100">Payment Receipt</h3>
            <button
              onClick={() => setShowReceipt(false)}
              className="p-1 hover:bg-slate-800 rounded-lg transition-colors"
            >
              <svg className="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="p-6">
            <ReceiptVoucher 
              receipt={receipt}
              onClose={() => setShowReceipt(false)}
              onDownload={handleDownloadReceipt}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50" aria-busy={isRetrying}>
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div className="flex items-start gap-4">
            {getStatusIcon(payment.status)}
            <div>
              <h2 className="text-2xl font-bold text-slate-100 mb-1">
                Payment {payment.amount} XLM
              </h2>
              <p className={`text-sm font-semibold uppercase ${getStatusColor(payment.status)}`}>
                {payment.status}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-800 rounded-lg transition-colors"
          >
            <svg className="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Details */}
        <div className="space-y-4 mb-6">
          <div className="bg-slate-800/50 rounded-lg p-4">
            <p className="text-slate-400 text-sm font-semibold uppercase mb-1">Payment ID</p>
            <p className="text-slate-100 font-mono break-all">{payment.id}</p>
          </div>

          {meterId && (
            <div className="bg-slate-800/50 rounded-lg p-4">
              <p className="text-slate-400 text-sm font-semibold uppercase mb-1">Meter ID</p>
              <p className="text-slate-100">{meterId}</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-slate-800/50 rounded-lg p-4">
              <p className="text-slate-400 text-sm font-semibold uppercase mb-1">Scheduled Date</p>
              <p className="text-slate-100">
                {new Date(payment.scheduledDate).toLocaleDateString()}
              </p>
              <p className="text-slate-400 text-xs">
                {new Date(payment.scheduledDate).toLocaleTimeString()}
              </p>
            </div>

            {payment.actualPaymentDate && (
              <div className="bg-slate-800/50 rounded-lg p-4">
                <p className="text-slate-400 text-sm font-semibold uppercase mb-1">Actual Date</p>
                <p className="text-slate-100">
                  {new Date(payment.actualPaymentDate).toLocaleDateString()}
                </p>
                <p className="text-slate-400 text-xs">
                  {new Date(payment.actualPaymentDate).toLocaleTimeString()}
                </p>
              </div>
            )}
          </div>

          {payment.transactionId && (
            <div className="bg-slate-800/50 rounded-lg p-4">
              <p className="text-slate-400 text-sm font-semibold uppercase mb-1">Transaction Hash</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-slate-300 font-mono text-xs break-all">
                  {payment.transactionId}
                </code>
                <button
                  onClick={() => navigator.clipboard.writeText(payment.transactionId || '')}
                  className="px-2 py-1 bg-slate-700 hover:bg-slate-600 rounded text-slate-300 text-xs transition-colors"
                >
                  Copy
                </button>
              </div>
            </div>
          )}

          {payment.errorMessage && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4">
              <p className="text-slate-400 text-sm font-semibold uppercase mb-1">Error</p>
              <p className="text-red-400">{payment.errorMessage}</p>
            </div>
          )}

          <div className="bg-slate-800/50 rounded-lg p-4">
            <p className="text-slate-400 text-sm font-semibold uppercase mb-1">Retry Count</p>
            <p className="text-slate-100">{payment.retryCount} attempt{payment.retryCount !== 1 ? 's' : ''}</p>
          </div>
        </div>

        {/* Actions */}
        <div className="space-y-3">
          {payment.status === 'completed' && receipt && (
            <button
              onClick={() => setShowReceipt(true)}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              View Receipt
            </button>
          )}

          {payment.status === 'failed' && onRetry && (
            <button
              onClick={handleRetry}
              disabled={isRetrying}
              className="w-full bg-amber-600 hover:bg-amber-700 disabled:bg-amber-600/50 text-white font-semibold py-2 rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              {isRetrying ? (
                <>
                  <LoadingSpinner size="sm" label="Retrying payment" />
                  <span>Retry Payment</span>
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Retry Payment
                </>
              )}
            </button>
          )}

          <button
            onClick={onClose}
            disabled={isRetrying}
            className="w-full bg-slate-800 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed text-slate-300 font-semibold py-2 rounded-lg transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

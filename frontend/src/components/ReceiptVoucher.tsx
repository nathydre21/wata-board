import React, { useState } from 'react';
import type { Receipt } from '../types/receipt';

interface ReceiptVoucherProps {
  receipt: Receipt;
  onClose?: () => void;
  onDownload?: () => void;
}

export function ReceiptVoucher({ receipt, onClose, onDownload }: ReceiptVoucherProps) {
  const [isDownloading, setIsDownloading] = useState(false);

  const handleDownload = async () => {
    setIsDownloading(true);
    try {
      onDownload?.();
    } finally {
      setIsDownloading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-500/10 text-green-400 border-green-500/20';
      case 'pending':
        return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
      case 'generated':
        return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
      default:
        return 'bg-slate-500/10 text-slate-400 border-slate-500/20';
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 max-w-2xl mx-auto">
      {/* Header */}
      <div className="text-center border-b border-slate-700 pb-6 mb-6">
        <h2 className="text-3xl font-bold text-slate-100 mb-2">Payment Receipt</h2>
        <p className="text-slate-400 font-mono text-sm">Receipt #{receipt.receiptNumber}</p>
      </div>

      {/* Main Amount */}
      <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl p-8 mb-8 border border-slate-700">
        <p className="text-slate-400 text-sm font-medium mb-2">PAYMENT AMOUNT</p>
        <div className="flex items-baseline justify-between">
          <div className="text-5xl font-bold text-slate-100">
            {receipt.amount}{' '}
            <span className="text-2xl text-slate-400">{receipt.currency}</span>
          </div>
          <span className={`px-4 py-2 rounded-lg text-xs font-bold uppercase border ${getStatusColor(receipt.status)}`}>
            {receipt.status}
          </span>
        </div>
      </div>

      {/* Transaction Details */}
      <div className="space-y-6 mb-8">
        <div className="grid grid-cols-2 gap-6">
          <div className="bg-slate-800/50 rounded-lg p-4">
            <p className="text-slate-400 text-xs font-semibold uppercase tracking-wide mb-2">Date & Time</p>
            <p className="text-slate-100 font-medium">
              {new Date(receipt.date).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
              })}
            </p>
            <p className="text-slate-400 text-sm">
              {new Date(receipt.date).toLocaleTimeString()}
            </p>
          </div>

          <div className="bg-slate-800/50 rounded-lg p-4">
            <p className="text-slate-400 text-xs font-semibold uppercase tracking-wide mb-2">Meter ID</p>
            <p className="text-slate-100 font-mono font-medium text-lg">{receipt.meterId}</p>
          </div>
        </div>

        {/* Transaction Hash */}
        {receipt.transactionHash && (
          <div className="bg-slate-800/50 rounded-lg p-4">
            <p className="text-slate-400 text-xs font-semibold uppercase tracking-wide mb-2">Blockchain Transaction</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-slate-300 font-mono text-sm break-all bg-slate-900 rounded px-3 py-2">
                {receipt.transactionHash}
              </code>
              <button
                onClick={() => navigator.clipboard.writeText(receipt.transactionHash || '')}
                className="px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded text-slate-300 text-sm font-medium transition-colors"
                title="Copy transaction hash"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </button>
            </div>
          </div>
        )}

        {/* Bill Period */}
        {receipt.billPeriod && (
          <div className="bg-slate-800/50 rounded-lg p-4">
            <p className="text-slate-400 text-xs font-semibold uppercase tracking-wide mb-2">Billing Period</p>
            <p className="text-slate-100">
              {new Date(receipt.billPeriod.start).toLocaleDateString()} -{' '}
              {new Date(receipt.billPeriod.end).toLocaleDateString()}
            </p>
          </div>
        )}
      </div>

      {/* QR Code */}
      {receipt.qrCode && (
        <div className="bg-slate-800/50 rounded-lg p-6 mb-8 flex flex-col items-center">
          <p className="text-slate-400 text-sm font-semibold uppercase tracking-wide mb-4">Verify Receipt</p>
          <img
            src={receipt.qrCode}
            alt="Receipt QR Code"
            className="w-48 h-48 border-2 border-slate-700 rounded-lg p-2 bg-white"
          />
          <p className="text-slate-400 text-xs mt-3">Scan to verify receipt authenticity</p>
        </div>
      )}

      {/* Notes */}
      {receipt.notes && (
        <div className="bg-slate-800/50 rounded-lg p-4 mb-8">
          <p className="text-slate-400 text-xs font-semibold uppercase tracking-wide mb-2">Notes</p>
          <p className="text-slate-300 text-sm">{receipt.notes}</p>
        </div>
      )}

      {/* Footer Info */}
      <div className="border-t border-slate-700 pt-6 text-center text-slate-400 text-xs mb-6">
        <p>Generated on {new Date().toLocaleDateString()}</p>
        <p className="mt-1">Thank you for using {receipt.providerName}</p>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-3">
        <button
          onClick={handleDownload}
          disabled={isDownloading}
          className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-600/50 text-white font-semibold py-3 rounded-lg transition-colors flex items-center justify-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19v-7m0 0V5m0 7l-4-4m4 4l4-4" />
          </svg>
          {isDownloading ? 'Downloading...' : 'Download PDF'}
        </button>

        <button
          onClick={() => {
            const htmlContent = `
              <html>
                <head><title>Receipt ${receipt.receiptNumber}</title></head>
                <body>${getReceiptHTML(receipt)}</body>
              </html>
            `;
            const printWindow = window.open('', '', 'width=800,height=600');
            if (printWindow) {
              printWindow.document.write(htmlContent);
              printWindow.document.close();
              printWindow.print();
            }
          }}
          className="flex-1 bg-slate-700 hover:bg-slate-600 text-slate-100 font-semibold py-3 rounded-lg transition-colors flex items-center justify-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m4 0a2 2 0 104 0m-6-4h12a2 2 0 012 2v4a2 2 0 01-2 2H7a2 2 0 01-2-2v-4a2 2 0 012-2z" />
          </svg>
          Print
        </button>

        {onClose && (
          <button
            onClick={onClose}
            className="px-6 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold py-3 rounded-lg transition-colors"
          >
            Close
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Helper function to generate receipt HTML for printing
 */
function getReceiptHTML(receipt: Receipt): string {
  return `
    <style>
      body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 20px; background: white; }
      .receipt { max-width: 600px; margin: 0 auto; }
      .header { text-align: center; border-bottom: 2px solid #333; padding-bottom: 20px; margin-bottom: 30px; }
      .receipt-number { font-size: 14px; color: #666; font-family: monospace; }
      .section { margin-bottom: 25px; }
      .section-title { font-size: 12px; font-weight: bold; color: #333; text-transform: uppercase; border-bottom: 1px solid #ddd; padding-bottom: 5px; margin-bottom: 10px; }
      .detail-row { display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 14px; }
      .amount-box { background: #f5f5f5; padding: 20px; border-radius: 5px; text-align: center; margin-bottom: 30px; }
      .amount { font-size: 36px; font-weight: bold; margin: 10px 0; }
      .footer { border-top: 1px solid #ddd; padding-top: 20px; text-align: center; font-size: 12px; color: #999; margin-top: 30px; }
    </style>
    <div class="receipt">
      <div class="header">
        <h2>${receipt.providerName}</h2>
        <h3>Payment Receipt</h3>
        <div class="receipt-number">Receipt #${receipt.receiptNumber}</div>
      </div>
      <div class="amount-box">
        <div style="color: #666;">Payment Amount</div>
        <div class="amount">${receipt.amount} ${receipt.currency}</div>
        <div><strong>${receipt.status.toUpperCase()}</strong></div>
      </div>
      <div class="section">
        <div class="section-title">Transaction Details</div>
        <div class="detail-row">
          <span>Date:</span>
          <span>${new Date(receipt.date).toLocaleDateString()} ${new Date(receipt.date).toLocaleTimeString()}</span>
        </div>
        <div class="detail-row">
          <span>Meter ID:</span>
          <span>${receipt.meterId}</span>
        </div>
        ${receipt.transactionHash ? `<div class="detail-row">
          <span>Tx Hash:</span>
          <span style="font-family: monospace; font-size: 12px;">${receipt.transactionHash.substring(0, 20)}...</span>
        </div>` : ''}
      </div>
      <div class="footer">
        <p>Generated on ${new Date().toLocaleDateString()}</p>
        <p>Thank you for using ${receipt.providerName}</p>
      </div>
    </div>
  `;
}

import React from 'react';
import { useRealtimeTransactions } from '../hooks/useRealtimeTransactions';
import { TransactionStatus } from './TransactionStatus';

export interface TransactionDetails {
  hash: string;
  meterId: string;
  amount: number;
  timestamp: Date;
  network: 'testnet' | 'mainnet';
  explorerUrl: string;
  memo?: string;
}

interface TransactionSuccessProps {
  details: TransactionDetails;
  onReset: () => void;
  showLiveTracking?: boolean;
}

export const TransactionSuccess: React.FC<TransactionSuccessProps> = ({ 
  details, 
  onReset,
  showLiveTracking = true 
}) => {
  const fullExplorerUrl = `${details.explorerUrl}${details.hash}`;

  const {
    connectionState,
    transactionState,
    error,
    lastUpdated,
    blockNumber,
    confirmations,
    explorerUrl: liveExplorerUrl
  } = useRealtimeTransactions(showLiveTracking ? details.hash : undefined);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(details.hash);
    alert('Transaction hash copied to clipboard!');
  };

  const downloadReceipt = () => {
    window.print();
  };

  return (
    <div className="mt-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {showLiveTracking && details.hash && (
        <div className="mb-6">
          <TransactionStatus
            transactionId={details.hash}
            connectionState={connectionState}
            transactionState={transactionState}
            lastUpdated={lastUpdated}
            error={error}
            blockNumber={blockNumber}
            confirmations={confirmations}
            explorerUrl={liveExplorerUrl || fullExplorerUrl}
          />
        </div>
      )}

      <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-6 sm:p-8 shadow-xl shadow-emerald-500/5 print:border-none print:shadow-none print:bg-white print:text-black">
        <div className="flex flex-col items-center text-center">
          <div className="h-16 w-16 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400 mb-4 print:hidden">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          
          <h2 className="text-2xl font-bold text-slate-100 print:text-black print:text-3xl">Payment Successful</h2>
          <p className="text-slate-400 mt-1 print:text-slate-600">Your utility bill has been paid on the blockchain.</p>
        </div>

        <div className="mt-8 space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="space-y-1">
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 print:text-slate-500">Meter Number</div>
              <div className="text-lg font-medium text-slate-200 print:text-black">{details.meterId}</div>
            </div>
            <div className="space-y-1">
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 print:text-slate-500">Amount Paid</div>
              <div className="text-lg font-medium text-sky-400 print:text-black">{details.amount} XLM</div>
            </div>
            <div className="space-y-1">
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 print:text-slate-500">Date & Time</div>
              <div className="text-sm text-slate-300 print:text-black">
                {details.timestamp.toLocaleString()}
              </div>
            </div>
            <div className="space-y-1">
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 print:text-slate-500">Network</div>
              <div className="flex items-center gap-2 mt-1">
                <span className={`h-2 w-2 rounded-full ${details.network === 'mainnet' ? 'bg-orange-500' : 'bg-sky-500'}`}></span>
                <span className="text-sm text-slate-300 print:text-black uppercase">{details.network}</span>
              </div>
            </div>
            {details.memo && (
              <div className="space-y-1 sm:col-span-2">
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 print:text-slate-500">Memo</div>
                <div className="text-sm text-slate-300 print:text-black italic">"{details.memo}"</div>
              </div>
            )}
          </div>

          <div className="pt-6 border-t border-slate-800 print:border-slate-200">
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2 print:text-slate-500">Transaction Hash</div>
            <div className="flex items-center gap-2 bg-slate-950/50 p-3 rounded-xl border border-slate-800 print:bg-slate-100 print:border-slate-200">
              <code className="text-xs text-slate-300 break-all flex-1 print:text-black">
                {details.hash}
              </code>
              <button 
                onClick={copyToClipboard}
                className="p-2 hover:bg-slate-800 rounded-lg transition-colors text-slate-400 hover:text-slate-100 print:hidden"
                title="Copy to clipboard"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </button>
            </div>
            <div className="mt-3 flex justify-end print:hidden">
              <a 
                href={fullExplorerUrl} 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-xs text-sky-400 hover:text-sky-300 flex items-center gap-1 transition-colors"
                id="explorer-link"
              >
                View on StellarExpert
                <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            </div>
          </div>
        </div>

        <div className="mt-8 flex flex-col sm:flex-row gap-4 print:hidden">
          <button
            onClick={onReset}
            className="flex-1 h-12 inline-flex items-center justify-center rounded-xl px-6 text-sm font-semibold text-white bg-slate-800 hover:bg-slate-700 transition"
          >
            Make Another Payment
          </button>
          <button
            onClick={downloadReceipt}
            className="flex-1 h-12 inline-flex items-center justify-center rounded-xl px-6 text-sm font-semibold text-white bg-sky-500 hover:bg-sky-400 shadow-lg shadow-sky-500/20 transition"
          >
            Download Receipt
          </button>
        </div>
      </div>
    </div>
  );
};

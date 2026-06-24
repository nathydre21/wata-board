import React from 'react';
import type { TransactionState } from '../hooks/useRealtimeTransactions';
import type { ConnectionState } from '../hooks/useRealtimeTransactions';

interface TransactionStatusProps {
  transactionId?: string;
  connectionState: ConnectionState;
  transactionState: TransactionState;
  lastUpdated?: string;
  error?: string;
  blockNumber?: number;
  confirmations?: number;
  explorerUrl?: string;
}

const statusLabel = {
  pending: 'Pending',
  confirming: 'Confirming',
  confirmed: 'Confirmed',
  failed: 'Failed',
  unknown: 'Unknown'
};

const badgeStyles: Record<TransactionState, string> = {
  pending: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  confirming: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  confirmed: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  failed: 'bg-red-500/15 text-red-300 border-red-500/30',
  unknown: 'bg-slate-700/15 text-slate-300 border-slate-700/30'
};

const connectionLabel: Record<ConnectionState, string> = {
  connecting: 'Connecting…',
  connected: 'Live updates active',
  disconnected: 'Live updates disconnected',
  fallback: 'Using polling for status'
};

export const TransactionStatus: React.FC<TransactionStatusProps> = ({
  transactionId,
  connectionState,
  transactionState,
  lastUpdated,
  error,
  blockNumber,
  confirmations,
  explorerUrl
}) => {
  const formatTimestamp = (timestamp?: string) => {
    if (!timestamp) return '—';
    try {
      return new Date(timestamp).toLocaleString();
    } catch {
      return timestamp;
    }
  };

  return (
    <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-5 mb-6 text-slate-100">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm text-slate-500">Transaction status</p>
          <h3 className="mt-1 text-xl font-semibold">{statusLabel[transactionState]}</h3>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate-300 border-slate-700 bg-slate-950/70">
          {connectionLabel[connectionState]}
        </div>
      </div>

      {transactionId && (
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl bg-slate-950/80 p-4">
            <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Tx Hash</p>
            <p className="mt-2 text-sm text-slate-200 break-all">{transactionId}</p>
          </div>
          <div className="rounded-2xl bg-slate-950/80 p-4">
            <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Last updated</p>
            <p className="mt-2 text-sm text-slate-200">{formatTimestamp(lastUpdated)}</p>
          </div>
          <div className="rounded-2xl bg-slate-950/80 p-4">
            <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Status</p>
            <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${badgeStyles[transactionState]}`}>
              {statusLabel[transactionState]}
            </span>
          </div>
        </div>
      )}

      {transactionState === 'confirmed' && (blockNumber || confirmations !== undefined) && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {blockNumber && (
            <div className="rounded-2xl bg-emerald-950/30 border border-emerald-500/20 p-4">
              <p className="text-xs uppercase tracking-[0.24em] text-emerald-400">Block Number</p>
              <p className="mt-2 text-lg font-semibold text-emerald-300">{blockNumber.toLocaleString()}</p>
            </div>
          )}
          {confirmations !== undefined && (
            <div className="rounded-2xl bg-emerald-950/30 border border-emerald-500/20 p-4">
              <p className="text-xs uppercase tracking-[0.24em] text-emerald-400">Confirmations</p>
              <p className="mt-2 text-lg font-semibold text-emerald-300">{confirmations}</p>
            </div>
          )}
        </div>
      )}

      {explorerUrl && transactionState !== 'pending' && (
        <div className="mt-4">
          <a
            href={explorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-xl bg-sky-500/10 border border-sky-500/30 px-4 py-2 text-sm font-medium text-sky-300 hover:bg-sky-500/20 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
            View on Blockchain Explorer
          </a>
        </div>
      )}

      {error && (
        <div className="mt-4 rounded-2xl border border-red-500/20 bg-red-500/5 p-4 text-sm text-amber-100">
          <strong>Live update issue:</strong> {error}
        </div>
      )}
    </section>
  );
};

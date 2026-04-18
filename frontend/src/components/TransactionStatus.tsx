import React from 'react';
import { TransactionState, ConnectionState } from '../hooks/useRealtimeTransactions';

interface TransactionStatusProps {
  transactionId?: string;
  connectionState: ConnectionState;
  transactionState: TransactionState;
  lastUpdated?: string;
  error?: string;
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
}) => {
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
            <p className="mt-2 text-sm text-slate-200">{lastUpdated ?? '—'}</p>
          </div>
          <div className="rounded-2xl bg-slate-950/80 p-4">
            <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Indicator</p>
            <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${badgeStyles[transactionState]}`}>
              {statusLabel[transactionState]}
            </span>
          </div>
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

import { useEffect, useMemo, useState } from 'react';

export type TransactionState = 'pending' | 'confirming' | 'confirmed' | 'failed' | 'unknown';
export type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'fallback';

export interface RealtimeTransactionStatus {
  connectionState: ConnectionState;
  transactionState: TransactionState;
  error?: string;
  lastUpdated?: string;
  blockNumber?: number;
  confirmations?: number;
  explorerUrl?: string;
}

const FALLBACK_POLL_INTERVAL = 10000;
const WS_PORT = import.meta.env.VITE_WS_PORT || '3002';
const buildWebsocketUrl = () => {
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${protocol}://${window.location.hostname}:${WS_PORT}`;
};

export function useRealtimeTransactions(transactionId?: string) {
  const [connectionState, setConnectionState] = useState<ConnectionState>('connecting');
  const [transactionState, setTransactionState] = useState<TransactionState>('unknown');
  const [error, setError] = useState<string | undefined>(undefined);
  const [lastUpdated, setLastUpdated] = useState<string | undefined>(undefined);
  const [blockNumber, setBlockNumber] = useState<number | undefined>(undefined);
  const [confirmations, setConfirmations] = useState<number | undefined>(undefined);
  const [explorerUrl, setExplorerUrl] = useState<string | undefined>(undefined);

  const websocketUrl = useMemo(buildWebsocketUrl, []);

  useEffect(() => {
    if (!transactionId) {
      setConnectionState('disconnected');
      setTransactionState('unknown');
      return;
    }

    let socket: WebSocket | null = null;
    let pollTimer: number | null = null;
    let isMounted = true;

    const updateState = (nextState: TransactionState, additionalInfo?: { blockNumber?: number; confirmations?: number; explorerUrl?: string }) => {
      if (!isMounted) return;
      setTransactionState(nextState);
      setLastUpdated(new Date().toISOString());
      if (additionalInfo?.blockNumber) setBlockNumber(additionalInfo.blockNumber);
      if (additionalInfo?.confirmations !== undefined) setConfirmations(additionalInfo.confirmations);
      if (additionalInfo?.explorerUrl) setExplorerUrl(additionalInfo.explorerUrl);
    };

    const startPolling = () => {
      setConnectionState('fallback');
      const fetchStatus = async () => {
        try {
          const response = await fetch(`/api/transaction-status/${encodeURIComponent(transactionId)}`);
          if (!response.ok) {
            throw new Error('Failed to poll transaction');
          }
          const payload = await response.json();
          const status = payload?.status as TransactionState | undefined;
          updateState(status ?? 'unknown', {
            blockNumber: payload?.blockNumber,
            confirmations: payload?.confirmations,
            explorerUrl: payload?.explorerUrl
          });
        } catch (pollError) {
          setError((pollError as Error).message);
        }
      };

      fetchStatus();
      pollTimer = window.setInterval(fetchStatus, FALLBACK_POLL_INTERVAL);
    };

    if (typeof WebSocket === 'undefined') {
      startPolling();
      return () => {
        if (pollTimer) {
          window.clearInterval(pollTimer);
        }
      };
    }

    try {
      socket = new WebSocket(websocketUrl);
      socket.addEventListener('open', () => {
        if (!isMounted) return;
        setConnectionState('connected');
      });

      socket.addEventListener('message', (messageEvent) => {
        try {
          const payload = JSON.parse(messageEvent.data as string);
          if (payload?.type === 'transaction-status' && payload?.transactionId === transactionId) {
            updateState(payload.status ?? 'unknown', {
              blockNumber: payload?.blockNumber,
              confirmations: payload?.confirmations,
              explorerUrl: payload?.explorerUrl
            });
          }
        } catch (parseError) {
          console.warn('[RealtimeTransactions] Invalid websocket response', parseError);
        }
      });

      socket.addEventListener('close', () => {
        if (!isMounted) return;
        setConnectionState('disconnected');
        startPolling();
      });

      socket.addEventListener('error', (event) => {
        if (!isMounted) return;
        setError('WebSocket connection failed, falling back to polling.');
        setConnectionState('fallback');
        if (socket) {
          socket.close();
        }
        startPolling();
      });
    } catch (wsError) {
      setError('Unable to open live transaction channel.');
      startPolling();
    }

    return () => {
      isMounted = false;
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.close();
      }
      if (pollTimer) {
        window.clearInterval(pollTimer);
      }
    };
  }, [transactionId, websocketUrl]);

  return {
    connectionState,
    transactionState,
    error,
    lastUpdated,
    blockNumber,
    confirmations,
    explorerUrl
  };
}

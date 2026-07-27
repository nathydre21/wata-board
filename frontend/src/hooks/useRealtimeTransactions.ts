import { useEffect, useMemo, useRef, useState } from 'react';

export type TransactionState = 'pending' | 'confirming' | 'confirmed' | 'failed' | 'unknown';
export type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'fallback' | 'reconnecting';

export interface RealtimeTransactionStatus {
  connectionState: ConnectionState;
  transactionState: TransactionState;
  error?: string;
  lastUpdated?: string;
  blockNumber?: number;
  confirmations?: number;
  explorerUrl?: string;
  connectionId?: string;
}

const FALLBACK_POLL_INTERVAL = 10000;
const WS_PORT = import.meta.env.VITE_WS_PORT || '3002';
const WS_HEARTBEAT_INTERVAL = 30_000;
const HEARTBEAT_MISS_TOLERANCE = 2;
const RECONNECT_BASE_DELAY = 1000;
const RECONNECT_MAX_DELAY = 30_000;
const RECONNECT_MAX_ATTEMPTS = 10;

// Dev-only logging helper
const devLog = (msg: string, data?: Record<string, unknown>) => {
  if (typeof import.meta !== 'undefined' && (import.meta as any).env?.DEV) {
    console.log(`[useRealtimeTransactions] ${msg}`, data || '');
  }
};

const buildWebsocketUrl = () => {
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${protocol}://${window.location.hostname}:${WS_PORT}`;
};

/**
 * Get the auth token from localStorage or sessionStorage.
 * Supports bearer tokens, API keys, or wallet-based auth.
 *
 * NOTE: For browser WebSocket connections, the auth token is passed as a URL
 * query parameter (`?token=...`) because the browser WebSocket API does not
 * support custom headers. Tokens in URLs may be visible in server logs and
 * proxy logs; consider using short-lived tokens or rotating tokens in production.
 */
function getAuthToken(): string | null {
  const token = localStorage.getItem('auth_token') ||
    localStorage.getItem('api_key') ||
    sessionStorage.getItem('auth_token');
  return token;
}

/**
 * Generate or retrieve a reconnection ID for session state recovery.
 * The server uses this to restore subscription state on reconnect.
 */
function getReconnectId(): string {
  let reconnectId = sessionStorage.getItem('ws_reconnect_id');
  if (!reconnectId) {
    reconnectId = `client-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 8)}`;
    sessionStorage.setItem('ws_reconnect_id', reconnectId);
  }
  return reconnectId;
}

export function useRealtimeTransactions(transactionId?: string) {
  const [connectionState, setConnectionState] = useState<ConnectionState>('connecting');
  const [transactionState, setTransactionState] = useState<TransactionState>('unknown');
  const [error, setError] = useState<string | undefined>(undefined);
  const [lastUpdated, setLastUpdated] = useState<string | undefined>(undefined);
  const [blockNumber, setBlockNumber] = useState<number | undefined>(undefined);
  const [confirmations, setConfirmations] = useState<number | undefined>(undefined);
  const [explorerUrl, setExplorerUrl] = useState<string | undefined>(undefined);
  const [connectionId, setConnectionId] = useState<string | undefined>(undefined);

  const websocketUrl = useMemo(buildWebsocketUrl, []);
  const reconnectAttempts = useRef(0);
  const reconnectTimer = useRef<number | null>(null);
  const heartbeatTimer = useRef<number | null>(null);
  const heartbeatMissed = useRef(0);

  useEffect(() => {
    if (!transactionId) {
      setConnectionState('disconnected');
      setTransactionState('unknown');
      return;
    }

    let socket: WebSocket | null = null;
    let pollTimer: number | null = null;
    let isMounted = true;

    // Define handlers outside try block so they're accessible in cleanup
    let handleOpen: (() => void) | null = null;
    let handleMessage: ((messageEvent: MessageEvent) => void) | null = null;
    let handleClose: ((closeEvent: CloseEvent) => void) | null = null;
    let handleError: ((event: Event) => void) | null = null;

    const updateState = (nextState: TransactionState, additionalInfo?: { blockNumber?: number; confirmations?: number; explorerUrl?: string }) => {
      if (!isMounted) return;
      setTransactionState(nextState);
      setLastUpdated(new Date().toISOString());
      if (additionalInfo?.blockNumber) setBlockNumber(additionalInfo.blockNumber);
      if (additionalInfo?.confirmations !== undefined) setConfirmations(additionalInfo.confirmations);
      if (additionalInfo?.explorerUrl) setExplorerUrl(additionalInfo.explorerUrl);
    };

    const clearHeartbeat = () => {
      if (heartbeatTimer.current) {
        clearTimeout(heartbeatTimer.current);
        heartbeatTimer.current = null;
      }
    };

    /**
     * Reset heartbeat and schedule next check.
     * The heartbeat timer is reset on every pong/message received.
     * If HEARTBEAT_MISS_TOLERANCE intervals pass without a reset,
     * the connection is considered dead.
     */
    const resetHeartbeat = () => {
      clearHeartbeat();
      heartbeatMissed.current = 0;
      heartbeatTimer.current = window.setTimeout(() => {
        checkHeartbeat();
      }, WS_HEARTBEAT_INTERVAL + 10_000);
    };

    const checkHeartbeat = () => {
      if (!isMounted) return;
      heartbeatMissed.current += 1;
      if (heartbeatMissed.current >= HEARTBEAT_MISS_TOLERANCE && socket) {
        devLog('Heartbeat missed — closing dead connection');
        setConnectionState('disconnected');
        try { socket.close(); } catch { /* already closed */ }
        return;
      }
      // Schedule next check
      heartbeatTimer.current = window.setTimeout(() => {
        checkHeartbeat();
      }, WS_HEARTBEAT_INTERVAL + 10_000);
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

    const attemptReconnect = () => {
      if (reconnectAttempts.current >= RECONNECT_MAX_ATTEMPTS) {
        setConnectionState('fallback');
        startPolling();
        return;
      }

      const delay = Math.min(
        RECONNECT_BASE_DELAY * Math.pow(2, reconnectAttempts.current),
        RECONNECT_MAX_DELAY
      );
      reconnectAttempts.current += 1;
      setConnectionState('reconnecting');

      reconnectTimer.current = window.setTimeout(() => {
        connect();
      }, delay);
    };

    const connect = () => {
      if (typeof WebSocket === 'undefined') {
        startPolling();
        return;
      }

      try {
        const url = new URL(websocketUrl);
        const token = getAuthToken();
        const reconnectId = getReconnectId();

        // Pass auth and reconnect info via URL query params since
        // browser WebSocket API doesn't support custom headers.
        if (token) {
          url.searchParams.set('token', token);
        }
        url.searchParams.set('reconnect_id', reconnectId);

        socket = new WebSocket(url.toString());

        handleOpen = () => {
          if (!isMounted) return;
          reconnectAttempts.current = 0;
          setConnectionState('connected');
          resetHeartbeat();
        };

        handleMessage = (messageEvent: MessageEvent) => {
          try {
            const payload = JSON.parse(messageEvent.data as string);

            // Any message counts as a heartbeat signal
            resetHeartbeat();

            // Handle welcome/connection message
            if (payload?.type === 'connected') {
              setConnectionId(payload.connectionId);
              devLog('Connected', { connectionId: payload.connectionId });
              return;
            }

            // Handle reconnection confirmation
            if (payload?.type === 'reconnected') {
              setConnectionId(payload.connectionId);
              devLog('Reconnected with subscription state restored', {
                connectionId: payload.connectionId,
                topics: payload.subscribedTopics,
              });
              return;
            }

            // Handle rate limit warning
            if (payload?.type === 'rate-limited') {
              console.warn('[RealtimeTransactions] Rate limited by server:', payload.message);
              return;
            }

            // Handle transaction status updates
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
        };

        handleClose = (closeEvent: CloseEvent) => {
          if (!isMounted) return;
          clearHeartbeat();
          setConnectionState('disconnected');

          // Don't reconnect for auth failures (4001)
          if (closeEvent.code === 4001) {
            setError('WebSocket authentication failed');
            startPolling();
            return;
          }

          // Attempt reconnection for other close codes
          attemptReconnect();
        };

        handleError = () => {
          if (!isMounted) return;
          setError('WebSocket connection failed, falling back to polling.');
          setConnectionState('fallback');
          if (socket) {
            socket.close();
          }
          startPolling();
        };

        socket.addEventListener('open', handleOpen);
        socket.addEventListener('message', handleMessage);
        socket.addEventListener('close', handleClose);
        socket.addEventListener('error', handleError);
      } catch (wsError) {
        setError('Unable to open live transaction channel.');
        startPolling();
      }
    };

    connect();

    return () => {
      isMounted = false;
      clearHeartbeat();

      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current);
        reconnectTimer.current = null;
      }

      if (socket) {
        if (handleOpen) socket.removeEventListener('open', handleOpen);
        if (handleMessage) socket.removeEventListener('message', handleMessage);
        if (handleClose) socket.removeEventListener('close', handleClose);
        if (handleError) socket.removeEventListener('error', handleError);

        if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
          socket.close(1000, 'Component unmounted');
        }
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
    explorerUrl,
    connectionId,
  };
}

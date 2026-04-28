import { WebSocketServer, WebSocket } from 'ws';
import logger from '../utils/logger';
import { getPublisher, getSubscriber, isRedisEnabled } from '../utils/redis';

export type TransactionStatusType = 'pending' | 'confirming' | 'confirmed' | 'failed';

interface TransactionStatusPayload {
  type: 'transaction-status';
  transactionId: string;
  status: TransactionStatusType;
  timestamp: string;
  blockNumber?: number;
  confirmations?: number;
  explorerUrl?: string;
}

interface TransactionDetails {
  status: TransactionStatusType;
  timestamp: string;
  blockNumber?: number;
  confirmations?: number;
  explorerUrl?: string;
}

const TX_STATUS_CHANNEL = 'tx-status';
const TX_STATUS_KEY_PREFIX = 'tx-status:';
// Statuses live for 24h — long enough for clients to poll back, short enough
// that Redis memory doesn't grow unbounded.
const TX_STATUS_TTL_SECONDS = 24 * 60 * 60;

// Local fallback used when Redis is not configured (e.g. unit tests, single-node dev).
const localStatuses = new Map<string, TransactionDetails>();
let wss: WebSocketServer | null = null;
let subscribed = false;

function broadcastLocally(payload: TransactionStatusPayload) {
  if (!wss) return;
  const message = JSON.stringify(payload);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

export async function getTransactionStatus(transactionId: string): Promise<TransactionStatusType> {
  if (isRedisEnabled()) {
    try {
      const value = await getPublisher().get(`${TX_STATUS_KEY_PREFIX}${transactionId}`);
      if (value) {
        const details = JSON.parse(value) as TransactionDetails;
        return details.status;
      }
    } catch (error) {
      logger.warn('Redis read failed, falling back to local cache', { error: (error as Error).message });
    }
  }
  const details = localStatuses.get(transactionId);
  return details?.status ?? 'pending';
}

export async function getTransactionDetails(transactionId: string): Promise<TransactionDetails | null> {
  if (isRedisEnabled()) {
    try {
      const value = await getPublisher().get(`${TX_STATUS_KEY_PREFIX}${transactionId}`);
      if (value) {
        return JSON.parse(value) as TransactionDetails;
      }
    } catch (error) {
      logger.warn('Redis read failed, falling back to local cache', { error: (error as Error).message });
    }
  }
  return localStatuses.get(transactionId) ?? null;
}

export async function updateTransactionStatus(
  transactionId: string,
  status: TransactionStatusType,
  additionalInfo?: { blockNumber?: number; confirmations?: number; explorerUrl?: string }
): Promise<void> {
  const timestamp = new Date().toISOString();
  const network = process.env.STELLAR_NETWORK || 'testnet';
  const explorerUrl = additionalInfo?.explorerUrl || 
    (network === 'testnet' 
      ? `https://stellar.expert/explorer/testnet/tx/${transactionId}`
      : `https://stellar.expert/explorer/public/tx/${transactionId}`);
  
  const details: TransactionDetails = {
    status,
    timestamp,
    blockNumber: additionalInfo?.blockNumber,
    confirmations: additionalInfo?.confirmations,
    explorerUrl
  };
  
  localStatuses.set(transactionId, details);
  
  const payload: TransactionStatusPayload = {
    type: 'transaction-status',
    transactionId,
    status,
    timestamp,
    blockNumber: additionalInfo?.blockNumber,
    confirmations: additionalInfo?.confirmations,
    explorerUrl
  };

  logger.info('Broadcasting transaction status update', payload);

  if (isRedisEnabled()) {
    try {
      const pub = getPublisher();
      await pub.set(`${TX_STATUS_KEY_PREFIX}${transactionId}`, JSON.stringify(details), 'EX', TX_STATUS_TTL_SECONDS);
      await pub.publish(TX_STATUS_CHANNEL, JSON.stringify(payload));
      // Subscriber on every replica (including this one) will broadcast to local WS clients.
      return;
    } catch (error) {
      logger.error('Redis publish failed, broadcasting locally only', { error: (error as Error).message });
    }
  }

  broadcastLocally(payload);
}

async function ensureSubscribed() {
  if (subscribed || !isRedisEnabled()) return;
  try {
    const sub = getSubscriber();
    await sub.subscribe(TX_STATUS_CHANNEL);
    sub.on('message', (channel, message) => {
      if (channel !== TX_STATUS_CHANNEL) return;
      try {
        const payload = JSON.parse(message) as TransactionStatusPayload;
        broadcastLocally(payload);
      } catch (error) {
        logger.warn('Dropping malformed pub/sub message', { error: (error as Error).message });
      }
    });
    subscribed = true;
    logger.info('Subscribed to Redis tx-status channel');
  } catch (error) {
    logger.error('Failed to subscribe to Redis tx-status channel', { error: (error as Error).message });
  }
}

export function startWebsocketService(port: number = Number(process.env.WS_PORT || 3002)) {
  if (wss) {
    logger.info('WebSocket server already started');
    return wss;
  }

  wss = new WebSocketServer({ port });
  wss.on('connection', (socket) => {
    logger.info('WebSocket client connected');

    socket.on('message', (data) => {
      logger.debug('WebSocket message received', { data: data.toString() });
    });

    socket.on('close', () => {
      logger.info('WebSocket client disconnected');
    });
  });

  wss.on('listening', () => {
    logger.info(`WebSocket server listening on port ${port}`);
  });

  wss.on('error', (error) => {
    logger.error('WebSocket service error', { error });
  });

  void ensureSubscribed();

  return wss;
}

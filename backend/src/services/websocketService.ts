import { WebSocketServer, type WebSocket } from 'ws';
import logger from '../utils/logger';

export type TransactionStatusType = 'pending' | 'confirming' | 'confirmed' | 'failed';

interface TransactionStatusPayload {
  type: 'transaction-status';
  transactionId: string;
  status: TransactionStatusType;
  timestamp: string;
}

const transactionStatuses = new Map<string, TransactionStatusType>();
let wss: WebSocketServer | null = null;

function broadcast(payload: TransactionStatusPayload) {
  if (!wss) return;
  const message = JSON.stringify(payload);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

export function getTransactionStatus(transactionId: string): TransactionStatusType {
  return transactionStatuses.get(transactionId) ?? 'pending';
}

export function updateTransactionStatus(transactionId: string, status: TransactionStatusType) {
  transactionStatuses.set(transactionId, status);
  const payload: TransactionStatusPayload = {
    type: 'transaction-status',
    transactionId,
    status,
    timestamp: new Date().toISOString()
  };

  logger.info('Broadcasting transaction status update', payload);
  broadcast(payload);
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

  return wss;
}

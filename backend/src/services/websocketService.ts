import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import { URL } from 'url';
import logger from '../utils/logger';
import { getPublisher, getSubscriber, isRedisEnabled } from '../utils/redis';
import { userTierService } from '../services/userTierService';
import { UserTier } from '../types/userTier';

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

// ── Connection metadata ──────────────────────────────────────
interface ConnectionMeta {
  userId: string;
  tier: UserTier;
  connectedAt: number;
  messageCount: number;
  lastMessageAt: number;
  subscribedTopics: Set<string>;
  connectionId: string;
}

// ── Subscription state persisted in Redis ────────────────────
interface SubscriptionState {
  connectionId: string;
  userId: string;
  subscribedTopics: string[];
  lastSequenceNumber: number;
  lastConnectedAt: number;
}

// ── Constants ────────────────────────────────────────────────
const TX_STATUS_CHANNEL = 'tx-status';
const TX_STATUS_KEY_PREFIX = 'tx-status:';
const SUBSCRIPTION_KEY_PREFIX = 'ws-sub:';
const SEQUENCE_KEY_PREFIX = 'ws-seq:';
const TX_STATUS_TTL_SECONDS = 24 * 60 * 60;
const SUBSCRIPTION_TTL_SECONDS = 60 * 60; // 1 hour subscription retention
const HEARTBEAT_INTERVAL_MS = 30_000;
const HEARTBEAT_TIMEOUT_MS = 10_000;
const BACKPRESSURE_THRESHOLD_BYTES = 64 * 1024; // 64KB buffer threshold
const WS_MESSAGE_RATE_WINDOW_MS = 60_000;
const WS_MESSAGE_RATE_MAX = 120; // 120 messages per minute per connection
const WS_MESSAGE_RATE_QUEUE_SIZE = 20;

// Local fallback used when Redis is not configured (e.g. unit tests, single-node dev).
const localStatuses = new Map<string, TransactionDetails>();
let wss: WebSocketServer | null = null;
let subscribed = false;
let heartbeatInterval: NodeJS.Timeout | null = null;
let sequenceCounter = 0;

// ── Connection tracking ──────────────────────────────────────
const connections = new Map<WebSocket, ConnectionMeta>();
const connectionIdMap = new Map<string, WebSocket>();

function getNextSequence(): number {
  sequenceCounter += 1;
  return sequenceCounter;
}

// ── Auth helpers ─────────────────────────────────────────────

/**
 * Parse query parameters from the WebSocket upgrade request URL.
 * The browser WebSocket API doesn't support custom headers, so auth
 * tokens and reconnect IDs are passed as URL query parameters.
 * This is a common pattern; tokens in URLs may be visible in server
 * logs. Consider using short-lived tokens in production.
 */
function parseQueryParams(req: IncomingMessage): Record<string, string> {
  const params: Record<string, string> = {};
  if (req.url) {
    try {
      // Construct a full URL from the relative path + a dummy host
      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      url.searchParams.forEach((value, key) => {
        params[key] = value;
      });
    } catch {
      // Fallback: parse manually
      const queryIdx = req.url.indexOf('?');
      if (queryIdx >= 0) {
        const qs = req.url.slice(queryIdx + 1);
        qs.split('&').forEach(pair => {
          const [key, val] = pair.split('=');
          if (key) params[decodeURIComponent(key)] = decodeURIComponent(val || '');
        });
      }
    }
  }
  return params;
}

/**
 * Extract and validate authentication from WebSocket upgrade request.
 * Supports (in priority order):
 *   - Authorization: Bearer <api-key> (HTTP header, native clients)
 *   - x-api-key: <api-key> (HTTP header)
 *   - token=<api-key> (URL query param, browser clients)
 *   - x-user-id: <user-id> (HTTP header or URL query param)
 */
function authenticateConnection(req: IncomingMessage): { userId: string; tier: UserTier } | null {
  const apiKey = process.env.API_KEY;
  const queryParams = parseQueryParams(req);

  // Extract auth from headers
  const authHeader = req.headers['authorization'] || req.headers['Authorization'];
  const xApiKey = req.headers['x-api-key'] || req.headers['X-API-Key'];
  const headerUserId = (req.headers['x-user-id'] || req.headers['X-User-Id']) as string | undefined;

  // Extract auth from query params (browser WebSocket API)
  const queryToken = queryParams['token'];
  const queryUserId = queryParams['user_id'] || queryParams['userId'];

  // Extract bearer token from header
  let token: string | null = null;
  if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7);
  }

  // Resolve user ID: headers take priority over query params
  const userId = headerUserId || queryUserId || undefined;

  // In development/test, allow unauthenticated connections
  const nodeEnv = process.env.NODE_ENV;
  if (nodeEnv === 'development' || nodeEnv === 'test') {
    if (!userId && !token && !xApiKey && !queryToken) {
      return { userId: 'dev-anonymous', tier: UserTier.ANONYMOUS };
    }
  }

  // Validate against API key — check headers first, then query params
  if (apiKey) {
    const providedKey = token || (typeof xApiKey === 'string' ? xApiKey : null) || queryToken;
    if (providedKey === apiKey) {
      const resolvedUserId = (typeof userId === 'string' && userId.length > 0) ? userId : 'api-user';
      const tier = userTierService.getUserTier(resolvedUserId);
      return { userId: resolvedUserId, tier };
    }
    // API key mismatch
    if (providedKey) {
      logger.warn('WebSocket auth failed: invalid API key', {
        remoteAddress: req.socket?.remoteAddress,
      });
      return null;
    }
  }

  // If a user ID is provided without auth, allow anonymous tier access
  if (typeof userId === 'string' && userId.length > 0) {
    const tier = userTierService.getUserTier(userId);
    return { userId, tier };
  }

  // No valid auth — reject
  logger.warn('WebSocket auth failed: no valid credentials', {
    remoteAddress: req.socket?.remoteAddress,
  });
  return null;
}

// ── Rate limiting per connection ─────────────────────────────

interface ConnectionRateState {
  timestamps: number[];
  throttledUntil: number | null;
}

const connectionRateStates = new Map<string, ConnectionRateState>();

/**
 * Check rate limit for a connection, keyed by userId for cross-connection tracking.
 * Falls back to connectionId if no userId available.
 */
function checkConnectionRateLimit(connectionId: string, userId?: string): boolean {
  const rateKey = userId || connectionId;
  const now = Date.now();
  let state = connectionRateStates.get(rateKey);

  if (!state) {
    state = { timestamps: [], throttledUntil: null };
    connectionRateStates.set(rateKey, state);
  }

  // Check if currently throttled
  if (state.throttledUntil && now < state.throttledUntil) {
    return false;
  }
  if (state.throttledUntil && now >= state.throttledUntil) {
    state.throttledUntil = null;
  }

  // Slide window
  const windowStart = now - WS_MESSAGE_RATE_WINDOW_MS;
  state.timestamps = state.timestamps.filter(t => t > windowStart);

  if (state.timestamps.length >= WS_MESSAGE_RATE_MAX) {
    // Throttle for 30 seconds
    state.throttledUntil = now + 30_000;
    logger.warn('WebSocket connection rate limited', {
      connectionId,
      userId: userId || 'unknown',
      messageCount: state.timestamps.length,
    });
    return false;
  }

  state.timestamps.push(now);
  return true;
}

// ── Subscription state management ────────────────────────────

async function saveSubscriptionState(
  connectionId: string,
  userId: string,
  topics: string[],
): Promise<void> {
  const state: SubscriptionState = {
    connectionId,
    userId,
    subscribedTopics: topics,
    lastSequenceNumber: sequenceCounter,
    lastConnectedAt: Date.now(),
  };

  if (isRedisEnabled()) {
    try {
      const pub = getPublisher();
      await pub.set(
        `${SUBSCRIPTION_KEY_PREFIX}${connectionId}`,
        JSON.stringify(state),
        'EX',
        SUBSCRIPTION_TTL_SECONDS,
      );
    } catch (error) {
      logger.error('Failed to save subscription state to Redis', {
        error: (error as Error).message,
        connectionId,
      });
    }
  }
}

async function loadSubscriptionState(connectionId: string): Promise<SubscriptionState | null> {
  if (!isRedisEnabled()) return null;

  try {
    const pub = getPublisher();
    const value = await pub.get(`${SUBSCRIPTION_KEY_PREFIX}${connectionId}`);
    if (value) {
      return JSON.parse(value) as SubscriptionState;
    }
  } catch (error) {
    logger.error('Failed to load subscription state from Redis', {
      error: (error as Error).message,
      connectionId,
    });
  }
  return null;
}

async function clearSubscriptionState(connectionId: string): Promise<void> {
  if (!isRedisEnabled()) return;

  try {
    const pub = getPublisher();
    await pub.del(`${SUBSCRIPTION_KEY_PREFIX}${connectionId}`);
  } catch (error) {
    logger.error('Failed to clear subscription state from Redis', {
      error: (error as Error).message,
      connectionId,
    });
  }
}

// ── Backpressure-aware send ──────────────────────────────────

function sendWithBackpressure(
  socket: WebSocket,
  message: string,
  meta: ConnectionMeta,
): boolean {
  if (socket.readyState !== WebSocket.OPEN) return false;

  const buffered = socket.bufferedAmount;
  if (buffered > BACKPRESSURE_THRESHOLD_BYTES) {
    // Client can't keep up — skip non-critical messages
    logger.debug('Backpressure: skipping message for slow client', {
      connectionId: meta.connectionId,
      bufferedAmount: buffered,
      threshold: BACKPRESSURE_THRESHOLD_BYTES,
    });
    return false;
  }

  try {
    socket.send(message);
    return true;
  } catch (error) {
    logger.error('Failed to send WebSocket message', {
      error: (error as Error).message,
      connectionId: meta.connectionId,
    });
    return false;
  }
}

// ── Broadcast helpers ────────────────────────────────────────

function broadcastLocally(payload: TransactionStatusPayload) {
  if (!wss) return;
  const message = JSON.stringify(payload);

  connections.forEach((meta, socket) => {
    if (socket.readyState !== WebSocket.OPEN) return;

    // Filter by subscription: if client has subscriptions, only send matching topics.
    // If no subscriptions, send all messages (backward-compatible default).
    if (meta.subscribedTopics.size > 0) {
      // Client wants 'transaction-status' type messages
      if (!meta.subscribedTopics.has('transaction-status')) {
        return;
      }
    }

    sendWithBackpressure(socket, message, meta);
  });
}

// ── Public API ───────────────────────────────────────────────

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

  const seq = getNextSequence();
  const payload: TransactionStatusPayload = {
    type: 'transaction-status',
    transactionId,
    status,
    timestamp,
    blockNumber: additionalInfo?.blockNumber,
    confirmations: additionalInfo?.confirmations,
    explorerUrl
  };

  logger.info('Broadcasting transaction status update', { ...payload, sequenceNumber: seq });

  if (isRedisEnabled()) {
    try {
      const pub = getPublisher();
      await pub.set(`${TX_STATUS_KEY_PREFIX}${transactionId}`, JSON.stringify(details), 'EX', TX_STATUS_TTL_SECONDS);
      await pub.set(`${SEQUENCE_KEY_PREFIX}${transactionId}`, String(seq), 'EX', TX_STATUS_TTL_SECONDS);
      await pub.publish(TX_STATUS_CHANNEL, JSON.stringify({ ...payload, sequenceNumber: seq }));
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

// ── Heartbeat / keep-alive ───────────────────────────────────

function startHeartbeat() {
  if (heartbeatInterval) return;

  heartbeatInterval = setInterval(() => {
    const deadSockets: WebSocket[] = [];

    connections.forEach((meta, socket) => {
      if (socket.readyState === WebSocket.OPEN) {
        // Check if client is alive — send ping
        try {
          socket.ping();
          // Mark as pending pong; if no pong within timeout, mark as dead
          const pongTimeout = setTimeout(() => {
            if (socket.readyState === WebSocket.OPEN) {
              logger.warn('WebSocket heartbeat missed — client may be zombie', {
                connectionId: meta.connectionId,
                userId: meta.userId,
              });
              deadSockets.push(socket);
            }
          }, HEARTBEAT_TIMEOUT_MS);
          // Store timeout cleanup reference on socket via a once listener
          socket.once('pong', () => clearTimeout(pongTimeout));
        } catch {
          deadSockets.push(socket);
        }
      } else if (socket.readyState === WebSocket.CLOSED || socket.readyState === WebSocket.CLOSING) {
        deadSockets.push(socket);
      }
    });

    // Clean up dead connections
    for (const socket of deadSockets) {
      cleanupConnection(socket);
    }
  }, HEARTBEAT_INTERVAL_MS);

  heartbeatInterval.unref();
}

function stopHeartbeat() {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
}

function cleanupConnection(socket: WebSocket) {
  const meta = connections.get(socket);
  if (meta) {
    logger.info('Cleaning up WebSocket connection', {
      connectionId: meta.connectionId,
      userId: meta.userId,
    });

    // Save subscription state for potential reconnection
    saveSubscriptionState(
      meta.connectionId,
      meta.userId,
      Array.from(meta.subscribedTopics),
    ).catch(err => {
      logger.error('Failed to persist subscription state on cleanup', {
        error: (err as Error).message,
      });
    });

    connectionIdMap.delete(meta.connectionId);
    // Clean up rate state using the same key as checkConnectionRateLimit
    const rateKey = meta.userId || meta.connectionId;
    connectionRateStates.delete(rateKey);
    connections.delete(socket);
  }

  // Ensure socket is closed
  try {
    if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
      socket.close(1000, 'Connection cleaned up');
    }
  } catch {
    // Ignore close errors during cleanup
  }
}

// ── Connection ID generation ─────────────────────────────────

function generateConnectionId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 10);
  return `ws-${timestamp}-${random}`;
}

// ── Main WebSocket server setup ──────────────────────────────

export function startWebsocketService(port: number = Number(process.env.WS_PORT || 3002)) {
  if (wss) {
    logger.info('WebSocket server already started');
    return wss;
  }

  wss = new WebSocketServer({ port });

  wss.on('connection', (socket: WebSocket, req: IncomingMessage) => {
    // ── 1. Per-connection authentication ────────────────────
    const auth = authenticateConnection(req);
    if (!auth) {
      logger.warn('Rejecting unauthenticated WebSocket connection', {
        remoteAddress: req.socket?.remoteAddress,
      });
      socket.close(4001, 'Authentication required');
      return;
    }

    const connectionId = generateConnectionId();
    const meta: ConnectionMeta = {
      userId: auth.userId,
      tier: auth.tier,
      connectedAt: Date.now(),
      messageCount: 0,
      lastMessageAt: Date.now(),
      subscribedTopics: new Set(),
      connectionId,
    };

    connections.set(socket, meta);
    connectionIdMap.set(connectionId, socket);

    logger.info('WebSocket client authenticated and connected', {
      connectionId,
      userId: auth.userId,
      tier: auth.tier,
      clientCount: connections.size,
    });

    // ── 2. Check for reconnectable subscription state ────────
    // Support both header (native clients) and query param (browser clients)
    const queryParams = parseQueryParams(req);
    const reconnectId = (req.headers['x-reconnect-id'] || req.headers['X-Reconnect-Id'] || queryParams['reconnect_id']) as string | undefined;
    if (reconnectId) {
      loadSubscriptionState(reconnectId).then(existingState => {
        if (existingState && socket.readyState === WebSocket.OPEN) {
          logger.info('Restoring subscription state for reconnecting client', {
            connectionId,
            reconnectId,
            topics: existingState.subscribedTopics,
          });
          meta.subscribedTopics = new Set(existingState.subscribedTopics);

          // Send a reconnection confirmation with last sequence number
          const reconnectMsg = JSON.stringify({
            type: 'reconnected',
            connectionId,
            lastSequenceNumber: existingState.lastSequenceNumber,
            subscribedTopics: existingState.subscribedTopics,
          });
          socket.send(reconnectMsg);
        }
      }).catch(err => {
        logger.error('Failed to restore subscription state', { error: (err as Error).message });
      });
    }

    // ── 3. Handle pong responses (heartbeat) ─────────────────
    // The 'ws' library automatically responds to pings with pongs.
    // We track pong events to verify the client is alive.

    // ── 4. Handle incoming messages with rate limiting ───────
    socket.on('message', (data: Buffer | ArrayBuffer | Buffer[]) => {
      if (!checkConnectionRateLimit(connectionId, auth.userId)) {
        logger.warn('WebSocket message rate limit exceeded', {
          connectionId,
          userId: meta.userId,
        });
        // Send rate limit warning but don't close (allows client to self-throttle)
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({
            type: 'rate-limited',
            message: 'Message rate limit exceeded. Please slow down.',
          }));
        }
        return;
      }

      meta.messageCount += 1;
      meta.lastMessageAt = Date.now();

      try {
        const messageStr = data.toString();
        logger.debug('WebSocket message received', {
          connectionId,
          data: messageStr.substring(0, 200), // Truncate for logging
        });

        // Try to parse as JSON to handle subscription requests
        try {
          const parsed = JSON.parse(messageStr);
          if (parsed.type === 'subscribe' && parsed.topic) {
            meta.subscribedTopics.add(parsed.topic);
            logger.info('Client subscribed to topic', {
              connectionId,
              topic: parsed.topic,
            });
            if (socket.readyState === WebSocket.OPEN) {
              socket.send(JSON.stringify({
                type: 'subscribed',
                topic: parsed.topic,
              }));
            }
          } else if (parsed.type === 'unsubscribe' && parsed.topic) {
            meta.subscribedTopics.delete(parsed.topic);
            logger.info('Client unsubscribed from topic', {
              connectionId,
              topic: parsed.topic,
            });
          }
        } catch {
          // Non-JSON message — just log it
        }
      } catch {
        // Ignore malformed messages
      }
    });

    // ── 5. Handle disconnection ──────────────────────────────
    socket.on('close', (code: number, reason: Buffer) => {
      logger.info('WebSocket client disconnected', {
        connectionId,
        userId: meta.userId,
        code,
        reason: reason.toString(),
        messageCount: meta.messageCount,
        connectedDuration: Date.now() - meta.connectedAt,
      });
      cleanupConnection(socket);
    });

    // ── 6. Handle errors ─────────────────────────────────────
    socket.on('error', (error: Error) => {
      logger.error('WebSocket connection error', {
        connectionId,
        userId: meta.userId,
        error: error.message,
      });
      cleanupConnection(socket);
    });

    // ── 7. Send welcome message ──────────────────────────────
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({
        type: 'connected',
        connectionId,
        userId: meta.userId,
        tier: meta.tier,
        timestamp: new Date().toISOString(),
      }));
    }
  });

  wss.on('listening', () => {
    logger.info(`WebSocket server listening on port ${port}`);
    startHeartbeat();
  });

  wss.on('error', (error: Error) => {
    logger.error('WebSocket service error', { error: error.message });
  });

  wss.on('close', () => {
    logger.info('WebSocket server closed');
    stopHeartbeat();
    connections.clear();
    connectionIdMap.clear();
    connectionRateStates.clear();
  });

  void ensureSubscribed();

  return wss;
}

// ── Export connection stats for monitoring ───────────────────

export function getWebSocketStats() {
  return {
    totalConnections: connections.size,
    connections: Array.from(connections.values()).map(meta => ({
      connectionId: meta.connectionId,
      userId: meta.userId,
      tier: meta.tier,
      connectedAt: new Date(meta.connectedAt).toISOString(),
      messageCount: meta.messageCount,
      subscribedTopics: Array.from(meta.subscribedTopics),
      connectionDuration: Date.now() - meta.connectedAt,
    })),
  };
}

export function getConnectionCount(): number {
  return connections.size;
}

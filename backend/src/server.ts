import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import https from 'https';
import fs from 'fs';
import { randomUUID } from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { PaymentService, PaymentRequest } from './payment-service';
import { RateLimitConfig } from './rate-limiter';
import type { RateLimitInfo } from '../../shared/types';
import logger from './utils/logger';
import { HealthService } from './utils/health';
import { metricsCollector } from './middleware/metrics';
import { tieredRateLimiter } from './middleware/rateLimiter';
import monitoringRoutes from './routes/monitoring';
import upgradeRoutes from './routes/upgrade';
import currencyRoutes from './routes/currency';
import providerRoutes from './routes/providers';
import { apiErrorHandler } from './middleware/errorHandler';
import { StandardErrorHandler, requestContextMiddleware, handleUnhandledRejections } from './utils/standardErrorHandler';
import { AnalyticsService } from './services/analyticsService';
import { getTransactionStatus, startWebsocketService, updateTransactionStatus } from './services/websocketService';
import { ProviderService } from './services/providerService';
import { MultiProviderPaymentService } from './services/multiProviderPaymentService';
import { ProviderPaymentRequest } from './types/provider';
import { kycService } from './services/kyc-service';
import analyticsRoutes from './routes/analytics';
import notificationRoutes from './routes/notifications';
import configRoutes from './routes/config';
import docsRoutes from './routes/docs';
import { captureAndTrackConfig } from './utils/configSnapshot';
import { envConfig } from './utils/env';
import { config } from './config/appConfig';
import { sanitizeString, sanitizeAlphanumeric, sanitizePositiveNumber, sanitizeInteger, sanitizeDescription, validationError, type ValidationError } from './utils/sanitize';
import { asyncRoute, AppError, badRequest, tooManyRequests, internalError } from './utils/asyncRouteHandler';
import { versioningMiddleware } from './middleware/versioning';
import realTimeMonitoringRoutes from './routes/realTimeMonitoring';
import { database } from './utils/database';

type PaymentHistoryStatus = 'pending' | 'scheduled' | 'processing' | 'completed' | 'failed' | 'cancelled' | 'paused';

interface PaymentHistoryRecord {
  id: string;
  scheduleId: string;
  meterId: string;
  amount: number;
  status: PaymentHistoryStatus;
  scheduledDate: string;
  actualPaymentDate?: string;
  transactionId?: string;
  errorMessage?: string;
  retryCount: number;
  createdAt: string;
}

// Initialize unhandled rejection handlers
handleUnhandledRejections();

captureAndTrackConfig();

const RATE_LIMIT_CONFIG: RateLimitConfig = {
  windowMs: config.rateLimits.tierLimits.anonymous.windowMs,
  maxRequests: config.rateLimits.tierLimits.anonymous.maxRequests,
  queueSize: config.rateLimits.tierLimits.anonymous.queueSize,
};

const paymentService = new PaymentService(RATE_LIMIT_CONFIG);
const providerService = new ProviderService();
const multiProviderPaymentService = new MultiProviderPaymentService(RATE_LIMIT_CONFIG, providerService);

providerService.loadProvidersFromEnvironment();

const app = express();
const PORT = config.server.port;

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://stellar.org"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://api.yourdomain.com", "https://soroban-testnet.stellar.org", "https://soroban.stellar.org"],
      frameAncestors: ["'none'"],
    },
  },
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
}));

const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    const allowedOrigins = getAllowedOrigins();
    if (envConfig.NODE_ENV === 'development' || envConfig.NODE_ENV === 'test') {
      if (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
        return callback(null, true);
      }
    }
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      logger.warn('CORS: Origin not allowed', { origin });
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Origin', 'X-Requested-With', 'Content-Type', 'Accept', 'Authorization', 'Cache-Control', 'Pragma'],
  exposedHeaders: ['X-Total-Count', 'X-Rate-Limit-Remaining'],
  maxAge: 86400,
};

app.use(cors(corsOptions));
app.use(requestContextMiddleware);
app.use(express.json({ limit: '10mb' }));

app.use((err: unknown, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (err instanceof SyntaxError && err.message.includes('JSON')) {
    return res.status(400).json({ success: false, error: 'Invalid JSON payload' });
  }
  const payloadTooLarge = err as { type?: string };
  if (payloadTooLarge?.type === 'entity.too.large') {
    return res.status(413).json({ success: false, error: 'Payload too large' });
  }
  return next(err);
});
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request ID middleware — generates or propagates a unique ID for every request,
// attaches it to req.requestId, and sets the X-Request-ID response header.
app.use((req: Request, res: Response, next: NextFunction) => {
  const incoming = req.headers['x-request-id'];
  // Propagate if the caller supplied a valid UUID-shaped header; otherwise generate.
  const requestId =
    typeof incoming === 'string' && /^[\w\-]{8,64}$/.test(incoming)
      ? incoming
      : randomUUID();
  (req as any).requestId = requestId;
  res.setHeader('X-Request-ID', requestId);
  next();
});

app.use((req: Request, _res: Response, next: NextFunction) => {
  logger.info('Incoming HTTP Request', {
    method: req.method,
    path: req.path,
    ip: req.ip,
    userAgent: req.get('user-agent'),
    requestId: (req as any).requestId,
  });
  next();
});

app.use(metricsCollector.middleware());
app.use(versioningMiddleware);

// ── Rate limiting for ALL API endpoints ──────────────────────
// Auto-detects endpoint type from HTTP method:
//   GET / HEAD / OPTIONS → READ (3x tier limit)
//   POST / PUT / DELETE / PATCH → WRITE (1x tier limit)
app.use('/api', tieredRateLimiter.middleware());

// Versioned routes
app.use('/api/v1/monitoring', monitoringRoutes);
app.use('/api/v2/monitoring', monitoringRoutes);
app.use('/api/v1/currency', currencyRoutes);
app.use('/api/v2/currency', currencyRoutes);
app.use('/api/v1/upgrade', upgradeRoutes);
app.use('/api/v2/upgrade', upgradeRoutes);
app.use('/api/v1/providers', providerRoutes);
app.use('/api/v2/providers', providerRoutes);
app.use('/api/v1/analytics', analyticsRoutes);
app.use('/api/v2/analytics', analyticsRoutes);
app.use('/api/v1/notifications', notificationRoutes);
app.use('/api/v2/notifications', notificationRoutes);
app.use('/api/v1/config', configRoutes);
app.use('/api/v2/config', configRoutes);
app.use('/api/v1/real-time-monitoring', realTimeMonitoringRoutes);
app.use('/api/v2/real-time-monitoring', realTimeMonitoringRoutes);
app.use('/docs', docsRoutes);

app.get('/health', (_req, res) => {
  res.status(200).json(HealthService.getLiveness());
});

app.get('/health/ready', async (_req, res) => {
  const readiness = await HealthService.getReadiness();
  const status = readiness.status === 'UP' ? 200 : 503;
  res.status(status).json(readiness);
});

app.get('/health/backup', (_req, res) => {
  const backup = HealthService.getBackupHealth();
  // UNKNOWN returns 200 (no marker yet — likely first boot). DOWN returns 503
  // so monitoring/alerting trips on stale backups.
  const status = backup.status === 'DOWN' ? 503 : 200;
  res.status(status).json(backup);
});

app.get('/health/full', asyncRoute(async (_req, res) => {
  const fullHealth = await HealthService.getFullHealth();
  const status = fullHealth.status === 'UP' ? 200 : 503;
  res.status(status).json(fullHealth);
}));

// Versioned payment endpoints
app.post('/api/v1/payment', asyncRoute(async (req, res) => {
  const raw = req.body;
  const errors: ValidationError[] = [];
  const meter_id = sanitizeAlphanumeric(raw.meter_id, 50);
  if (!meter_id) errors.push(validationError('meter_id', 'meter_id must be an alphanumeric string (max 50 chars)'));
  const amount = sanitizePositiveNumber(raw.amount);
  if (Number.isNaN(amount)) errors.push(validationError('amount', 'amount must be a positive number'));
  const userId = sanitizeAlphanumeric(raw.userId, 100);
  if (!userId) errors.push(validationError('userId', 'userId must be an alphanumeric string (max 100 chars)'));
  if (errors.length > 0) throw badRequest('Validation failed', { errors });

  const nonce = sanitizeAlphanumeric(raw.nonce, 64) || `${userId}-${Date.now()}`;
  const paymentRequest: PaymentRequest = { meter_id, amount, userId, nonce };
  const result = await paymentService.processPayment(paymentRequest);
  res.set('X-Rate-Limit-Remaining', result.rateLimitInfo?.remainingRequests?.toString() || '0');

  if (result.success) {
    if (result.transactionId) await updateTransactionStatus(result.transactionId, 'confirmed');
    return res.status(200).json({ success: true, transactionId: result.transactionId, rateLimitInfo: { remainingRequests: result.rateLimitInfo?.remainingRequests, resetTime: result.rateLimitInfo?.resetTime } });
  } else {
    if (result.transactionId) await updateTransactionStatus(result.transactionId, 'failed');
    if (result.error?.includes('Rate limit exceeded')) throw tooManyRequests(result.error, { rateLimitInfo: result.rateLimitInfo });
    if (result.error?.includes('queued')) throw new AppError(202, result.error, { rateLimitInfo: result.rateLimitInfo });
    throw badRequest(result.error || 'Payment failed', { rateLimitInfo: result.rateLimitInfo });
  }
}));

app.post('/api/v2/payment', asyncRoute(async (req, res) => {
  const raw = req.body;
  const errors: ValidationError[] = [];
  const meter_id = sanitizeAlphanumeric(raw.meter_id, 50);
  if (!meter_id) errors.push(validationError('meter_id', 'meter_id must be an alphanumeric string (max 50 chars)'));
  const amount = sanitizePositiveNumber(raw.amount);
  if (Number.isNaN(amount)) errors.push(validationError('amount', 'amount must be a positive number'));
  const userId = sanitizeAlphanumeric(raw.userId, 100);
  if (!userId) errors.push(validationError('userId', 'userId must be an alphanumeric string (max 100 chars)'));
  if (errors.length > 0) throw badRequest('Validation failed', { errors });

  const nonce = sanitizeAlphanumeric(raw.nonce, 64) || `${userId}-${Date.now()}`;
  const paymentRequest: PaymentRequest = { meter_id, amount, userId, nonce };
  const result = await paymentService.processPayment(paymentRequest);
  res.set('X-Rate-Limit-Remaining', result.rateLimitInfo?.remainingRequests?.toString() || '0');

  if (result.success) {
    if (result.transactionId) await updateTransactionStatus(result.transactionId, 'confirmed');
    return res.status(200).json({ success: true, transactionId: result.transactionId, rateLimitInfo: { remainingRequests: result.rateLimitInfo?.remainingRequests, resetTime: result.rateLimitInfo?.resetTime } });
  } else {
    if (result.transactionId) await updateTransactionStatus(result.transactionId, 'failed');
    if (result.error?.includes('Rate limit exceeded')) throw tooManyRequests(result.error, { rateLimitInfo: result.rateLimitInfo });
    if (result.error?.includes('queued')) throw new AppError(202, result.error, { rateLimitInfo: result.rateLimitInfo });
    throw badRequest(result.error || 'Payment failed', { rateLimitInfo: result.rateLimitInfo });
  }
}));

app.post('/api/v1/payment/multi-provider', asyncRoute(async (req, res) => {
  const raw = req.body;
  const errors: ValidationError[] = [];
  const meter_id = sanitizeAlphanumeric(raw.meter_id, 50);
  if (!meter_id) errors.push(validationError('meter_id', 'meter_id must be an alphanumeric string (max 50 chars)'));
  const amount = sanitizePositiveNumber(raw.amount);
  if (Number.isNaN(amount)) errors.push(validationError('amount', 'amount must be a positive number'));
  const userId = sanitizeAlphanumeric(raw.userId, 100);
  if (!userId) errors.push(validationError('userId', 'userId must be an alphanumeric string (max 100 chars)'));
  const providerId = sanitizeAlphanumeric(raw.providerId, 100);
  if (!providerId) errors.push(validationError('providerId', 'providerId must be an alphanumeric string (max 100 chars)'));
  if (errors.length > 0) throw badRequest('Validation failed', { errors });

  const provider = providerService.getProviderById(providerId);
  if (!provider || !provider.isActive) {
    throw badRequest('Provider not available', {
      errors: [validationError('providerId', `Provider ${providerId} is not available or does not exist`)]
    });
  }

  const paymentRequest: ProviderPaymentRequest = { meter_id, amount, userId, providerId };
  const result = await multiProviderPaymentService.processPayment(paymentRequest);
  res.set('X-Rate-Limit-Remaining', result.rateLimitInfo?.remainingRequests?.toString() || '0');

  if (result.success) {
    if (result.transactionId) await updateTransactionStatus(result.transactionId, 'confirmed');
    return res.status(200).json({ success: true, transactionId: result.transactionId, providerId: result.providerId, rateLimitInfo: { remainingRequests: result.rateLimitInfo?.remainingRequests, resetTime: result.rateLimitInfo?.resetTime } });
  } else {
    if (result.transactionId) await updateTransactionStatus(result.transactionId, 'failed');
    if (result.error?.includes('Rate limit exceeded')) throw tooManyRequests(result.error, { providerId: result.providerId, rateLimitInfo: result.rateLimitInfo });
    if (result.error?.includes('queued')) throw new AppError(202, result.error, { providerId: result.providerId, rateLimitInfo: result.rateLimitInfo });
    throw badRequest(result.error || 'Payment failed', { providerId: result.providerId, rateLimitInfo: result.rateLimitInfo });
  }
}));

app.post('/api/v2/payment/multi-provider', asyncRoute(async (req, res) => {
  const raw = req.body;
  const errors: ValidationError[] = [];
  const meter_id = sanitizeAlphanumeric(raw.meter_id, 50);
  if (!meter_id) errors.push(validationError('meter_id', 'meter_id must be an alphanumeric string (max 50 chars)'));
  const amount = sanitizePositiveNumber(raw.amount);
  if (Number.isNaN(amount)) errors.push(validationError('amount', 'amount must be a positive number'));
  const userId = sanitizeAlphanumeric(raw.userId, 100);
  if (!userId) errors.push(validationError('userId', 'userId must be an alphanumeric string (max 100 chars)'));
  const providerId = sanitizeAlphanumeric(raw.providerId, 100);
  if (!providerId) errors.push(validationError('providerId', 'providerId must be an alphanumeric string (max 100 chars)'));
  if (errors.length > 0) throw badRequest('Validation failed', { errors });

  const provider = providerService.getProviderById(providerId);
  if (!provider || !provider.isActive) {
    throw badRequest('Provider not available', {
      errors: [validationError('providerId', `Provider ${providerId} is not available or does not exist`)]
    });
  }

  const paymentRequest: ProviderPaymentRequest = { meter_id, amount, userId, providerId };
  const result = await multiProviderPaymentService.processPayment(paymentRequest);
  res.set('X-Rate-Limit-Remaining', result.rateLimitInfo?.remainingRequests?.toString() || '0');

  if (result.success) {
    if (result.transactionId) await updateTransactionStatus(result.transactionId, 'confirmed');
    return res.status(200).json({ success: true, transactionId: result.transactionId, providerId: result.providerId, rateLimitInfo: { remainingRequests: result.rateLimitInfo?.remainingRequests, resetTime: result.rateLimitInfo?.resetTime } });
  } else {
    if (result.transactionId) await updateTransactionStatus(result.transactionId, 'failed');
    if (result.error?.includes('Rate limit exceeded')) throw tooManyRequests(result.error, { providerId: result.providerId, rateLimitInfo: result.rateLimitInfo });
    if (result.error?.includes('queued')) throw new AppError(202, result.error, { providerId: result.providerId, rateLimitInfo: result.rateLimitInfo });
    throw badRequest(result.error || 'Payment failed', { providerId: result.providerId, rateLimitInfo: result.rateLimitInfo });
  }
}));

// Legacy multi-provider route (backward compatibility)
app.post('/api/payment/multi-provider', asyncRoute(async (req, res) => {
  const raw = req.body;
  const errors: ValidationError[] = [];
  const meter_id = sanitizeAlphanumeric(raw.meter_id, 50);
  if (!meter_id) errors.push(validationError('meter_id', 'meter_id must be an alphanumeric string (max 50 chars)'));
  const amount = sanitizePositiveNumber(raw.amount);
  if (Number.isNaN(amount)) errors.push(validationError('amount', 'amount must be a positive number'));
  const userId = sanitizeAlphanumeric(raw.userId, 100);
  if (!userId) errors.push(validationError('userId', 'userId must be an alphanumeric string (max 100 chars)'));
  const providerId = sanitizeAlphanumeric(raw.providerId, 100);
  if (!providerId) errors.push(validationError('providerId', 'providerId must be an alphanumeric string (max 100 chars)'));
  if (errors.length > 0) throw badRequest('Validation failed', { errors });

  const provider = providerService.getProviderById(providerId);
  if (!provider || !provider.isActive) {
    throw badRequest('Provider not available', {
      errors: [validationError('providerId', `Provider ${providerId} is not available or does not exist`)]
    });
  }

  const paymentRequest: ProviderPaymentRequest = { meter_id, amount, userId, providerId };
  const result = await multiProviderPaymentService.processPayment(paymentRequest);
  res.set('X-Rate-Limit-Remaining', result.rateLimitInfo?.remainingRequests?.toString() || '0');

  if (result.success) {
    if (result.transactionId) await updateTransactionStatus(result.transactionId, 'confirmed');
    return res.status(200).json({ success: true, transactionId: result.transactionId, providerId: result.providerId, rateLimitInfo: { remainingRequests: result.rateLimitInfo?.remainingRequests, resetTime: result.rateLimitInfo?.resetTime } });
  } else {
    if (result.transactionId) await updateTransactionStatus(result.transactionId, 'failed');
    if (result.error?.includes('Rate limit exceeded')) throw tooManyRequests(result.error, { providerId: result.providerId, rateLimitInfo: result.rateLimitInfo });
    if (result.error?.includes('queued')) throw new AppError(202, result.error, { providerId: result.providerId, rateLimitInfo: result.rateLimitInfo });
    throw badRequest(result.error || 'Payment failed', { providerId: result.providerId, rateLimitInfo: result.rateLimitInfo });
  }
}));

app.get('/api/v1/rate-limit/:userId', asyncRoute(async (req, res) => {
  const userId = sanitizeAlphanumeric(req.params.userId, 100);
  if (!userId) throw badRequest('Invalid User ID format');
  const status = paymentService.getRateLimitStatus(userId);
  const queueLength = paymentService.getQueueLength(userId);
  return res.status(200).json({ success: true, data: { ...status, queueLength } });
}));

app.get('/api/v2/rate-limit/:userId', asyncRoute(async (req, res) => {
  const userId = sanitizeAlphanumeric(req.params.userId, 100);
  if (!userId) throw badRequest('Invalid User ID format');
  const status = paymentService.getRateLimitStatus(userId);
  const queueLength = paymentService.getQueueLength(userId);
  return res.status(200).json({ success: true, data: { ...status, queueLength } });
}));

app.get('/api/v1/analytics/:userId', asyncRoute(async (req, res) => {
  const userId = sanitizeAlphanumeric(req.params.userId, 100);
  if (!userId) throw badRequest('Invalid User ID format');
  const analytics = AnalyticsService.generateReport(userId);
  return res.status(200).json(analytics);
}));

app.get('/api/v2/analytics/:userId', asyncRoute(async (req, res) => {
  const userId = sanitizeAlphanumeric(req.params.userId, 100);
  if (!userId) throw badRequest('Invalid User ID format');
  const analytics = AnalyticsService.generateReport(userId);
  return res.status(200).json(analytics);
}));

app.get('/api/v1/transaction-status/:transactionId', asyncRoute(async (req, res) => {
  const transactionId = sanitizeAlphanumeric(req.params.transactionId, 64);
  if (!transactionId) throw badRequest('Invalid transaction ID format');
  const status = await getTransactionStatus(transactionId);
  return res.status(200).json({ success: true, transactionId: req.params.transactionId, status });
}));

app.get('/api/v2/transaction-status/:transactionId', asyncRoute(async (req, res) => {
  const transactionId = sanitizeAlphanumeric(req.params.transactionId, 64);
  if (!transactionId) throw badRequest('Invalid transaction ID format');
  const status = await getTransactionStatus(transactionId);
  return res.status(200).json({ success: true, transactionId: req.params.transactionId, status });
}));

app.get('/api/v1/user/kyc/:userId', asyncRoute(async (req, res) => {
  const userId = sanitizeAlphanumeric(req.params.userId, 100);
  if (!userId) throw badRequest('Invalid user ID');
  const status = await kycService.getStatus(userId);
  return res.status(200).json({ success: true, status });
}));

app.get('/api/v2/user/kyc/:userId', asyncRoute(async (req, res) => {
  const userId = sanitizeAlphanumeric(req.params.userId, 100);
  if (!userId) throw badRequest('Invalid user ID');
  const status = await kycService.getStatus(userId);
  return res.status(200).json({ success: true, status });
}));

app.post('/api/v1/user/kyc/submit', asyncRoute(async (req, res) => {
  const { userId, documentType } = req.body;
  const sanitizedUserId = sanitizeAlphanumeric(userId, 100);
  if (!sanitizedUserId) throw badRequest('Invalid user ID');
  const data = await kycService.submitKYC(sanitizedUserId, documentType);
  return res.status(200).json({ success: true, data });
}));

app.post('/api/v2/user/kyc/submit', asyncRoute(async (req, res) => {
  const { userId, documentType } = req.body;
  const sanitizedUserId = sanitizeAlphanumeric(userId, 100);
  if (!sanitizedUserId) throw badRequest('Invalid user ID');
  const data = await kycService.submitKYC(sanitizedUserId, documentType);
  return res.status(200).json({ success: true, data });
}));

app.get('/api/v1/user/export-data/:userId', asyncRoute(async (req, res) => {
  const userId = sanitizeAlphanumeric(req.params.userId, 100);
  if (!userId) throw badRequest('Invalid user ID');
  const userData = { userId, kycStatus: await kycService.getStatus(userId), exportDate: new Date().toISOString(), disclaimer: 'Mock export' };
  return res.status(200).json({ success: true, data: userData });
}));

app.get('/api/v2/user/export-data/:userId', asyncRoute(async (req, res) => {
  const userId = sanitizeAlphanumeric(req.params.userId, 100);
  if (!userId) throw badRequest('Invalid user ID');
  const userData = { userId, kycStatus: await kycService.getStatus(userId), exportDate: new Date().toISOString(), disclaimer: 'Mock export' };
  return res.status(200).json({ success: true, data: userData });
}));

app.delete('/api/v1/user/delete-data/:userId', asyncRoute(async (req, res) => {
  const userId = sanitizeAlphanumeric(req.params.userId, 100);
  if (!userId) throw badRequest('Invalid user ID');
  logger.info(`GDPR: Deleting all data for user ${userId}`);
  return res.status(200).json({ success: true, message: 'Data deletion request received' });
}));

app.delete('/api/v2/user/delete-data/:userId', asyncRoute(async (req, res) => {
  const userId = sanitizeAlphanumeric(req.params.userId, 100);
  if (!userId) throw badRequest('Invalid user ID');
  logger.info(`GDPR: Deleting all data for user ${userId}`);
  return res.status(200).json({ success: true, message: 'Data deletion request received' });
}));

async function handlePaymentHistory(req: express.Request, res: express.Response) {
    const validationErrors: ValidationError[] = [];

    // ── Pagination ──────────────────────────────────────────────────────────
    const rawPage  = sanitizeInteger(req.query.page  ?? '1',  1, 10_000);
    const rawLimit = sanitizeInteger(req.query.limit ?? '20', 1, 100);

    if (req.query.page  !== undefined && Number.isNaN(rawPage))  validationErrors.push(validationError('page',  'page must be a positive integer (1–10000)'));
    if (req.query.limit !== undefined && Number.isNaN(rawLimit)) validationErrors.push(validationError('limit', 'limit must be an integer between 1 and 100'));

    const page   = Number.isNaN(rawPage)  ? 1  : rawPage;
    const limit  = Number.isNaN(rawLimit) ? 20 : rawLimit;
    const offset = (page - 1) * limit;

    // ── String filters ──────────────────────────────────────────────────────
    const userId = req.query.userId ? sanitizeAlphanumeric(String(req.query.userId), 100) : '';
    if (req.query.userId  !== undefined && !userId)  validationErrors.push(validationError('userId',  'userId must be alphanumeric (max 100 chars)'));

    const meterId = req.query.meterId ? sanitizeAlphanumeric(String(req.query.meterId), 50) : '';
    if (req.query.meterId !== undefined && !meterId) validationErrors.push(validationError('meterId', 'meterId must be alphanumeric (max 50 chars)'));

    // status must be one of the known enum values
    const ALLOWED_STATUSES = new Set(['pending', 'scheduled', 'processing', 'completed', 'failed', 'cancelled', 'paused']);
    const rawStatus = req.query.status ? sanitizeString(String(req.query.status), 20).toLowerCase() : '';
    if (rawStatus && !ALLOWED_STATUSES.has(rawStatus)) {
      validationErrors.push(validationError('status', `status must be one of: ${[...ALLOWED_STATUSES].join(', ')}`));
    }
    const status = ALLOWED_STATUSES.has(rawStatus) ? rawStatus : '';

    // search — strip control chars, keep reasonable length
    const search = req.query.search ? sanitizeDescription(String(req.query.search), 200).toLowerCase() : '';

    // sortBy must be one of the known values
    const ALLOWED_SORT = new Set(['date-desc', 'date-asc', 'amount-asc', 'amount-desc']);
    const rawSortBy = req.query.sortBy ? sanitizeString(String(req.query.sortBy), 20) : 'date-desc';
    if (req.query.sortBy !== undefined && !ALLOWED_SORT.has(rawSortBy)) {
      validationErrors.push(validationError('sortBy', `sortBy must be one of: ${[...ALLOWED_SORT].join(', ')}`));
    }
    const sortBy = ALLOWED_SORT.has(rawSortBy) ? rawSortBy : 'date-desc';

    // ── Numeric range filters ───────────────────────────────────────────────
    const minAmount = req.query.minAmount !== undefined ? sanitizePositiveNumber(req.query.minAmount) : NaN;
    const maxAmount = req.query.maxAmount !== undefined ? sanitizePositiveNumber(req.query.maxAmount) : NaN;

    if (req.query.minAmount !== undefined && Number.isNaN(minAmount)) validationErrors.push(validationError('minAmount', 'minAmount must be a positive number'));
    if (req.query.maxAmount !== undefined && Number.isNaN(maxAmount)) validationErrors.push(validationError('maxAmount', 'maxAmount must be a positive number'));
    if (!Number.isNaN(minAmount) && !Number.isNaN(maxAmount) && minAmount > maxAmount) {
      validationErrors.push(validationError('minAmount', 'minAmount must be less than or equal to maxAmount'));
    }

    // ── Date filters — strict ISO 8601 (YYYY-MM-DD or full timestamp) ───────
    const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?)?$/;

    let startDateObj: Date | null = null;
    if (req.query.startDate !== undefined) {
      const raw = sanitizeString(String(req.query.startDate), 32);
      if (!ISO_DATE_RE.test(raw)) {
        validationErrors.push(validationError('startDate', 'startDate must be a valid ISO 8601 date (YYYY-MM-DD or YYYY-MM-DDTHH:mm:ssZ)'));
      } else {
        const d = new Date(raw);
        if (Number.isNaN(d.getTime())) {
          validationErrors.push(validationError('startDate', 'startDate is not a valid calendar date'));
        } else {
          startDateObj = d;
        }
      }
    }

    let endDateObj: Date | null = null;
    if (req.query.endDate !== undefined) {
      const raw = sanitizeString(String(req.query.endDate), 32);
      if (!ISO_DATE_RE.test(raw)) {
        validationErrors.push(validationError('endDate', 'endDate must be a valid ISO 8601 date (YYYY-MM-DD or YYYY-MM-DDTHH:mm:ssZ)'));
      } else {
        const d = new Date(raw);
        if (Number.isNaN(d.getTime())) {
          validationErrors.push(validationError('endDate', 'endDate is not a valid calendar date'));
        } else {
          endDateObj = d;
        }
      }
    }

    if (startDateObj && endDateObj && startDateObj > endDateObj) {
      validationErrors.push(validationError('startDate', 'startDate must be before or equal to endDate'));
    }

    // ── Return early if any parameter is invalid ────────────────────────────
    if (validationErrors.length > 0) {
      throw badRequest('Validation failed', { errors: validationErrors });
    }

    // ── Build parameterised WHERE clause ────────────────────────────────────
    // All user-supplied values are bound via $N params — never interpolated.
    const whereParts: string[] = ['1=1'];
    const params: Array<string | number | Date> = [];
    let paramIndex = 1;

    if (userId) {
      whereParts.push('user_id::text = $' + paramIndex);
      params.push(userId);
      paramIndex += 1;
    }
    if (meterId) {
      whereParts.push('meter_id ILIKE $' + paramIndex);
      params.push('%' + meterId + '%');
      paramIndex += 1;
    }
    if (status) {
      whereParts.push('status::text = $' + paramIndex);
      params.push(status);
      paramIndex += 1;
    }
    if (search) {
      // Each ILIKE clause needs its own parameter slot
      whereParts.push(
        '(transaction_hash ILIKE $' + paramIndex +
        ' OR meter_id ILIKE $' + (paramIndex + 1) +
        ' OR id::text ILIKE $' + (paramIndex + 2) + ')'
      );
      const pattern = '%' + search + '%';
      params.push(pattern, pattern, pattern);
      paramIndex += 3;
    }
    if (!Number.isNaN(minAmount)) {
      whereParts.push('amount >= $' + paramIndex);
      params.push(minAmount);
      paramIndex += 1;
    }
    if (!Number.isNaN(maxAmount)) {
      whereParts.push('amount <= $' + paramIndex);
      params.push(maxAmount);
      paramIndex += 1;
    }
    if (startDateObj) {
      whereParts.push('created_at >= $' + paramIndex);
      params.push(startDateObj);
      paramIndex += 1;
    }
    if (endDateObj) {
      whereParts.push('created_at <= $' + paramIndex);
      params.push(endDateObj);
      paramIndex += 1;
    }

    const whereClause = whereParts.join(' AND ');
    const orderClause =
      sortBy === 'date-asc'    ? 'created_at ASC'  :
      sortBy === 'amount-asc'  ? 'amount ASC'       :
      sortBy === 'amount-desc' ? 'amount DESC'      :
      'created_at DESC';

    const countResult = await database.query(
      'SELECT COUNT(*)::int AS total_records FROM payments WHERE ' + whereClause,
      params
    );
    const totalRecords = Number(countResult.rows?.[0]?.total_records ?? 0);

    const recordsResult = await database.query(
      'SELECT' +
      '  id::text AS id,' +
      '  meter_id AS "meterId",' +
      '  amount::numeric AS amount,' +
      '  CASE' +
      '    WHEN status::text = \'confirmed\' THEN \'completed\'' +
      '    WHEN status::text = \'queued\'    THEN \'scheduled\'' +
      '    ELSE status::text' +
      '  END AS status,' +
      '  created_at AS "scheduledDate",' +
      '  confirmed_at AS "actualPaymentDate",' +
      '  transaction_hash AS "transactionId",' +
      '  metadata->>\'errorMessage\' AS "errorMessage",' +
      '  COALESCE((metadata->>\'retryCount\')::int, 0) AS "retryCount",' +
      '  created_at AS "createdAt"' +
      ' FROM payments' +
      ' WHERE ' + whereClause +
      ' ORDER BY ' + orderClause +
      ' LIMIT $' + paramIndex + ' OFFSET $' + (paramIndex + 1),
      [...params, limit, offset]
    );

    let records: PaymentHistoryRecord[] = recordsResult.rows.map((row: any) => ({
      id: row.id,
      scheduleId: '',
      meterId: row.meterId,
      amount: Number(row.amount),
      status: row.status,
      scheduledDate: new Date(row.scheduledDate).toISOString(),
      actualPaymentDate: row.actualPaymentDate ? new Date(row.actualPaymentDate).toISOString() : undefined,
      transactionId: row.transactionId || undefined,
      errorMessage: row.errorMessage || undefined,
      retryCount: Number(row.retryCount) || 0,
      createdAt: new Date(row.createdAt).toISOString()
    }));

    if (totalRecords === 0 && records.length === 0) {
      const mockHistory = buildMockPaymentHistory(userId || 'default-user', 2000);
      records = mockHistory.slice(offset, offset + limit);
    }

    const totalPages = Math.max(1, Math.ceil(Math.max(totalRecords, records.length) / limit));
    return res.status(200).json({
      success: true,
      data: {
        records,
        pagination: {
          page,
          limit,
          totalRecords: Math.max(totalRecords, records.length),
          totalPages,
          hasNextPage: page < totalPages,
          hasPreviousPage: page > 1
        }
      }
    });
  }

app.get('/api/v1/payment/history', asyncRoute(handlePaymentHistory));
app.get('/api/v2/payment/history', asyncRoute(handlePaymentHistory));

app.get('/api/v1/payment/:meterId', asyncRoute(async (req, res) => {
  const meterId = sanitizeAlphanumeric(req.params.meterId, 50);
  if (!meterId) throw badRequest('Invalid Meter ID format');

  const NepaClient = await import('../packages/nepa_client_v2');
  const client = new NepaClient.Client({
    ...NepaClient.networks.testnet,
    rpcUrl: envConfig.RPC_URL_TESTNET || 'https://soroban-testnet.stellar.org',
  });
  const result = await client.get_total_paid({ meter_id: meterId });
  const totalPaid = Number(result.result);

  return res.status(200).json({
    success: true,
    data: { meterId, totalPaid, network: envConfig.NETWORK || 'testnet' },
  });
}));

app.get('/api/v2/payment/:meterId', asyncRoute(async (req, res) => {
  const meterId = sanitizeAlphanumeric(req.params.meterId, 50);
  if (!meterId) throw badRequest('Invalid Meter ID format');

  const NepaClient = await import('../packages/nepa_client_v2');
  const client = new NepaClient.Client({
    ...NepaClient.networks.testnet,
    rpcUrl: envConfig.RPC_URL_TESTNET || 'https://soroban-testnet.stellar.org',
  });
  const result = await client.get_total_paid({ meter_id: meterId });
  const totalPaid = Number(result.result);

  return res.status(200).json({
    success: true,
    data: { meterId, totalPaid, network: envConfig.NETWORK || 'testnet' },
  });
}));

// Centralized error handling middleware — catches AppError and other exceptions
app.use(apiErrorHandler);

app.use(StandardErrorHandler.handle());
app.use('*', (req: Request, res: Response) => {
  res.status(404).json({ success: false, error: 'Endpoint not found', requestId: (req as any).requestId });
});

function getAllowedOrigins(): string[] {
  const origins = [...config.cors.allowedOrigins];
  if (envConfig.NODE_ENV === 'development') origins.push('http://localhost:3000', 'http://localhost:5173');
  else if (envConfig.NODE_ENV === 'production' && envConfig.FRONTEND_URL) origins.push(envConfig.FRONTEND_URL);
  return origins.filter((origin) => origin.trim().length > 0);
}

function buildMockPaymentHistory(userId: string, recordCount: number): PaymentHistoryRecord[] {
  const statuses: PaymentHistoryStatus[] = ['completed', 'pending', 'scheduled', 'processing', 'failed', 'cancelled', 'paused'];
  const records: PaymentHistoryRecord[] = [];
  const now = Date.now();

  for (let i = 0; i < recordCount; i += 1) {
    const status = statuses[i % statuses.length];
    const amount = Number((10 + ((i * 17) % 300) + ((i % 5) * 0.37)).toFixed(2));
    const scheduledDate = new Date(now - i * 6 * 60 * 60 * 1000);
    const actualPaymentDate = status === 'completed' ? new Date(scheduledDate.getTime() + 30 * 60 * 1000).toISOString() : undefined;
    const transactionId = status === 'completed' || status === 'processing'
      ? `tx_${userId}_${String(i).padStart(6, '0')}`
      : undefined;
    const errorMessage = status === 'failed' ? 'Payment gateway timeout' : undefined;

    records.push({
      id: `payment_${userId}_${String(i).padStart(6, '0')}`,
      scheduleId: '',
      meterId: `METER-${String((i % 75) + 1).padStart(3, '0')}`,
      amount,
      status,
      scheduledDate: scheduledDate.toISOString(),
      actualPaymentDate,
      transactionId,
      errorMessage,
      retryCount: status === 'failed' ? (i % 3) + 1 : 0,
      createdAt: scheduledDate.toISOString()
    });
  }

  return records;
}

function startServer() {
  const httpsEnabled = config.server.httpsEnabled;
  const nodeEnv = config.server.nodeEnv;

  if (httpsEnabled && nodeEnv === 'production') {
    const sslOptions = {
      key: fs.readFileSync(config.server.sslKeyPath!),
      cert: fs.readFileSync(config.server.sslCertPath!),
      ca: fs.readFileSync(config.server.sslCaPath!),
    };
    https.createServer(sslOptions, app).listen(443, () => {
      logger.info('HTTPS Production Server running on port 443', { environment: nodeEnv, network: envConfig.NETWORK, origins: getAllowedOrigins(), rateLimit: `${RATE_LIMIT_CONFIG.maxRequests} req/${RATE_LIMIT_CONFIG.windowMs / 1000}s` });
    });
    const httpApp = express();
    httpApp.use((req, res) => { res.redirect(301, `https://${req.headers.host}${req.url}`); });
    httpApp.listen(80, () => { logger.info('HTTP redirect server running on port 80'); });
  } else {
    app.listen(PORT, () => { logger.info(`Wata-Board API running on port ${PORT}`, { environment: nodeEnv, network: envConfig.NETWORK, origins: getAllowedOrigins() }); });
  }
  startWebsocketService();
}

if (process.env.NODE_ENV !== 'test') {
  startServer();
}
export default app;
export { paymentService, multiProviderPaymentService };
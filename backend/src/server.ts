import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import https from 'https';
import fs from 'fs';
import { PaymentService, PaymentRequest } from './payment-service';
import { RateLimitConfig } from './rate-limiter';
import logger from './utils/logger';
import { HealthService } from './utils/health';
import { metricsCollector } from './middleware/metrics';
import { tieredRateLimiter } from './middleware/rateLimiter';
import monitoringRoutes from './routes/monitoring';
import upgradeRoutes from './routes/upgrade';
import currencyRoutes from './routes/currency';
import providerRoutes from './routes/providers';
import { apiErrorHandler } from './middleware/errorHandler';
import { StandardErrorHandler, ErrorHandlerUtils, requestContextMiddleware, handleUnhandledRejections } from './utils/standardErrorHandler';
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
import { captureException } from './utils/errorTracker';
import { envConfig } from './utils/env';
import { config } from './config/appConfig';
import { sanitizeString, sanitizeAlphanumeric, sanitizePositiveNumber, validationError, type ValidationError } from './utils/sanitize';
import realTimeMonitoringRoutes from './routes/realTimeMonitoring';

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
    if (envConfig.NODE_ENV === 'development') {
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
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use((req, res, next) => {
  logger.info('Incoming HTTP Request', { method: req.method, path: req.path, ip: req.ip, userAgent: req.get('user-agent') });
  next();
});

app.use(metricsCollector.middleware());
app.use('/api/payment', tieredRateLimiter.middleware());

app.use('/api/monitoring', monitoringRoutes);
app.use('/api/real-time-monitoring', realTimeMonitoringRoutes);
app.use('/api/currency', currencyRoutes);
app.use('/api/upgrade', upgradeRoutes);
app.use('/api/providers', providerRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/config', configRoutes);
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

app.get('/health/full', async (_req, res) => {
  try {
    const fullHealth = await HealthService.getFullHealth();
    const status = fullHealth.status === 'UP' ? 200 : 503;
    res.status(status).json(fullHealth);
  } catch (error) {
    logger.error('Health check full: Failed', { error });
    res.status(500).json({ status: 'DOWN', error: 'Diagnostics failed' });
  }
});

app.post('/api/payment', async (req, res) => {
  try {
    const raw = req.body;
    const errors: ValidationError[] = [];
    const meter_id = sanitizeAlphanumeric(raw.meter_id, 50);
    if (!meter_id) errors.push(validationError('meter_id', 'meter_id must be an alphanumeric string (max 50 chars)'));
    const amount = sanitizePositiveNumber(raw.amount);
    if (Number.isNaN(amount)) errors.push(validationError('amount', 'amount must be a positive number'));
    const userId = sanitizeAlphanumeric(raw.userId, 100);
    if (!userId) errors.push(validationError('userId', 'userId must be an alphanumeric string (max 100 chars)'));
    if (errors.length > 0) return res.status(400).json({ success: false, errors });

    const paymentRequest: PaymentRequest = { meter_id, amount, userId };
    const result = await paymentService.processPayment(paymentRequest);
    res.set('X-Rate-Limit-Remaining', result.rateLimitInfo?.remainingRequests?.toString() || '0');

    if ((result as any).success) {
      if ((result as any).transactionId) await updateTransactionStatus((result as any).transactionId, 'confirmed');
      return res.status(200).json({ success: true, transactionId: (result as any).transactionId, rateLimitInfo: { remainingRequests: result.rateLimitInfo?.remainingRequests, resetTime: result.rateLimitInfo?.resetTime } });
    } else {
      if ((result as any).transactionId) await updateTransactionStatus((result as any).transactionId, 'failed');
      if ((result as any).error?.includes('Rate limit exceeded')) return res.status(429).json({ success: false, error: (result as any).error, rateLimitInfo: result.rateLimitInfo });
      if ((result as any).error?.includes('queued')) return res.status(202).json({ success: false, error: (result as any).error, rateLimitInfo: result.rateLimitInfo });
      return res.status(400).json({ success: false, error: (result as any).error, rateLimitInfo: result.rateLimitInfo });
    }
  } catch (error) {
    logger.error('Payment processing exception', { error, body: req.body });
    void captureException(error, { source: 'payment-route', body: req.body });
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

app.post('/api/payment/multi-provider', async (req, res) => {
  try {
    const { meter_id, amount, userId, providerId } = req.body;
    if (!meter_id || !amount || !userId || !providerId) {
      return res.status(400).json({ success: false, error: 'Missing required fields: meter_id, amount, userId, providerId' });
    }
    if (typeof meter_id !== 'string' || typeof amount !== 'number' || typeof userId !== 'string' || typeof providerId !== 'string') {
      return res.status(400).json({ success: false, error: 'Invalid field types' });
    }
    if (amount <= 0) return res.status(400).json({ success: false, error: 'Amount must be greater than 0' });

    const paymentRequest: ProviderPaymentRequest = { meter_id: meter_id.trim(), amount, userId: userId.trim(), providerId: providerId.trim() };
    const result = await multiProviderPaymentService.processPayment(paymentRequest);
    res.set('X-Rate-Limit-Remaining', result.rateLimitInfo?.remainingRequests?.toString() || '0');

    if (result.success) {
      if (result.transactionId) await updateTransactionStatus(result.transactionId, 'confirmed');
      return res.status(200).json({ success: true, transactionId: result.transactionId, providerId: result.providerId, rateLimitInfo: { remainingRequests: result.rateLimitInfo?.remainingRequests, resetTime: result.rateLimitInfo?.resetTime } });
    } else {
      if (result.transactionId) await updateTransactionStatus(result.transactionId, 'failed');
      if (result.error?.includes('Rate limit exceeded')) return res.status(429).json({ success: false, error: result.error, providerId: result.providerId, rateLimitInfo: result.rateLimitInfo });
      if (result.error?.includes('queued')) return res.status(202).json({ success: false, error: result.error, providerId: result.providerId, rateLimitInfo: result.rateLimitInfo });
      return res.status(400).json({ success: false, error: result.error, providerId: result.providerId, rateLimitInfo: result.rateLimitInfo });
    }
  } catch (error) {
    logger.error('Multi-provider payment processing exception', { error, body: req.body });
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

app.get('/api/rate-limit/:userId', (req, res) => {
  try {
    const userId = sanitizeAlphanumeric(req.params.userId, 100);
    if (!userId) return res.status(400).json({ success: false, error: 'Invalid User ID format' });
    const status = paymentService.getRateLimitStatus(userId);
    const queueLength = paymentService.getQueueLength(userId);
    return res.status(200).json({ success: true, data: { ...status, queueLength } });
  } catch (error) {
    logger.error('Rate limit query failed', { error, userId: req.params.userId });
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

app.get('/api/analytics/:userId', (req, res) => {
  try {
    const userId = sanitizeAlphanumeric(req.params.userId, 100);
    if (!userId) return res.status(400).json({ success: false, error: 'Invalid User ID format' });
    const analytics = AnalyticsService.generateReport(userId);
    return res.status(200).json(analytics);
  } catch (error) {
    logger.error('Analytics report generation failed', { error, userId: req.params.userId });
    return res.status(500).json({ success: false, error: 'Failed to generate analytics report' });
  }
});

app.get('/api/transaction-status/:transactionId', async (req, res) => {
  try {
    const transactionId = sanitizeString(req.params.transactionId, 64).replace(/[^a-fA-F0-9]/g, '');
    if (!transactionId || transactionId.length !== 64) {
      return res.status(400).json({ success: false, error: 'Invalid transaction ID format' });
    }
    const { getTransactionDetails } = await import('./services/websocketService');
    const details = await getTransactionDetails(transactionId);
    if (!details) {
      return res.status(404).json({ success: false, error: 'Transaction not found' });
    }
    return res.status(200).json({ 
      success: true, 
      transactionId, 
      status: details.status,
      timestamp: details.timestamp,
      blockNumber: details.blockNumber,
      confirmations: details.confirmations,
      explorerUrl: details.explorerUrl
    });
  } catch (error) {
    logger.error('Transaction status query failed', { error, transactionId: req.params.transactionId });
    return res.status(500).json({ success: false, error: 'Unable to retrieve transaction status' });
  }
});

app.get('/api/user/kyc/:userId', async (req, res) => {
  try {
    const userId = sanitizeAlphanumeric(req.params.userId, 100);
    if (!userId) return res.status(400).json({ success: false, error: 'Invalid user ID' });
    const status = await kycService.getStatus(userId);
    return res.status(200).json({ success: true, status });
  } catch (error) {
    logger.error('KYC status check failed', { error, userId: req.params.userId });
    return res.status(500).json({ success: false, error: 'Failed to get KYC status' });
  }
});

app.post('/api/user/kyc/submit', async (req, res) => {
  try {
    const { userId, documentType } = req.body;
    const sanitizedUserId = sanitizeAlphanumeric(userId, 100);
    if (!sanitizedUserId) return res.status(400).json({ success: false, error: 'Invalid user ID' });
    const data = await kycService.submitKYC(sanitizedUserId, documentType);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    logger.error('KYC submission failed', { error, userId: req.body.userId });
    return res.status(500).json({ success: false, error: 'Failed to submit KYC' });
  }
});

app.get('/api/user/export-data/:userId', async (req, res) => {
  try {
    const userId = sanitizeAlphanumeric(req.params.userId, 100);
    if (!userId) return res.status(400).json({ success: false, error: 'Invalid user ID' });
    const userData = { userId, kycStatus: await kycService.getStatus(userId), exportDate: new Date().toISOString(), disclaimer: 'Mock export' };
    return res.status(200).json({ success: true, data: userData });
  } catch (error) {
    logger.error('Data export failed', { error, userId: req.params.userId });
    return res.status(500).json({ success: false, error: 'Failed to export data' });
  }
});

app.delete('/api/user/delete-data/:userId', async (req, res) => {
  try {
    const userId = sanitizeAlphanumeric(req.params.userId, 100);
    if (!userId) return res.status(400).json({ success: false, error: 'Invalid user ID' });
    logger.info(`GDPR: Deleting all data for user ${userId}`);
    return res.status(200).json({ success: true, message: 'Data deletion request received' });
  } catch (error) {
    logger.error('Data erasure failed', { error, userId: req.params.userId });
    return res.status(500).json({ success: false, error: 'Failed to initiate data deletion' });
  }
});

app.get('/api/payment/:meterId', async (req, res) => {
  try {
    const meterId = sanitizeAlphanumeric(req.params.meterId, 50);
    if (!meterId) return res.status(400).json({ success: false, error: 'Invalid Meter ID format' });
    logger.warn('Contract client not available - returning mock data', { meterId });
    return res.status(200).json({ success: true, data: { meterId, totalPaid: 0, network: envConfig.NETWORK || 'testnet' } });
  } catch (error) {
    logger.error('Total paid query failed', { error, meterId: req.params.meterId });
    return res.status(500).json({ success: false, error: 'Failed to retrieve payment information' });
  }
});

app.use(StandardErrorHandler.handle());
app.use('*', (_req, res) => { res.status(404).json({ success: false, error: 'Endpoint not found' }); });

function getAllowedOrigins(): string[] {
  const origins = [...config.cors.allowedOrigins];
  if (envConfig.NODE_ENV === 'development') origins.push('http://localhost:3000', 'http://localhost:5173');
  else if (envConfig.NODE_ENV === 'production' && envConfig.FRONTEND_URL) origins.push(envConfig.FRONTEND_URL);
  return origins.filter((origin) => origin.trim().length > 0);
}

function getNetworkConfig() {
  const network = envConfig.NETWORK;
  if (network === 'mainnet') {
    return { networkPassphrase: envConfig.NETWORK_PASSPHRASE_MAINNET, contractId: envConfig.CONTRACT_ID_MAINNET, rpcUrl: envConfig.RPC_URL_MAINNET };
  }
  return { networkPassphrase: envConfig.NETWORK_PASSPHRASE_TESTNET, contractId: envConfig.CONTRACT_ID_TESTNET, rpcUrl: envConfig.RPC_URL_TESTNET };
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

startServer();
export default app;
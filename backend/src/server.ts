import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import https from 'https';
import fs from 'fs';
import { PaymentService, PaymentRequest } from './payment-service';
import { RateLimiter, RateLimitConfig } from './rate-limiter';
import logger, { auditLogger } from './utils/logger';
import { HealthService } from './utils/health';
import { metricsCollector } from './middleware/metrics';
import { tieredRateLimiter } from './middleware/rateLimiter';
import monitoringRoutes from './routes/monitoring';
import upgradeRoutes from './routes/upgrade';
import currencyRoutes from './routes/currency';
import { handleClientError, apiErrorHandler } from './middleware/errorHandler';
import { AnalyticsService } from './services/analyticsService';
import { getTransactionStatus, startWebsocketService, updateTransactionStatus } from './services/websocketService';
// Validates all environment variables at startup — throws on fatal misconfiguration
import { envConfig } from './utils/env';

// Rate limiting configuration
const RATE_LIMIT_CONFIG: RateLimitConfig = {
  windowMs: 60 * 1000,  // 1 minute
  maxRequests: 5,        // 5 transactions per minute
  queueSize: 10          // Allow 10 queued requests
};

// Initialize payment service with rate limiting
const paymentService = new PaymentService(RATE_LIMIT_CONFIG);

// Create Express app
const app = express();
const PORT = envConfig.PORT;

// Security middleware with enhanced HTTPS support
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
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
}));

// CORS configuration with environment-based settings
const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);

    // Get allowed origins from environment or use defaults
    const allowedOrigins = getAllowedOrigins();
    
    if (envConfig.NODE_ENV === 'development') {
      // In development, allow localhost with any port
      if (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
        return callback(null, true);
      }
    }

    // Check if origin is in allowed list
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      logger.warn('CORS: Origin not allowed', { origin });
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true, // Allow cookies and credentials
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Origin',
    'X-Requested-With',
    'Content-Type',
    'Accept',
    'Authorization',
    'Cache-Control',
    'Pragma'
  ],
  exposedHeaders: ['X-Total-Count', 'X-Rate-Limit-Remaining'],
  maxAge: 86400 // Cache preflight requests for 24 hours
};

// Apply CORS middleware
app.use(cors(corsOptions));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Client-side error logging endpoint
app.post('/api/client-errors', handleClientError);

// Request logging middleware
app.use((req, res, next) => {
  logger.info('Incoming HTTP Request', { 
    method: req.method, 
    path: req.path, 
    ip: req.ip,
    userAgent: req.get('user-agent')
  });
  next();
});

// ── Metrics collection (must be before route handlers) ──
app.use(metricsCollector.middleware());

// ── Tiered rate limiting on payment endpoints (#85) ──
app.use('/api/payment', tieredRateLimiter.middleware());

// ── New route groups (#99, #94, #101) ──
app.use('/api/monitoring', monitoringRoutes);
app.use('/api/currency', currencyRoutes);
app.use('/api/upgrade', upgradeRoutes);

// Health check endpoints (Liveness, Readiness, Full)

/**
 * GET /health
 * Basic liveness check (fast, no heavy resource checking).
 */
app.get('/health', (req, res) => {
  res.status(200).json(HealthService.getLiveness());
});

/**
 * GET /health/ready
 * Readiness check ensures the app is ready to take traffic and connect to dependencies.
 */
app.get('/health/ready', async (req, res) => {
  const readiness = await HealthService.getReadiness();
  const status = readiness.status === 'UP' ? 200 : 503;
  res.status(status).json(readiness);
});

/**
 * GET /health/full
 * Full diagnostics (requires appropriate authorization in production).
 */
app.get('/health/full', async (req, res) => {
  try {
    const fullHealth = await HealthService.getFullHealth();
    const status = fullHealth.status === 'UP' ? 200 : 503;
    res.status(status).json(fullHealth);
  } catch (error) {
    logger.error('Health check full: Failed', { error });
    res.status(500).json({ status: 'DOWN', error: 'Diagnostics failed' });
  }
});

// API Routes

/**
 * POST /api/payment
 * Process a utility payment with rate limiting
 */
app.post('/api/payment', async (req, res) => {
  try {
    const { meter_id, amount, userId } = req.body;

    // Validate request body
    if (!meter_id || !amount || !userId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: meter_id, amount, userId'
      });
    }

    if (typeof meter_id !== 'string' || typeof amount !== 'number' || typeof userId !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Invalid field types: meter_id (string), amount (number), userId (string)'
      });
    }

    if (amount <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Amount must be greater than 0'
      });
    }

    const paymentRequest: PaymentRequest = {
      meter_id: meter_id.trim(),
      amount,
      userId: userId.trim()
    };

    const result = await paymentService.processPayment(paymentRequest);

    // Add CORS headers and rate limit info to response
    res.set('X-Rate-Limit-Remaining', result.rateLimitInfo?.remainingRequests?.toString() || '0');

    if (result.success) {
      if (result.transactionId) {
        updateTransactionStatus(result.transactionId, 'confirmed');
      }
      return res.status(200).json({
        success: true,
        transactionId: result.transactionId,
        rateLimitInfo: {
          remainingRequests: result.rateLimitInfo?.remainingRequests,
          resetTime: result.rateLimitInfo?.resetTime
        }
      });
    } else {
      if (result.transactionId) {
        updateTransactionStatus(result.transactionId, 'failed');
      }
      // Handle rate limit errors with appropriate status codes
      if (result.error?.includes('Rate limit exceeded')) {
        return res.status(429).json({
          success: false,
          error: result.error,
          rateLimitInfo: result.rateLimitInfo
        });
      } else if (result.error?.includes('queued')) {
        return res.status(202).json({
          success: false,
          error: result.error,
          rateLimitInfo: result.rateLimitInfo
        });
      } else {
        return res.status(400).json({
          success: false,
          error: result.error,
          rateLimitInfo: result.rateLimitInfo
        });
      }
    }
  } catch (error) {
    logger.error('Payment processing exception', { error, body: req.body });
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * GET /api/rate-limit/:userId
 * Get rate limit status for a user
 */
app.get('/api/rate-limit/:userId', (req, res) => {
  try {
    const { userId } = req.params;
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'User ID is required'
      });
    }

    const status = paymentService.getRateLimitStatus(userId);
    const queueLength = paymentService.getQueueLength(userId);

    return res.status(200).json({
      success: true,
      data: {
        ...status,
        queueLength
      }
    });
  } catch (error) {
    logger.error('Rate limit query failed', { error, userId: req.params.userId });
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * GET /api/analytics/:userId
 * Provide analytics insights for a user
 */
app.get('/api/analytics/:userId', (req, res) => {
  try {
    const { userId } = req.params;
    if (!userId) {
      return res.status(400).json({ success: false, error: 'User ID is required' });
    }

    const analytics = AnalyticsService.generateReport(userId);
    return res.status(200).json(analytics);
  } catch (error) {
    logger.error('Analytics report generation failed', { error, userId: req.params.userId });
    return res.status(500).json({ success: false, error: 'Failed to generate analytics report' });
  }
});

/**
 * GET /api/transaction-status/:transactionId
 * Return current transaction status for real-time updates.
 */
app.get('/api/transaction-status/:transactionId', (req, res) => {
  try {
    const { transactionId } = req.params;
    if (!transactionId) {
      return res.status(400).json({ success: false, error: 'Transaction ID is required' });
    }

    const status = getTransactionStatus(transactionId);
    return res.status(200).json({ success: true, transactionId, status });
  } catch (error) {
    logger.error('Transaction status query failed', { error, transactionId: req.params.transactionId });
    return res.status(500).json({ success: false, error: 'Unable to retrieve transaction status' });
  }
});

/**
 * GET /api/payment/:meterId
 * Get total paid amount for a meter
 */
app.get('/api/payment/:meterId', async (req, res) => {
  try {
    const { meterId } = req.params;
    
    if (!meterId) {
      return res.status(400).json({
        success: false,
        error: 'Meter ID is required'
      });
    }

    // Import client dynamically
    const NepaClient = await import('../contract/nepa_client_v2');
    const networkConfig = getNetworkConfig();
    
    const client = new NepaClient.Client({
      networkPassphrase: networkConfig.networkPassphrase,
      contractId: networkConfig.contractId,
      rpcUrl: networkConfig.rpcUrl,
    });

    const total = await client.get_total_paid({ meter_id: meterId });
    const formattedTotal = Number(total.result);

    return res.status(200).json({
      success: true,
      data: {
        meterId,
        totalPaid: formattedTotal,
        network: networkConfig.networkPassphrase.includes('Test') ? 'testnet' : 'mainnet'
      }
    });
  } catch (error) {
    logger.error('Total paid query failed', { error, meterId: req.params.meterId });
    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve payment information'
    });
  }
});

// Error handling middleware
app.use(apiErrorHandler);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found'
  });
});

// Helper functions

function getAllowedOrigins(): string[] {
  const origins = [...envConfig.ALLOWED_ORIGINS];

  // Add default origins based on environment
  if (envConfig.NODE_ENV === 'development') {
    origins.push('http://localhost:3000', 'http://localhost:5173');
  } else if (envConfig.NODE_ENV === 'production') {
    if (envConfig.FRONTEND_URL) {
      origins.push(envConfig.FRONTEND_URL);
    }
  }

  return origins.filter(origin => origin.trim().length > 0);
}

function getNetworkConfig() {
  if (envConfig.NETWORK === 'mainnet') {
    return {
      networkPassphrase: envConfig.NETWORK_PASSPHRASE_MAINNET,
      contractId: envConfig.CONTRACT_ID_MAINNET,
      rpcUrl: envConfig.RPC_URL_MAINNET,
    };
  } else {
    return {
      networkPassphrase: envConfig.NETWORK_PASSPHRASE_TESTNET,
      contractId: envConfig.CONTRACT_ID_TESTNET,
      rpcUrl: envConfig.RPC_URL_TESTNET,
    };
  }
}

// Start server with HTTPS support
function startServer() {
  const { HTTPS_ENABLED: httpsEnabled, NODE_ENV: nodeEnv } = envConfig;

  if (httpsEnabled && nodeEnv === 'production') {
    // HTTPS configuration for production — paths already validated by envConfig
    const sslOptions = {
      key: fs.readFileSync(envConfig.SSL_KEY_PATH!),
      cert: fs.readFileSync(envConfig.SSL_CERT_PATH!),
      ca: envConfig.SSL_CA_PATH ? fs.readFileSync(envConfig.SSL_CA_PATH) : undefined,
    };

    // Create HTTPS server
    https.createServer(sslOptions, app).listen(443, () => {
      logger.info('🚀 HTTPS Production Server running on port 443', {
        environment: nodeEnv,
        network: envConfig.NETWORK,
        origins: getAllowedOrigins(),
        rateLimit: `${RATE_LIMIT_CONFIG.maxRequests} requests per ${RATE_LIMIT_CONFIG.windowMs / 1000} seconds`
      });
    });

    // Redirect HTTP to HTTPS
    const httpApp = express();
    httpApp.use((req, res) => {
      res.redirect(301, `https://${req.headers.host}${req.url}`);
    });
    httpApp.listen(80, () => {
      console.log('🔄 HTTP redirect server running on port 80');
    });
  } else {
    // Development / non-HTTPS server
    app.listen(PORT, () => {
      logger.info(`🚀 Wata-Board API Development Server running on port ${PORT}`, {
        environment: nodeEnv,
        network: envConfig.NETWORK,
        origins: getAllowedOrigins()
      });
    });
  }

  startWebsocketService();
}

startServer();

export default app;

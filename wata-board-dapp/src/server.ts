import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import https from 'https';
import fs from 'fs';
import { PaymentService, PaymentRequest } from './payment-service';
import { RateLimiter, RateLimitConfig } from './rate-limiter';
import { kycService, KYCStatus } from './services/kyc-service';
import logger, { auditLogger } from './utils/logger';


// Load environment variables
dotenv.config();

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
const PORT = process.env.PORT || 3001;

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
    
    if (process.env.NODE_ENV === 'development') {
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

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development'
  });
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
      res.status(200).json({
        success: true,
        transactionId: result.transactionId,
        rateLimitInfo: {
          remainingRequests: result.rateLimitInfo?.remainingRequests,
          resetTime: result.rateLimitInfo?.resetTime
        }
      });
    } else {
      // Handle rate limit errors with appropriate status codes
      if (result.error?.includes('Rate limit exceeded')) {
        res.status(429).json({
          success: false,
          error: result.error,
          rateLimitInfo: result.rateLimitInfo
        });
      } else if (result.error?.includes('queued')) {
        res.status(202).json({
          success: false,
          error: result.error,
          rateLimitInfo: result.rateLimitInfo
        });
      } else {
        res.status(400).json({
          success: false,
          error: result.error,
          rateLimitInfo: result.rateLimitInfo
        });
      }
    }
  } catch (error) {
    logger.error('Payment processing exception', { error, body: req.body });
    res.status(500).json({
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

    res.status(200).json({
      success: true,
      data: {
        ...status,
        queueLength
      }
    });
  } catch (error) {
    logger.error('Rate limit query failed', { error, userId: req.params.userId });
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
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
    const NepaClient = await import('../packages/nepa_client_v2');
    const networkConfig = getNetworkConfig();
    
    const client = new NepaClient.Client({
      networkPassphrase: networkConfig.networkPassphrase,
      contractId: networkConfig.contractId,
      rpcUrl: networkConfig.rpcUrl,
    });

    const total = await client.get_total_paid({ meter_id: meterId });
    const formattedTotal = Number(total.result);

    res.status(200).json({
      success: true,
      data: {
        meterId,
        totalPaid: formattedTotal,
        network: networkConfig.networkPassphrase.includes('Test') ? 'testnet' : 'mainnet'
      }
    });
  } catch (error) {
    logger.error('Total paid query failed', { error, meterId: req.params.meterId });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve payment information'
    });
  }
});

/**
 * GET /api/user/kyc/:userId
 * Get KYC status for a user
 */
app.get('/api/user/kyc/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const status = await kycService.getStatus(userId);
    res.status(200).json({ success: true, status });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to get KYC status' });
  }
});

/**
 * POST /api/user/kyc/submit
 * Submit KYC verification
 */
app.post('/api/user/kyc/submit', async (req, res) => {
  try {
    const { userId, documentType } = req.body;
    const data = await kycService.submitKYC(userId, documentType);
    res.status(200).json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to submit KYC' });
  }
});

/**
 * GET /api/user/export-data/:userId
 * Export user data (GDPR Right to Portability)
 */
app.get('/api/user/export-data/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    // Mock data export
    const userData = {
      userId,
      kycStatus: await kycService.getStatus(userId),
      exportDate: new Date().toISOString(),
      disclaimer: 'This is a mock export of your data held by Wata Board.'
    };
    res.status(200).json({ success: true, data: userData });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to export data' });
  }
});

/**
 * DELETE /api/user/delete-data/:userId
 * Delete user data (GDPR Right to Erasure)
 */
app.delete('/api/user/delete-data/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    // In a real system, you would delete records from the DB here
    console.log(`GDPR: Deleting all data for user ${userId}`);
    res.status(200).json({ 
      success: true, 
      message: 'Data deletion request received and is being processed.' 
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to initiate data deletion' });
  }
});


// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (err.name === 'UnauthorizedError') {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized'
    });
  }

  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json({
      success: false,
      error: 'CORS policy violation'
    });
  }
  
  logger.error('Unhandled server error', { err, method: req.method, path: req.path });
  res.status(500).json({
    success: false,
    error: 'Internal server error'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found'
  });
});

// Helper functions

function getAllowedOrigins(): string[] {
  const origins = process.env.ALLOWED_ORIGINS?.split(',') || [];
  
  // Add default origins based on environment
  if (process.env.NODE_ENV === 'development') {
    origins.push('http://localhost:3000', 'http://localhost:5173');
  } else if (process.env.NODE_ENV === 'production') {
    // Add production frontend URL
    const frontendUrl = process.env.FRONTEND_URL;
    if (frontendUrl) {
      origins.push(frontendUrl);
    }
  }
  
  return origins.filter(origin => origin.trim().length > 0);
}

function getNetworkConfig() {
  const network = process.env.NETWORK || 'testnet';
  
  if (network === 'mainnet') {
    return {
      networkPassphrase: process.env.NETWORK_PASSPHRASE_MAINNET || 'Public Global Stellar Network ; September 2015',
      contractId: process.env.CONTRACT_ID_MAINNET || '',
      rpcUrl: process.env.RPC_URL_MAINNET || 'https://soroban.stellar.org'
    };
  } else {
    return {
      networkPassphrase: process.env.NETWORK_PASSPHRASE_TESTNET || 'Test SDF Network ; September 2015',
      contractId: process.env.CONTRACT_ID_TESTNET || 'CDRRJ7IPYDL36YSK5ZQLBG3LICULETIBXX327AGJQNTWXNKY2UMDO4DA',
      rpcUrl: process.env.RPC_URL_TESTNET || 'https://soroban-testnet.stellar.org'
    };
  }
}

// Start server with HTTPS support
function startServer() {
  const httpsEnabled = process.env.HTTPS_ENABLED === 'true';
  const nodeEnv = process.env.NODE_ENV || 'development';

  if (httpsEnabled && nodeEnv === 'production') {
    // HTTPS configuration for production
    const sslOptions = {
      key: fs.readFileSync(process.env.SSL_KEY_PATH || '/etc/letsencrypt/live/yourdomain.com/privkey.pem'),
      cert: fs.readFileSync(process.env.SSL_CERT_PATH || '/etc/letsencrypt/live/yourdomain.com/fullchain.pem'),
      ca: fs.readFileSync(process.env.SSL_CA_PATH || '/etc/letsencrypt/live/yourdomain.com/chain.pem')
    };

    // Create HTTPS server
    https.createServer(sslOptions, app).listen(443, () => {
      logger.info('🚀 HTTPS Production Server running on port 443', {
        environment: nodeEnv,
        network: process.env.NETWORK || 'testnet',
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
    // Development HTTP server
    app.listen(PORT, () => {
      logger.info(`🚀 Wata-Board API Development Server running on port ${PORT}`, {
        environment: nodeEnv,
        network: process.env.NETWORK || 'testnet',
        origins: getAllowedOrigins()
      });
    });
  }
}

startServer();

export default app;

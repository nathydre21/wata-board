import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import https from 'https';
import fs from 'fs';
import { PaymentService, PaymentRequest, PaymentResult } from './payment-service';
import { RateLimiter, RateLimitConfig, RateLimitResult } from './rate-limiter';
import {
  PaymentResponse,
  PaymentInfo,
  HealthStatus,
  ApiResponse,
  ApiError,
  RateLimitInfo,
  getCurrentTimestamp,
  amountToString,
  amountToNumber,
  Network,
  Currency,
  isApiError
} from '../../shared/types';

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
      console.warn(`CORS: Origin ${origin} not allowed`);
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
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path} - ${req.ip}`);
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  const healthStatus: HealthStatus = {
    status: 'OK',
    timestamp: getCurrentTimestamp(),
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    network: process.env.NETWORK === 'mainnet' ? Network.MAINNET : Network.TESTNET
  };
  
  const response: ApiResponse<HealthStatus> = {
    success: true,
    data: healthStatus,
    timestamp: getCurrentTimestamp()
  };
  
  res.status(200).json(response);
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
      const errorResponse: ApiError = {
        success: false,
        error: 'Missing required fields: meter_id, amount, userId',
        code: 'MISSING_FIELDS',
        timestamp: getCurrentTimestamp()
      };
      return res.status(400).json(errorResponse);
    }

    if (typeof meter_id !== 'string' || typeof amount !== 'number' || typeof userId !== 'string') {
      const errorResponse: ApiError = {
        success: false,
        error: 'Invalid field types: meter_id (string), amount (number), userId (string)',
        code: 'INVALID_TYPES',
        details: { meter_id: typeof meter_id, amount: typeof amount, userId: typeof userId },
        timestamp: getCurrentTimestamp()
      };
      return res.status(400).json(errorResponse);
    }

    if (amount <= 0) {
      const errorResponse: ApiError = {
        success: false,
        error: 'Amount must be greater than 0',
        code: 'INVALID_AMOUNT',
        details: { amount },
        timestamp: getCurrentTimestamp()
      };
      return res.status(400).json(errorResponse);
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
      const response: ApiResponse<PaymentResponse> = {
        success: true,
        data: {
          success: true,
          transactionId: result.transactionId,
          rateLimitInfo: result.rateLimitInfo,
          timestamp: getCurrentTimestamp()
        },
        timestamp: getCurrentTimestamp()
      };
      res.status(200).json(response);
    } else {
      // Handle rate limit errors with appropriate status codes
      if (result.error?.includes('Rate limit exceeded')) {
        const errorResponse: ApiError = {
          success: false,
          error: result.error,
          code: 'RATE_LIMIT_EXCEEDED',
          details: result.rateLimitInfo,
          timestamp: getCurrentTimestamp()
        };
        res.status(429).json(errorResponse);
      } else if (result.error?.includes('queued')) {
        const errorResponse: ApiError = {
          success: false,
          error: result.error,
          code: 'PAYMENT_QUEUED',
          details: result.rateLimitInfo,
          timestamp: getCurrentTimestamp()
        };
        res.status(202).json(errorResponse);
      } else {
        const errorResponse: ApiError = {
          success: false,
          error: result.error,
          code: 'PAYMENT_FAILED',
          details: result.rateLimitInfo,
          timestamp: getCurrentTimestamp()
        };
        res.status(400).json(errorResponse);
      }
    }
  } catch (error) {
    console.error('Payment processing error:', error);
    const errorResponse: ApiError = {
      success: false,
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
      timestamp: getCurrentTimestamp()
    };
    res.status(500).json(errorResponse);
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
      const errorResponse: ApiError = {
        success: false,
        error: 'User ID is required',
        code: 'MISSING_USER_ID',
        timestamp: getCurrentTimestamp()
      };
      return res.status(400).json(errorResponse);
    }

    const status = paymentService.getRateLimitStatus(userId);
    const queueLength = paymentService.getQueueLength(userId);

    // Convert RateLimitResult to RateLimitInfo
    const rateLimitInfo: RateLimitInfo = {
      remainingRequests: status.remainingRequests,
      resetTime: status.resetTime.toISOString(),
      allowed: status.allowed,
      queued: status.queued,
      queuePosition: status.queuePosition,
      windowMs: 60000,
      maxRequests: 5
    };

    const response: ApiResponse<RateLimitInfo> = {
      success: true,
      data: {
        ...rateLimitInfo,
        queueLength
      },
      timestamp: getCurrentTimestamp()
    };
    res.status(200).json(response);
  } catch (error) {
    console.error('Rate limit status error:', error);
    const errorResponse: ApiError = {
      success: false,
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
      timestamp: getCurrentTimestamp()
    };
    res.status(500).json(errorResponse);
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
      const errorResponse: ApiError = {
        success: false,
        error: 'Meter ID is required',
        code: 'MISSING_METER_ID',
        timestamp: getCurrentTimestamp()
      };
      return res.status(400).json(errorResponse);
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
    const formattedTotal = amountToString(Number(total.result));

    const paymentInfo: PaymentInfo = {
      success: true,
      data: {
        meterId,
        totalPaid: formattedTotal,
        currency: Currency.XLM,
        network: networkConfig.networkPassphrase.includes('Test') ? Network.TESTNET : Network.MAINNET,
        lastUpdated: getCurrentTimestamp()
      },
      timestamp: getCurrentTimestamp()
    };
    
    res.status(200).json(paymentInfo);
  } catch (error) {
    console.error('Get total paid error:', error);
    const errorResponse: ApiError = {
      success: false,
      error: 'Failed to retrieve payment information',
      code: 'RETRIEVAL_ERROR',
      timestamp: getCurrentTimestamp()
    };
    res.status(500).json(errorResponse);
  }
});

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (err.name === 'UnauthorizedError') {
    const errorResponse: ApiError = {
      success: false,
      error: 'Unauthorized',
      code: 'UNAUTHORIZED',
      timestamp: getCurrentTimestamp()
    };
    return res.status(401).json(errorResponse);
  }

  if (err.message === 'Not allowed by CORS') {
    const errorResponse: ApiError = {
      success: false,
      error: 'CORS policy violation',
      code: 'CORS_VIOLATION',
      timestamp: getCurrentTimestamp()
    };
    return res.status(403).json(errorResponse);
  }

  console.error('Unhandled error:', err);
  const errorResponse: ApiError = {
    success: false,
    error: 'Internal server error',
    code: 'INTERNAL_ERROR',
    timestamp: getCurrentTimestamp()
  };
  res.status(500).json(errorResponse);
});

// 404 handler
app.use('*', (req, res) => {
  const errorResponse: ApiError = {
    success: false,
    error: 'Endpoint not found',
    code: 'NOT_FOUND',
    timestamp: getCurrentTimestamp()
  };
  res.status(404).json(errorResponse);
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
      console.log('� HTTPS Server running on port 443');
      console.log(`📝 Environment: ${nodeEnv}`);
      console.log(`🌐 Network: ${process.env.NETWORK || 'testnet'}`);
      console.log(`🔒 CORS enabled for origins: ${getAllowedOrigins().join(', ')}`);
      console.log(`⏱️  Rate limit: ${RATE_LIMIT_CONFIG.maxRequests} requests per ${RATE_LIMIT_CONFIG.windowMs / 1000} seconds`);
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
      console.log(`🚀 Wata-Board API Server running on port ${PORT}`);
      console.log(`📝 Environment: ${nodeEnv}`);
      console.log(`🌐 Network: ${process.env.NETWORK || 'testnet'}`);
      console.log(`🔒 CORS enabled for origins: ${getAllowedOrigins().join(', ')}`);
      console.log(`⏱️  Rate limit: ${RATE_LIMIT_CONFIG.maxRequests} requests per ${RATE_LIMIT_CONFIG.windowMs / 1000} seconds`);
    });
  }
}

startServer();

export default app;

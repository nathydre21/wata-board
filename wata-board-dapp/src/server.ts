import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { PaymentService, PaymentRequest } from './payment-service';
import { RateLimiter, RateLimitConfig } from './rate-limiter';
import { MigrationService } from './migration/MigrationService';
import { monitoringService } from './monitoring/MonitoringService';
import monitoringRoutes from './monitoring/MonitoringRoutes';

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

// Initialize migration service
const migrationService = new MigrationService();

// Create Express app
const app = express();
const PORT = process.env.PORT || 3001;

// Security middleware
app.use(helmet());

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

// Request logging middleware with monitoring
app.use((req, res, next) => {
  monitoringService.trackRequest();
  monitoringService.incrementConnections();
  // Simplified logging without console for TypeScript compatibility
  next();
});

// Enhanced health check endpoint with monitoring
app.get('/health', (req, res) => {
  const health = monitoringService.getHealthStatus();
  const statusCode = health.status === 'unhealthy' ? 503 : 200;
  
  res.status(statusCode).json({
    status: health.status,
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    environment: 'development', // Simplified for TypeScript compatibility
    monitoring: health
  });
});

// Add monitoring routes
app.use('/api/monitoring', monitoringRoutes);

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
    console.error('Payment processing error:', error);
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
        resetTime: status.resetTime?.toISOString?.() || status.resetTime,
        queueLength
      }
    });
  } catch (error) {
    console.error('Rate limit status error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * POST /api/migrations/run
 * Run all pending migrations
 */
app.post('/api/migrations/run', async (req, res) => {
  try {
    const results = await migrationService.runMigrations();
    
    const successCount = results.filter(r => r.success).length;
    const failureCount = results.filter(r => !r.success).length;
    
    res.status(200).json({
      success: failureCount === 0,
      data: {
        results,
        summary: {
          total: results.length,
          successful: successCount,
          failed: failureCount
        }
      }
    });
  } catch (error) {
    console.error('Migration error:', error);
    res.status(500).json({
      success: false,
      error: 'Migration failed'
    });
  }
});

/**
 * GET /api/migrations/status
 * Get migration status
 */
app.get('/api/migrations/status', (req, res) => {
  try {
    const status = migrationService.getStatus();
    res.status(200).json({
      success: true,
      data: status
    });
  } catch (error) {
    console.error('Migration status error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get migration status'
    });
  }
});

/**
 * GET /api/migrations/log
 * Get migration log
 */
app.get('/api/migrations/log', (req, res) => {
  try {
    const log = migrationService.getLog();
    res.status(200).json({
      success: true,
      data: log
    });
  } catch (error) {
    console.error('Migration log error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get migration log'
    });
  }
});

/**
 * POST /api/migrations/rollback/:version
 * Rollback a specific migration
 */
app.post('/api/migrations/rollback/:version', async (req, res) => {
  try {
    const { version } = req.params;
    const result = await migrationService.rollback(version);
    
    if (result.success) {
      res.status(200).json({
        success: true,
        data: result
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error,
        data: result
      });
    }
  } catch (error) {
    console.error('Migration rollback error:', error);
    res.status(500).json({
      success: false,
      error: 'Rollback failed'
    });
  }
});

/**
 * GET /api/payment/:meter_id
 * Get total paid amount for a meter
 */
app.get('/api/payment/:meter_id', async (req, res) => {
  try {
    const { meter_id } = req.params;
    
    if (!meter_id) {
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

    const total = await client.get_total_paid({ meter_id: meter_id });
    const formattedTotal = Number(total.result);

    res.status(200).json({
      success: true,
      data: {
        meter_id,
        totalPaid: formattedTotal,
        network: networkConfig.networkPassphrase.includes('Test') ? 'testnet' : 'mainnet'
      }
    });
  } catch (error) {
    console.error('Get total paid error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve payment information'
    });
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

  console.error('Unhandled error:', err);
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
  // Use shared network configuration
  try {
    const { getCurrentNetworkConfig } = require('../../shared/network-config');
    return getCurrentNetworkConfig();
  } catch (error) {
    // Fallback to environment variables if shared config is not available
    const network = process.env.NETWORK || 'testnet';
    
    if (network === 'mainnet') {
      return {
        networkPassphrase: process.env.NETWORK_PASSPHRASE_MAINNET || 'Public Global Stellar Network ; September 2015',
        contractId: process.env.CONTRACT_ID_MAINNET || '',
        rpcUrl: process.env.RPC_URL_MAINNET || 'https://soroban.stellar.org',
        networkType: 'mainnet' as const
      };
    } else {
      return {
        networkPassphrase: process.env.NETWORK_PASSPHRASE_TESTNET || 'Test SDF Network ; September 2015',
        contractId: process.env.CONTRACT_ID_TESTNET || 'CDRRJ7IPYDL36YSK5ZQLBG3LICULETIBXX327AGJQNTWXNKY2UMDO4DA',
        rpcUrl: process.env.RPC_URL_TESTNET || 'https://soroban-testnet.stellar.org',
        networkType: 'testnet' as const
      };
    }
  }
}

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Wata-Board API Server running on port ${PORT}`);
  console.log(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🌐 Network: ${process.env.NETWORK || 'testnet'}`);
  console.log(`🔒 CORS enabled for origins: ${getAllowedOrigins().join(', ')}`);
  console.log(`⏱️  Rate limit: ${RATE_LIMIT_CONFIG.maxRequests} requests per ${RATE_LIMIT_CONFIG.windowMs / 1000} seconds`);
});

export default app;

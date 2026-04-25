import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { PaymentService, PaymentRequest } from './payment-service';
import { RateLimiter, RateLimitConfig } from './rate-limiter';
import { MonitoringService, MonitoringConfig } from './monitoring/monitoring-service';
import { MonitoringWebSocketServer } from './monitoring/websocket-server';

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

// Monitoring configuration
const MONITORING_CONFIG: MonitoringConfig = {
  enabled: process.env.MONITORING_ENABLED !== 'false',
  interval: parseInt(process.env.MONITORING_INTERVAL || '30000'), // 30 seconds
  retention: parseInt(process.env.MONITORING_RETENTION || '168'), // 7 days in hours
  alerts: {
    enabled: true,
    thresholds: {
      cpu: 80,
      memory: 85,
      disk: 90,
      responseTime: 1000,
      errorRate: 5,
      stellarResponseTime: 5000
    }
  },
  websocket: {
    enabled: process.env.MONITORING_WEBSOCKET_ENABLED !== 'false',
    port: parseInt(process.env.MONITORING_WEBSOCKET_PORT || '3002'),
    path: '/monitoring',
    heartbeatInterval: 15000
  }
};

// Initialize monitoring service
const monitoringService = new MonitoringService(MONITORING_CONFIG);

// Initialize WebSocket server for real-time monitoring
let wsServer: MonitoringWebSocketServer | null = null;
if (MONITORING_CONFIG.websocket.enabled) {
  wsServer = new MonitoringWebSocketServer(
    monitoringService,
    MONITORING_CONFIG.websocket.port,
    MONITORING_CONFIG.websocket.path
  );
}

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
  const startTime = Date.now();
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path} - ${req.ip}`);
  
  // Record response for monitoring
  res.on('finish', () => {
    const responseTime = Date.now() - startTime;
    const userId = req.headers['x-user-id'] as string || 'anonymous';
    
    // Record request in performance monitor
    if (monitoringService.getPerformanceMonitor()) {
      monitoringService.getPerformanceMonitor().recordRequest(
        req.method,
        req.path,
        res.statusCode,
        responseTime,
        userId
      );
    }
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
 * GET /api/monitoring/health
 * Get current system health metrics
 */
app.get('/api/monitoring/health', (req, res) => {
  try {
    const health = monitoringService.getSystemMonitor().getSystemHealth();
    res.status(200).json({
      success: true,
      data: health
    });
  } catch (error) {
    console.error('Health monitoring error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve health metrics'
    });
  }
});

/**
 * GET /api/monitoring/performance
 * Get current performance metrics
 */
app.get('/api/monitoring/performance', (req, res) => {
  try {
    const performance = monitoringService.getPerformanceMonitor().getPerformanceMetrics();
    res.status(200).json({
      success: true,
      data: performance
    });
  } catch (error) {
    console.error('Performance monitoring error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve performance metrics'
    });
  }
});

/**
 * GET /api/monitoring/business
 * Get current business metrics
 */
app.get('/api/monitoring/business', (req, res) => {
  try {
    const business = monitoringService.getBusinessMonitor().getBusinessMetrics();
    res.status(200).json({
      success: true,
      data: business
    });
  } catch (error) {
    console.error('Business monitoring error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve business metrics'
    });
  }
});

/**
 * GET /api/monitoring/alerts
 * Get current alerts
 */
app.get('/api/monitoring/alerts', (req, res) => {
  try {
    const includeResolved = req.query.resolved === 'true';
    const alerts = monitoringService.getAlerts(includeResolved);
    res.status(200).json({
      success: true,
      data: alerts
    });
  } catch (error) {
    console.error('Alerts monitoring error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve alerts'
    });
  }
});

/**
 * POST /api/monitoring/alerts/:alertId/resolve
 * Resolve an alert
 */
app.post('/api/monitoring/alerts/:alertId/resolve', (req, res) => {
  try {
    const { alertId } = req.params;
    const success = monitoringService.resolveAlert(alertId);
    
    if (success) {
      res.status(200).json({
        success: true,
        message: 'Alert resolved successfully'
      });
    } else {
      res.status(404).json({
        success: false,
        error: 'Alert not found or already resolved'
      });
    }
  } catch (error) {
    console.error('Alert resolution error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to resolve alert'
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
app.listen(PORT, async () => {
  console.log(`🚀 Wata-Board API Server running on port ${PORT}`);
  console.log(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🌐 Network: ${process.env.NETWORK || 'testnet'}`);
  console.log(`🔒 CORS enabled for origins: ${getAllowedOrigins().join(', ')}`);
  console.log(`⏱️  Rate limit: ${RATE_LIMIT_CONFIG.maxRequests} requests per ${RATE_LIMIT_CONFIG.windowMs / 1000} seconds`);
  
  // Start monitoring service
  if (MONITORING_CONFIG.enabled) {
    console.log(`📊 Starting monitoring service...`);
    monitoringService.start();
    
    // Start WebSocket server
    if (wsServer && MONITORING_CONFIG.websocket.enabled) {
      try {
        await wsServer.start();
        console.log(`🔌 Real-time monitoring enabled on ws://localhost:${MONITORING_CONFIG.websocket.port}${MONITORING_CONFIG.websocket.path}`);
      } catch (error) {
        console.error('Failed to start WebSocket server:', error);
      }
    }
    
    console.log(`✅ Monitoring service started with ${MONITORING_CONFIG.interval}ms interval`);
  } else {
    console.log(`📊 Monitoring service disabled`);
  }
});

export default app;

import { Router, Request, Response } from 'express';
import { monitoringService } from './MonitoringService';

const router = Router();

// Middleware to track requests
router.use((req: Request, res: Response, next: any) => {
  monitoringService.trackRequest();
  next();
});

/**
 * GET /api/monitoring/metrics
 * Get current system metrics
 */
router.get('/metrics', (req: Request, res: Response) => {
  try {
    const metrics = monitoringService.getMetrics();
    res.status(200).json({
      success: true,
      data: metrics
    });
  } catch (error) {
    // Simplified error handling without console
    res.status(500).json({
      success: false,
      error: 'Failed to fetch metrics'
    });
  }
});

/**
 * GET /api/monitoring/health
 * Get system health status
 */
router.get('/health', (req: Request, res: Response) => {
  try {
    const health = monitoringService.getHealthStatus();
    const statusCode = health.status === 'unhealthy' ? 503 : 
                     health.status === 'degraded' ? 200 : 200;
    
    res.status(statusCode).json({
      success: health.status !== 'unhealthy',
      data: health
    });
  } catch (error) {
    // Simplified error handling without console
    res.status(500).json({
      success: false,
      error: 'Failed to fetch health status'
    });
  }
});

/**
 * GET /api/monitoring/events
 * Server-Sent Events endpoint for real-time monitoring
 */
router.get('/events', (req: Request, res: Response) => {
  // Set headers for SSE
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Cache-Control'
  });

  // Send initial data
  const sendInitialData = () => {
    const metrics = monitoringService.getMetrics();
    const health = monitoringService.getHealthStatus();
    
    res.write(`data: ${JSON.stringify({ type: 'metrics', data: metrics })}\n\n`);
    res.write(`data: ${JSON.stringify({ type: 'health', data: health })}\n\n`);
  };

  sendInitialData();

  // Set up event listeners
  const onMetrics = (metrics: any) => {
    res.write(`data: ${JSON.stringify({ type: 'metrics', data: metrics })}\n\n`);
  };

  const onHealth = (health: any) => {
    res.write(`data: ${JSON.stringify({ type: 'health', data: health })}\n\n`);
  };

  const onError = (error: Error) => {
    res.write(`data: ${JSON.stringify({ type: 'error', data: { message: error.message, timestamp: new Date() } })}\n\n`);
  };

  monitoringService.on('metrics', onMetrics);
  monitoringService.on('health', onHealth);
  monitoringService.on('error', onError);

  // Simplified SSE without heartbeat for TypeScript compatibility
  // In production, this would include heartbeat mechanism

  // Clean up on client disconnect
  req.on('close', () => {
    monitoringService.off('metrics', onMetrics);
    monitoringService.off('health', onHealth);
    monitoringService.off('error', onError);
  });
});

/**
 * GET /api/monitoring/history
 * Get historical metrics data (simplified implementation)
 */
router.get('/history', (req: Request, res: Response) => {
  try {
    const { period = '1h' } = req.query;
    
    // In a real implementation, you'd store historical data in a database
    // For now, we'll return recent data points
    const currentMetrics = monitoringService.getMetrics();
    const currentHealth = monitoringService.getHealthStatus();
    
    // Generate sample historical data
    const history = [];
    const now = new Date();
    const dataPoints = period === '1h' ? 12 : period === '24h' ? 24 : 6; // Every 5min, 1hour, or 10min
    
    for (let i = dataPoints - 1; i >= 0; i--) {
      const timestamp = new Date(now.getTime() - i * (period === '1h' ? 5 * 60 * 1000 : period === '24h' ? 60 * 60 * 1000 : 10 * 60 * 1000));
      
      // Simulate historical data with some variation
      const cpuVariation = Math.random() * 10 - 5;
      const memoryVariation = Math.random() * 5 - 2.5;
      
      history.push({
        timestamp,
        cpu: {
          usage: Math.max(0, Math.min(100, currentMetrics.cpu.usage + cpuVariation)),
          loadAverage: [0, 0, 0]
        },
        memory: {
          usage: Math.max(0, Math.min(100, currentMetrics.memory.usage + memoryVariation)),
          used: currentMetrics.memory.used,
          total: currentMetrics.memory.total
        },
        server: {
          requestsPerMinute: Math.max(0, currentMetrics.server.requestsPerMinute + Math.floor(Math.random() * 10 - 5)),
          errorRate: Math.max(0, currentMetrics.server.errorRate + Math.random() * 2 - 1)
        }
      });
    }
    
    res.status(200).json({
      success: true,
      data: {
        period,
        dataPoints: history.length,
        history
      }
    });
  } catch (error) {
    // Simplified error handling without console
    res.status(500).json({
      success: false,
      error: 'Failed to fetch historical data'
    });
  }
});

/**
 * GET /api/monitoring/alerts
 * Get active alerts based on system status
 */
router.get('/alerts', (req: Request, res: Response) => {
  try {
    const health = monitoringService.getHealthStatus();
    const metrics = monitoringService.getMetrics();
    const alerts = [];

    // Generate alerts based on health checks
    if (health.checks.memory === 'fail') {
      alerts.push({
        id: 'memory-critical',
        severity: 'critical',
        title: 'Critical Memory Usage',
        message: `Memory usage is at ${metrics.memory.usage.toFixed(1)}%`,
        timestamp: new Date(),
        component: 'memory'
      });
    } else if (health.checks.memory === 'warn') {
      alerts.push({
        id: 'memory-warning',
        severity: 'warning',
        title: 'High Memory Usage',
        message: `Memory usage is at ${metrics.memory.usage.toFixed(1)}%`,
        timestamp: new Date(),
        component: 'memory'
      });
    }

    if (health.checks.cpu === 'fail') {
      alerts.push({
        id: 'cpu-critical',
        severity: 'critical',
        title: 'High CPU Usage',
        message: `CPU usage is at ${metrics.cpu.usage.toFixed(1)}%`,
        timestamp: new Date(),
        component: 'cpu'
      });
    } else if (health.checks.cpu === 'warn') {
      alerts.push({
        id: 'cpu-warning',
        severity: 'warning',
        title: 'Elevated CPU Usage',
        message: `CPU usage is at ${metrics.cpu.usage.toFixed(1)}%`,
        timestamp: new Date(),
        component: 'cpu'
      });
    }

    if (health.checks.stellar === 'fail') {
      alerts.push({
        id: 'stellar-offline',
        severity: 'critical',
        title: 'Stellar Network Offline',
        message: 'Unable to connect to Stellar network',
        timestamp: new Date(),
        component: 'stellar'
      });
    }

    if (health.checks.rateLimit === 'fail') {
      alerts.push({
        id: 'high-error-rate',
        severity: 'critical',
        title: 'High Error Rate',
        message: `Error rate is ${metrics.server.errorRate.toFixed(1)}%`,
        timestamp: new Date(),
        component: 'server'
      });
    }

    res.status(200).json({
      success: true,
      data: {
        alerts,
        total: alerts.length,
        critical: alerts.filter(a => a.severity === 'critical').length,
        warning: alerts.filter(a => a.severity === 'warning').length
      }
    });
  } catch (error) {
    // Simplified error handling without console
    res.status(500).json({
      success: false,
      error: 'Failed to fetch alerts'
    });
  }
});

export default router;

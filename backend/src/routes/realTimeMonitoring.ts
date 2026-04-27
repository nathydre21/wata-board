import { Router, Request, Response } from 'express';
import realTimeMonitoringService from '../services/realTimeMonitoringService';
import logger from '../utils/logger';

const router = Router();

// Get current real-time metrics
router.get('/metrics', async (req: Request, res: Response) => {
  try {
    const systemHealth = realTimeMonitoringService.getRecentAlerts();
    const thresholds = realTimeMonitoringService.getThresholds();
    const clientCount = realTimeMonitoringService.getConnectedClientsCount();
    
    res.json({
      success: true,
      data: {
        connectedClients: clientCount,
        thresholds,
        recentAlerts: realTimeMonitoringService.getRecentAlerts(20),
        timestamp: Date.now(),
      },
    });
  } catch (error) {
    logger.error('Failed to get monitoring metrics', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve monitoring metrics',
    });
  }
});

// Get recent alerts
router.get('/alerts', (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const alerts = realTimeMonitoringService.getRecentAlerts(limit);
    
    res.json({
      success: true,
      data: alerts,
    });
  } catch (error) {
    logger.error('Failed to get alerts', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve alerts',
    });
  }
});

// Resolve an alert
router.post('/alerts/:alertId/resolve', (req: Request, res: Response) => {
  try {
    const { alertId } = req.params;
    realTimeMonitoringService.resolveAlert(alertId);
    
    res.json({
      success: true,
      message: 'Alert resolved successfully',
    });
  } catch (error) {
    logger.error('Failed to resolve alert', { error, alertId: req.params.alertId });
    res.status(500).json({
      success: false,
      error: 'Failed to resolve alert',
    });
  }
});

// Update monitoring thresholds
router.put('/thresholds', (req: Request, res: Response) => {
  try {
    const thresholds = req.body;
    
    // Validate threshold values
    const validThresholds = {
      cpuUsage: Math.min(100, Math.max(0, thresholds.cpuUsage)),
      memoryUsage: Math.min(100, Math.max(0, thresholds.memoryUsage)),
      diskUsage: Math.min(100, Math.max(0, thresholds.diskUsage)),
      errorRate: Math.min(1, Math.max(0, thresholds.errorRate)),
      responseTime: Math.max(0, thresholds.responseTime),
      networkLatency: Math.max(0, thresholds.networkLatency),
    };

    realTimeMonitoringService.updateThresholds(validThresholds);
    
    res.json({
      success: true,
      message: 'Thresholds updated successfully',
      data: validThresholds,
    });
  } catch (error) {
    logger.error('Failed to update thresholds', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to update thresholds',
    });
  }
});

// Get current thresholds
router.get('/thresholds', (req: Request, res: Response) => {
  try {
    const thresholds = realTimeMonitoringService.getThresholds();
    
    res.json({
      success: true,
      data: thresholds,
    });
  } catch (error) {
    logger.error('Failed to get thresholds', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve thresholds',
    });
  }
});

// Get monitoring status
router.get('/status', (req: Request, res: Response) => {
  try {
    const status = {
      active: true,
      connectedClients: realTimeMonitoringService.getConnectedClientsCount(),
      uptime: process.uptime(),
      timestamp: Date.now(),
    };
    
    res.json({
      success: true,
      data: status,
    });
  } catch (error) {
    logger.error('Failed to get monitoring status', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve monitoring status',
    });
  }
});

export default router;

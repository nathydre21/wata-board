import { EventEmitter } from 'events';
import WebSocket from 'ws';
import { metricsCollector, SystemHealth } from '../middleware/metrics';
import { HealthService } from '../utils/health';
import logger from '../utils/logger';

export interface RealTimeMetrics {
  timestamp: number;
  systemHealth: SystemHealth;
  fullHealth: any;
  alerts: Alert[];
  performanceMetrics: PerformanceMetrics;
}

export interface PerformanceMetrics {
  cpuUsage: number;
  memoryUsage: number;
  diskUsage: number;
  networkLatency: {
    stellar: number;
    soroban: number;
    database: number;
  };
  requestMetrics: {
    totalRequests: number;
    errorRate: number;
    avgResponseTime: number;
    requestsPerSecond: number;
  };
}

export interface Alert {
  id: string;
  type: 'error' | 'warning' | 'critical';
  message: string;
  timestamp: number;
  source: string;
  resolved?: boolean;
  resolvedAt?: number;
}

export interface MonitoringThresholds {
  cpuUsage: number;
  memoryUsage: number;
  diskUsage: number;
  errorRate: number;
  responseTime: number;
  networkLatency: number;
}

class RealTimeMonitoringService extends EventEmitter {
  private wsServer: WebSocket.Server | null = null;
  private clients: Set<WebSocket> = new Set();
  private monitoringInterval: NodeJS.Timeout | null = null;
  private alertHistory: Alert[] = [];
  private readonly maxAlertHistory = 1000;
  private thresholds: MonitoringThresholds = {
    cpuUsage: 80,
    memoryUsage: 85,
    diskUsage: 90,
    errorRate: 0.1,
    responseTime: 5000,
    networkLatency: 10000,
  };

  constructor() {
    super();
    this.initializeMonitoring();
  }

  private initializeMonitoring() {
    this.startMonitoring();
    this.setupWebSocketServer();
    logger.info('Real-time monitoring service initialized');
  }

  private startMonitoring() {
    this.monitoringInterval = setInterval(() => {
      this.collectAndBroadcastMetrics();
    }, 5000); // Update every 5 seconds
  }

  private async collectAndBroadcastMetrics() {
    try {
      const systemHealth = metricsCollector.getSystemHealth();
      const fullHealth = await HealthService.getFullHealth();
      const performanceMetrics = this.calculatePerformanceMetrics(fullHealth);
      const alerts = this.checkThresholds(performanceMetrics, systemHealth);

      const metrics: RealTimeMetrics = {
        timestamp: Date.now(),
        systemHealth,
        fullHealth,
        alerts,
        performanceMetrics,
      };

      this.broadcastToClients(metrics);
      this.processAlerts(alerts);
    } catch (error) {
      logger.error('Failed to collect metrics', { error });
    }
  }

  private calculatePerformanceMetrics(fullHealth: any): PerformanceMetrics {
    const cpuUsage = this.calculateCpuUsage(fullHealth.system.cpu);
    const memoryUsage = this.calculateMemoryUsage(fullHealth.system.memory);
    const diskUsage = fullHealth.system.disk.usedPercent;

    return {
      cpuUsage,
      memoryUsage,
      diskUsage,
      networkLatency: {
        stellar: fullHealth.dependencies.stellar.responseTimeMs || 0,
        soroban: fullHealth.dependencies.sorobanRpc.responseTimeMs || 0,
        database: fullHealth.dependencies.database.responseTimeMs || 0,
      },
      requestMetrics: {
        totalRequests: fullHealth.system?.activeConnections || 0,
        errorRate: fullHealth.system?.errorRate || 0,
        avgResponseTime: fullHealth.system?.avgResponseTimeMs || 0,
        requestsPerSecond: this.calculateRequestsPerSecond(),
      },
    };
  }

  private calculateCpuUsage(cpu: any): number {
    if (!cpu || !cpu.load || !cpu.cores) return 0;
    const loadAvg = cpu.load[0]; // 1-minute average
    return Math.min((loadAvg / cpu.cores) * 100, 100);
  }

  private calculateMemoryUsage(memory: any): number {
    if (!memory || !memory.total || !memory.free) return 0;
    const used = memory.total - memory.free;
    return (used / memory.total) * 100;
  }

  private calculateRequestsPerSecond(): number {
    const metrics = metricsCollector.getMetrics(60000); // Last minute
    return metrics.length / 60; // Requests per second
  }

  private checkThresholds(performance: PerformanceMetrics, health: SystemHealth): Alert[] {
    const alerts: Alert[] = [];
    const now = Date.now();

    // CPU usage alert
    if (performance.cpuUsage > this.thresholds.cpuUsage) {
      alerts.push(this.createAlert(
        'warning',
        `High CPU usage: ${performance.cpuUsage.toFixed(2)}%`,
        'system',
        now
      ));
    }

    // Memory usage alert
    if (performance.memoryUsage > this.thresholds.memoryUsage) {
      alerts.push(this.createAlert(
        'warning',
        `High memory usage: ${performance.memoryUsage.toFixed(2)}%`,
        'system',
        now
      ));
    }

    // Disk usage alert
    if (performance.diskUsage > this.thresholds.diskUsage) {
      alerts.push(this.createAlert(
        'critical',
        `High disk usage: ${performance.diskUsage.toFixed(2)}%`,
        'system',
        now
      ));
    }

    // Error rate alert
    if (health.errorRate > this.thresholds.errorRate) {
      alerts.push(this.createAlert(
        'error',
        `High error rate: ${(health.errorRate * 100).toFixed(2)}%`,
        'requests',
        now
      ));
    }

    // Response time alert
    if (health.avgResponseTimeMs > this.thresholds.responseTime) {
      alerts.push(this.createAlert(
        'warning',
        `High response time: ${health.avgResponseTimeMs}ms`,
        'requests',
        now
      ));
    }

    // Network latency alerts
    if (performance.networkLatency.stellar > this.thresholds.networkLatency) {
      alerts.push(this.createAlert(
        'warning',
        `High Stellar network latency: ${performance.networkLatency.stellar}ms`,
        'network',
        now
      ));
    }

    if (performance.networkLatency.soroban > this.thresholds.networkLatency) {
      alerts.push(this.createAlert(
        'warning',
        `High Soroban RPC latency: ${performance.networkLatency.soroban}ms`,
        'network',
        now
      ));
    }

    if (performance.networkLatency.database > this.thresholds.networkLatency) {
      alerts.push(this.createAlert(
        'warning',
        `High database latency: ${performance.networkLatency.database}ms`,
        'database',
        now
      ));
    }

    return alerts;
  }

  private createAlert(type: Alert['type'], message: string, source: string, timestamp: number): Alert {
    return {
      id: `${timestamp}-${Math.random().toString(36).substr(2, 9)}`,
      type,
      message,
      timestamp,
      source,
    };
  }

  private processAlerts(alerts: Alert[]) {
    for (const alert of alerts) {
      const existingAlert = this.alertHistory.find(a => a.message === alert.message && !a.resolved);
      
      if (!existingAlert) {
        this.alertHistory.push(alert);
        this.emit('alert', alert);
        logger.warn('System alert triggered', { alert });
        
        // Keep only recent alerts
        if (this.alertHistory.length > this.maxAlertHistory) {
          this.alertHistory = this.alertHistory.slice(-this.maxAlertHistory);
        }
      }
    }
  }

  private setupWebSocketServer() {
    this.wsServer = new WebSocket.Server({ port: 8080 });
    
    this.wsServer.on('connection', (ws: WebSocket) => {
      this.clients.add(ws);
      logger.info('New monitoring client connected', { clientCount: this.clients.size });

      ws.on('close', () => {
        this.clients.delete(ws);
        logger.info('Monitoring client disconnected', { clientCount: this.clients.size });
      });

      ws.on('error', (error) => {
        logger.error('WebSocket error', { error });
        this.clients.delete(ws);
      });

      // Send initial data
      this.sendInitialData(ws);
    });

    logger.info('WebSocket server started on port 8080');
  }

  private async sendInitialData(ws: WebSocket) {
    try {
      const systemHealth = metricsCollector.getSystemHealth();
      const fullHealth = await HealthService.getFullHealth();
      const performanceMetrics = this.calculatePerformanceMetrics(fullHealth);
      
      const initialData: RealTimeMetrics = {
        timestamp: Date.now(),
        systemHealth,
        fullHealth,
        alerts: this.getRecentAlerts(),
        performanceMetrics,
      };

      ws.send(JSON.stringify(initialData));
    } catch (error) {
      logger.error('Failed to send initial data', { error });
    }
  }

  private broadcastToClients(metrics: RealTimeMetrics) {
    const message = JSON.stringify(metrics);
    const deadClients: WebSocket[] = [];

    for (const client of this.clients) {
      try {
        if (client.readyState === WebSocket.OPEN) {
          client.send(message);
        } else {
          deadClients.push(client);
        }
      } catch (error) {
        deadClients.push(client);
      }
    }

    // Remove dead clients
    for (const client of deadClients) {
      this.clients.delete(client);
    }
  }

  public getRecentAlerts(limit: number = 50): Alert[] {
    return this.alertHistory.slice(-limit);
  }

  public resolveAlert(alertId: string) {
    const alert = this.alertHistory.find(a => a.id === alertId);
    if (alert && !alert.resolved) {
      alert.resolved = true;
      alert.resolvedAt = Date.now();
      this.emit('alert-resolved', alert);
      logger.info('Alert resolved', { alertId });
    }
  }

  public updateThresholds(newThresholds: Partial<MonitoringThresholds>) {
    this.thresholds = { ...this.thresholds, ...newThresholds };
    logger.info('Monitoring thresholds updated', { thresholds: this.thresholds });
  }

  public getThresholds(): MonitoringThresholds {
    return { ...this.thresholds };
  }

  public getConnectedClientsCount(): number {
    return this.clients.size;
  }

  public stop() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }

    if (this.wsServer) {
      this.wsServer.close();
      this.wsServer = null;
    }

    this.clients.clear();
    logger.info('Real-time monitoring service stopped');
  }
}

export const realTimeMonitoringService = new RealTimeMonitoringService();
export default realTimeMonitoringService;

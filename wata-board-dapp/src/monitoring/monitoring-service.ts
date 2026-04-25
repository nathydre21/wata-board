/**
 * Main Monitoring Service for Wata-Board
 * Orchestrates all monitoring components and provides unified monitoring interface
 */

import {
  SystemMonitor
} from './system-monitor';
import {
  PerformanceMonitor
} from './performance-monitor';
import {
  BusinessMonitor
} from './business-monitor';
import {
  MonitoringConfig,
  MonitoringEvent,
  Alert,
  SystemHealth,
  PerformanceMetrics,
  BusinessMetrics,
  createMonitoringEvent,
  createAlert
} from '../../../shared/monitoring-types';

// Event listener interface
export interface MonitoringEventListener {
  (event: MonitoringEvent): void;
}

// Export MonitoringConfig for use in server
export type { MonitoringConfig } from '../../../shared/monitoring-types';

export class MonitoringService {
  private config: MonitoringConfig;
  private systemMonitor: SystemMonitor;
  private performanceMonitor: PerformanceMonitor;
  private businessMonitor: BusinessMonitor;
  private monitoringInterval: any = null;
  private alerts: Map<string, Alert> = new Map();
  private lastHealth?: SystemHealth;
  private lastPerformance?: PerformanceMetrics;
  private lastBusiness?: BusinessMetrics;

  private listeners: MonitoringEventListener[] = [];

  constructor(config: MonitoringConfig) {
    this.config = config;
    
    if (config.enabled) {
      this.systemMonitor = new SystemMonitor(config);
      this.performanceMonitor = new PerformanceMonitor(config);
      this.businessMonitor = new BusinessMonitor(config);
    }
  }

  /**
   * Start monitoring service
   */
  start(): void {
    if (!this.config.enabled) {
      console.log('Monitoring is disabled');
      return;
    }

    console.log(`Starting monitoring service with ${this.config.interval}ms interval`);
    
    // Initial data collection
    this.collectMetrics();
    
    // Set up periodic monitoring
    this.monitoringInterval = setInterval(() => {
      this.collectMetrics();
    }, this.config.interval);
  }

  /**
   * Stop monitoring service
   */
  stop(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = undefined;
    }
    console.log('Monitoring service stopped');
  }

  /**
   * Collect all metrics and check for alerts
   */
  private async collectMetrics(): Promise<void> {
    try {
      const [health, performance, business] = await Promise.all([
        this.systemMonitor.getSystemHealth(),
        this.performanceMonitor.getPerformanceMetrics(),
        this.businessMonitor.getBusinessMetrics()
      ]);

      this.lastHealth = health;
      this.lastPerformance = performance;
      this.lastBusiness = business;

      // Emit monitoring events
      this.emitEvent('health', health);
      this.emitEvent('performance', performance);
      this.emitEvent('business', business);

      // Check for alerts
      await this.checkAlerts(health, performance, business);

    } catch (error) {
      console.error('Error collecting metrics:', error);
      this.emitEvent('alert', createAlert(
        'critical',
        'Monitoring Error',
        `Failed to collect metrics: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'monitoring-service'
      ));
    }
  }

  /**
   * Add event listener
   */
  addEventListener(listener: MonitoringEventListener): void {
    this.listeners.push(listener);
  }

  /**
   * Remove event listener
   */
  removeEventListener(listener: MonitoringEventListener): void {
    const index = this.listeners.indexOf(listener);
    if (index > -1) {
      this.listeners.splice(index, 1);
    }
  }

  /**
   * Emit monitoring events to listeners
   */
  private emitEvent(type: MonitoringEvent['type'], data: any): void {
    const event = createMonitoringEvent(type, data);
    this.listeners.forEach(listener => listener(event));
  }

  /**
   * Check for alerts based on thresholds
   */
  private async checkAlerts(
    health: SystemHealth,
    performance: PerformanceMetrics,
    business: BusinessMetrics
  ): Promise<void> {
    const thresholds = this.config.alerts.thresholds;
    const alerts: Alert[] = [];

    // System health alerts
    if (health.memory.percentage > thresholds.memory) {
      alerts.push(createAlert(
        health.memory.percentage > 90 ? 'critical' : 'warning',
        'High Memory Usage',
        `Memory usage is at ${health.memory.percentage}%`,
        'system-memory',
        { percentage: health.memory.percentage }
      ));
    }

    if (health.cpu.percentage > thresholds.cpu) {
      alerts.push(createAlert(
        health.cpu.percentage > 90 ? 'critical' : 'warning',
        'High CPU Usage',
        `CPU usage is at ${health.cpu.percentage}%`,
        'system-cpu',
        { percentage: health.cpu.percentage }
      ));
    }

    if (health.disk.percentage > thresholds.disk) {
      alerts.push(createAlert(
        health.disk.percentage > 95 ? 'critical' : 'warning',
        'High Disk Usage',
        `Disk usage is at ${health.disk.percentage}%`,
        'system-disk',
        { percentage: health.disk.percentage }
      ));
    }

    // Network connectivity alerts
    if (!health.network.stellar.connected) {
      alerts.push(createAlert(
        'critical',
        'Stellar Network Disconnected',
        'Cannot connect to Stellar network',
        'stellar-network',
        { error: health.network.stellar.error }
      ));
    }

    if (!health.network.rpc.connected) {
      alerts.push(createAlert(
        'critical',
        'RPC Network Disconnected',
        'Cannot connect to RPC endpoint',
        'rpc-network',
        { error: health.network.rpc.error }
      ));
    }

    // Performance alerts
    if (performance.responseTime.avg > thresholds.responseTime) {
      alerts.push(createAlert(
        'warning',
        'High Response Time',
        `Average response time is ${performance.responseTime.avg}ms`,
        'response-time',
        { avgResponseTime: performance.responseTime.avg }
      ));
    }

    // Error rate alerts
    const totalRequests = performance.requests.total;
    const errorRate = totalRequests > 0 ? (performance.requests.error / totalRequests) * 100 : 0;
    if (errorRate > thresholds.errorRate) {
      alerts.push(createAlert(
        errorRate > 10 ? 'critical' : 'warning',
        'High Error Rate',
        `Error rate is ${Math.round(errorRate * 100) / 100}%`,
        'error-rate',
        { errorRate, totalErrors: performance.requests.error }
      ));
    }

    // Process new alerts
    for (const alert of alerts) {
      const existingAlert = this.alerts.get(alert.id);
      
      if (!existingAlert || existingAlert.resolved) {
        this.alerts.set(alert.id, alert);
        this.emitEvent('alert', alert);
        console.warn(`🚨 Alert: ${alert.title} - ${alert.message}`);
      }
    }

    // Check for resolved alerts
    this.checkResolvedAlerts(health, performance, business);
  }

  /**
   * Check for resolved alerts
   */
  private checkResolvedAlerts(
    health: SystemHealth,
    performance: PerformanceMetrics,
    business: BusinessMetrics
  ): void {
    const thresholds = this.config.alerts.thresholds;

    for (const [id, alert] of this.alerts.entries()) {
      if (alert.resolved) continue;

      let resolved = false;

      switch (alert.source) {
        case 'system-memory':
          resolved = health.memory.percentage < thresholds.memory * 0.8; // 80% of threshold
          break;
        case 'system-cpu':
          resolved = health.cpu.percentage < thresholds.cpu * 0.8;
          break;
        case 'system-disk':
          resolved = health.disk.percentage < thresholds.disk * 0.8;
          break;
        case 'stellar-network':
          resolved = health.network.stellar.connected;
          break;
        case 'rpc-network':
          resolved = health.network.rpc.connected;
          break;
        case 'response-time':
          resolved = performance.responseTime.avg < thresholds.responseTime * 0.8;
          break;
        case 'error-rate':
          const totalRequests = performance.requests.total;
          const errorRate = totalRequests > 0 ? (performance.requests.error / totalRequests) * 100 : 0;
          resolved = errorRate < thresholds.errorRate * 0.8;
          break;
      }

      if (resolved) {
        alert.resolved = true;
        alert.resolvedAt = new Date().toISOString();
        this.emitEvent('alert', alert);
        console.log(`✅ Resolved: ${alert.title}`);
      }
    }
  }

  /**
   * Get current monitoring data
   */
  getCurrentData() {
    return {
      health: this.lastHealth,
      performance: this.lastPerformance,
      business: this.lastBusiness,
      alerts: Array.from(this.alerts.values()).filter(a => !a.resolved),
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Get monitoring history
   */
  getHistory(type?: 'health' | 'performance' | 'business', limit?: number) {
    switch (type) {
      case 'health':
        return this.systemMonitor.getHealthHistory(limit);
      case 'performance':
        return this.performanceMonitor.getMetricsHistory(limit);
      case 'business':
        return this.businessMonitor.getMetricsHistory(limit);
      default:
        return {
          health: this.systemMonitor.getHealthHistory(limit),
          performance: this.performanceMonitor.getMetricsHistory(limit),
          business: this.businessMonitor.getMetricsHistory(limit)
        };
    }
  }

  /**
   * Get all alerts (including resolved)
   */
  getAlerts(includeResolved: boolean = false): Alert[] {
    const alerts = Array.from(this.alerts.values());
    return includeResolved ? alerts : alerts.filter(a => !a.resolved);
  }

  /**
   * Manually resolve an alert
   */
  resolveAlert(alertId: string): boolean {
    const alert = this.alerts.get(alertId);
    if (alert && !alert.resolved) {
      alert.resolved = true;
      alert.resolvedAt = new Date().toISOString();
      this.emitEvent('alert', alert);
      return true;
    }
    return false;
  }

  /**
   * Clear old alerts
   */
  clearOldAlerts(): void {
    const oneWeekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
    
    for (const [id, alert] of this.alerts.entries()) {
      const alertTime = new Date(alert.timestamp).getTime();
      if (alertTime < oneWeekAgo && alert.resolved) {
        this.alerts.delete(id);
      }
    }
  }

  /**
   * Get monitoring configuration
   */
  getConfig(): MonitoringConfig {
    return { ...this.config };
  }

  /**
   * Update monitoring configuration
   */
  updateConfig(newConfig: Partial<MonitoringConfig>): void {
    this.config = { ...this.config, ...newConfig };
    
    // Restart monitoring if interval changed
    if (this.monitoringInterval && newConfig.interval) {
      this.stop();
      this.start();
    }
  }

  /**
   * Get system monitor instance
   */
  getSystemMonitor(): SystemMonitor {
    return this.systemMonitor;
  }

  /**
   * Get performance monitor instance
   */
  getPerformanceMonitor(): PerformanceMonitor {
    return this.performanceMonitor;
  }

  /**
   * Get business monitor instance
   */
  getBusinessMonitor(): BusinessMonitor {
    return this.businessMonitor;
  }
}

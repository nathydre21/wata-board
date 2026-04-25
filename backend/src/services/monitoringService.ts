import { metricsCollector, SystemHealth } from '../middleware/metrics';
import { userTierService } from './userTierService';
import { notifyAlert } from './alertingService';
import { database } from '../utils/database';
import { config } from '../config/appConfig';

export interface MonitoringSnapshot {
  health: SystemHealth;
  database: {
    queriesPerMinute: number;
    errorRate: number;
    averageQueryTime: number;
    performanceSummary: {
      totalQueries: number;
      successfulQueries: number;
      failedQueries: number;
      averageQueryTime: number;
      slowestQuery: number;
      errorRate: number;
    };
  };
  rateLimiting: { userMetrics: Record<string, { count: number; errors: number }>; tierDistribution: Record<string, number> };
  endpoints: Record<string, { count: number; avgResponseMs: number }>;
  alerts: Alert[];
}

export interface Alert {
  id: string;
  level: 'info' | 'warning' | 'critical';
  message: string;
  timestamp: number;
}

export interface AlertConfig {
  errorRateThreshold: number;
  requestsPerMinuteThreshold: number;
  responseTimeMsThreshold: number;
}

const DEFAULT_ALERT_CONFIG: AlertConfig = {
  errorRateThreshold: config.monitoring.alertThresholds.errorRate,
  requestsPerMinuteThreshold: config.monitoring.alertThresholds.requestsPerMinute,
  responseTimeMsThreshold: config.monitoring.alertThresholds.responseTimeMs,
};

class MonitoringService {
  private alertConfig: AlertConfig;
  private alerts: Alert[] = [];

  constructor(config: AlertConfig = DEFAULT_ALERT_CONFIG) {
    this.alertConfig = config;
  }

  getSnapshot(): MonitoringSnapshot {
    const health = metricsCollector.getSystemHealth();
    const userMetrics = metricsCollector.getUserMetrics();
    const endpoints = metricsCollector.getEndpointMetrics();
    const allUsers = userTierService.listAllUsers();
    const tierDistribution: Record<string, number> = {};
    for (const u of allUsers) tierDistribution[u.tier] = (tierDistribution[u.tier] || 0) + 1;
    this.evaluateAlerts(health);
    return {
      health,
      database: { queriesPerMinute: health.databaseQueriesPerMinute, errorRate: health.databaseErrorRate, averageQueryTime: health.averageDatabaseQueryTime, performanceSummary: database.getPerformanceSummary() },
      rateLimiting: { userMetrics, tierDistribution },
      endpoints,
      alerts: this.alerts.slice(-50),
    };
  }

  setAlertConfig(config: Partial<AlertConfig>) {
    this.alertConfig = { ...this.alertConfig, ...config };
  }

  private evaluateAlerts(health: SystemHealth) {
    const now = Date.now();
    if (health.errorRate > this.alertConfig.errorRateThreshold) {
      this.addAlert({ id: `alert-err-${now}`, level: 'warning', message: `Error rate ${(health.errorRate * 100).toFixed(1)}% exceeds ${(this.alertConfig.errorRateThreshold * 100).toFixed(1)}%`, timestamp: now });
    }
    if (health.requestsPerMinute > this.alertConfig.requestsPerMinuteThreshold) {
      this.addAlert({ id: `alert-rpm-${now}`, level: 'critical', message: `Request rate ${health.requestsPerMinute}/min exceeds ${this.alertConfig.requestsPerMinuteThreshold}/min`, timestamp: now });
    }
    if (health.avgResponseTimeMs > this.alertConfig.responseTimeMsThreshold) {
      this.addAlert({ id: `alert-response-${now}`, level: 'warning', message: `Response time ${health.avgResponseTimeMs}ms exceeds ${this.alertConfig.responseTimeMsThreshold}ms`, timestamp: now });
    }
  }

  private addAlert(alert: Alert) {
    this.alerts.push(alert);
    if (this.alerts.length > 200) this.alerts = this.alerts.slice(-200);
    void notifyAlert(alert);
  }
}

export const monitoringService = new MonitoringService();
/**
 * Monitoring Service (#99)
 *
 * Aggregates system health, rate-limit tier distribution, endpoint
 * metrics, and configurable alerts into a single snapshot consumed
 * by the monitoring dashboard.
 */

import { metricsCollector, SystemHealth } from '../middleware/metrics';
import { userTierService } from './userTierService';

// ── Types ──────────────────────────────────────────────────

export interface MonitoringSnapshot {
  health: SystemHealth;
  rateLimiting: {
    userMetrics: Record<string, { count: number; errors: number }>;
    tierDistribution: Record<string, number>;
  };
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
  errorRateThreshold: number;          // e.g. 0.1 = 10 %
  requestsPerMinuteThreshold: number;
  responseTimeMsThreshold: number;
}

const DEFAULT_ALERT_CONFIG: AlertConfig = {
  errorRateThreshold: 0.1,
  requestsPerMinuteThreshold: 500,
  responseTimeMsThreshold: 5000,
};

// ── Service ────────────────────────────────────────────────

class MonitoringService {
  private alertConfig: AlertConfig;
  private alerts: Alert[] = [];

  constructor(config: AlertConfig = DEFAULT_ALERT_CONFIG) {
    this.alertConfig = config;
  }

  /** Build a full monitoring snapshot. */
  getSnapshot(): MonitoringSnapshot {
    const health = metricsCollector.getSystemHealth();
    const userMetrics = metricsCollector.getUserMetrics();
    const endpoints = metricsCollector.getEndpointMetrics();

    // Tier distribution from known users
    const allUsers = userTierService.listAllUsers();
    const tierDistribution: Record<string, number> = {};
    for (const u of allUsers) {
      tierDistribution[u.tier] = (tierDistribution[u.tier] || 0) + 1;
    }

    this.evaluateAlerts(health);

    return {
      health,
      rateLimiting: { userMetrics, tierDistribution },
      endpoints,
      alerts: this.alerts.slice(-50),
    };
  }

  /** Merge partial alert config. */
  setAlertConfig(config: Partial<AlertConfig>) {
    this.alertConfig = { ...this.alertConfig, ...config };
  }

  // ── Private ──────────────────────────────────────────────

  private evaluateAlerts(health: SystemHealth) {
    const now = Date.now();

    if (health.errorRate > this.alertConfig.errorRateThreshold) {
      this.addAlert({
        id: `alert-err-${now}`,
        level: 'warning',
        message: `Error rate is ${(health.errorRate * 100).toFixed(1)}% (threshold: ${(this.alertConfig.errorRateThreshold * 100).toFixed(1)}%)`,
        timestamp: now,
      });
    }

    if (health.requestsPerMinute > this.alertConfig.requestsPerMinuteThreshold) {
      this.addAlert({
        id: `alert-rpm-${now}`,
        level: 'critical',
        message: `Request rate ${health.requestsPerMinute}/min exceeds threshold ${this.alertConfig.requestsPerMinuteThreshold}/min`,
        timestamp: now,
      });
    }
  }

  private addAlert(alert: Alert) {
    this.alerts.push(alert);
    if (this.alerts.length > 200) {
      this.alerts = this.alerts.slice(-200);
    }
  }
}

/** Singleton instance */
export const monitoringService = new MonitoringService();

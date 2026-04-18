/**
 * Metrics Collection Middleware (#99)
 *
 * Collects per-request API metrics (method, path, status, response time,
 * user ID) and exposes aggregation helpers consumed by the
 * MonitoringService and the frontend dashboard.
 */

import { Request, Response, NextFunction } from 'express';

export interface ApiMetric {
  timestamp: number;
  method: string;
  path: string;
  statusCode: number;
  responseTimeMs: number;
  userId: string;
}

export interface SystemHealth {
  uptime: number;
  memoryUsageMb: number;
  activeConnections: number;
  requestsPerMinute: number;
  errorRate: number;
}

class MetricsCollector {
  private metrics: ApiMetric[] = [];
  private readonly maxRetention = 10_000;
  private activeConnections = 0;

  // ── Express middleware ──────────────────────────────────────

  middleware() {
    return (req: Request, res: Response, next: NextFunction) => {
      const start = Date.now();
      this.activeConnections++;

      const userId =
        (req.headers['x-user-id'] as string) || req.ip || 'unknown';

      res.on('finish', () => {
        this.activeConnections--;
        const metric: ApiMetric = {
          timestamp: Date.now(),
          method: req.method,
          path: req.path,
          statusCode: res.statusCode,
          responseTimeMs: Date.now() - start,
          userId,
        };

        this.metrics.push(metric);

        if (this.metrics.length > this.maxRetention) {
          this.metrics = this.metrics.slice(-this.maxRetention);
        }
      });

      next();
    };
  }

  // ── Query helpers ──────────────────────────────────────────

  /** Metrics within the given time window (default 1 min). */
  getMetrics(windowMs: number = 60_000): ApiMetric[] {
    const cutoff = Date.now() - windowMs;
    return this.metrics.filter((m) => m.timestamp > cutoff);
  }

  /** Aggregated system health snapshot. */
  getSystemHealth(): SystemHealth {
    const recentMetrics = this.getMetrics(60_000);
    const errors = recentMetrics.filter((m) => m.statusCode >= 400);
    const mem = process.memoryUsage();

    return {
      uptime: process.uptime(),
      memoryUsageMb: Math.round(mem.heapUsed / 1024 / 1024),
      activeConnections: this.activeConnections,
      requestsPerMinute: recentMetrics.length,
      errorRate:
        recentMetrics.length > 0 ? errors.length / recentMetrics.length : 0,
    };
  }

  /** Per-user request counts in the last window. */
  getUserMetrics(
    windowMs: number = 60_000,
  ): Record<string, { count: number; errors: number }> {
    const recent = this.getMetrics(windowMs);
    const result: Record<string, { count: number; errors: number }> = {};

    for (const m of recent) {
      if (!result[m.userId]) result[m.userId] = { count: 0, errors: 0 };
      result[m.userId].count++;
      if (m.statusCode >= 400) result[m.userId].errors++;
    }

    return result;
  }

  /** Per-endpoint breakdown in the last window. */
  getEndpointMetrics(
    windowMs: number = 60_000,
  ): Record<string, { count: number; avgResponseMs: number }> {
    const recent = this.getMetrics(windowMs);
    const agg: Record<
      string,
      { count: number; totalMs: number; avgResponseMs: number }
    > = {};

    for (const m of recent) {
      const key = `${m.method} ${m.path}`;
      if (!agg[key]) agg[key] = { count: 0, totalMs: 0, avgResponseMs: 0 };
      agg[key].count++;
      agg[key].totalMs += m.responseTimeMs;
      agg[key].avgResponseMs = Math.round(agg[key].totalMs / agg[key].count);
    }

    return agg;
  }
}

/** Singleton instance */
export const metricsCollector = new MetricsCollector();

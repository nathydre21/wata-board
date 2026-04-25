import { Request, Response, NextFunction } from 'express';

export interface ApiMetric {
  timestamp: number;
  method: string;
  path: string;
  statusCode: number;
  responseTimeMs: number;
  userId: string;
}

export interface DatabaseMetric {
  timestamp: number;
  durationMs: number;
  success: boolean;
}

export interface SystemHealth {
  uptime: number;
  memoryUsageMb: number;
  activeConnections: number;
  requestsPerMinute: number;
  avgResponseTimeMs: number;
  errorRate: number;
  databaseQueriesPerMinute: number;
  databaseErrorRate: number;
  averageDatabaseQueryTime: number;
}

class MetricsCollector {
  private metrics: ApiMetric[] = [];
  private databaseMetrics: DatabaseMetric[] = [];
  private readonly maxRetention = 10_000;
  private activeConnections = 0;

  middleware() {
    return (req: Request, res: Response, next: NextFunction) => {
      const start = Date.now();
      this.activeConnections++;
      const userId = (req.headers['x-user-id'] as string) || req.ip || 'unknown';

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

  recordDatabaseQuery(durationMs: number, success: boolean) {
    const metric: DatabaseMetric = {
      timestamp: Date.now(),
      durationMs,
      success,
    };
    this.databaseMetrics.push(metric);
    if (this.databaseMetrics.length > this.maxRetention) {
      this.databaseMetrics = this.databaseMetrics.slice(-this.maxRetention);
    }
  }

  getMetrics(windowMs = 60_000): ApiMetric[] {
    const cutoff = Date.now() - windowMs;
    return this.metrics.filter((m) => m.timestamp > cutoff);
  }

  getDatabaseMetrics(windowMs = 60_000): DatabaseMetric[] {
    const cutoff = Date.now() - windowMs;
    return this.databaseMetrics.filter((m) => m.timestamp > cutoff);
  }

  getSystemHealth(): SystemHealth {
    const recentMetrics = this.getMetrics(60_000);
    const recentDbMetrics = this.getDatabaseMetrics(60_000);
    const errors = recentMetrics.filter((m) => m.statusCode >= 400);
    const dbErrors = recentDbMetrics.filter((m) => !m.success);
    const mem = process.memoryUsage();

    const avgResponseTimeMs = recentMetrics.length
      ? Math.round(recentMetrics.reduce((sum, m) => sum + m.responseTimeMs, 0) / recentMetrics.length)
      : 0;

    const successfulDbQueries = recentDbMetrics.filter((m) => m.success);
    const avgDbTime = successfulDbQueries.length
      ? successfulDbQueries.reduce((sum, m) => sum + m.durationMs, 0) / successfulDbQueries.length
      : 0;

    return {
      uptime: process.uptime(),
      memoryUsageMb: Math.round(mem.heapUsed / 1024 / 1024),
      activeConnections: this.activeConnections,
      requestsPerMinute: recentMetrics.length,
      avgResponseTimeMs,
      errorRate: recentMetrics.length ? errors.length / recentMetrics.length : 0,
      databaseQueriesPerMinute: recentDbMetrics.length,
      databaseErrorRate: recentDbMetrics.length ? dbErrors.length / recentDbMetrics.length : 0,
      averageDatabaseQueryTime: Math.round(avgDbTime),
    };
  }

  getUserMetrics(windowMs = 60_000): Record<string, { count: number; errors: number }> {
    const recent = this.getMetrics(windowMs);
    const result: Record<string, { count: number; errors: number }> = {};
    for (const m of recent) {
      if (!result[m.userId]) result[m.userId] = { count: 0, errors: 0 };
      result[m.userId].count++;
      if (m.statusCode >= 400) result[m.userId].errors++;
    }
    return result;
  }

  getEndpointMetrics(windowMs = 60_000): Record<string, { count: number; avgResponseMs: number }> {
    const recent = this.getMetrics(windowMs);
    const agg: Record<string, { count: number; totalMs: number; avgResponseMs: number }> = {};
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

export const metricsCollector = new MetricsCollector();
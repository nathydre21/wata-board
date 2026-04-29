import { NextFunction, Request, Response } from 'express';

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

// Prometheus histogram buckets for response times (in ms)
const HISTOGRAM_BUCKETS = [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000];

function getBucketIndex (value: number): number {
  for (let i = 0; i < HISTOGRAM_BUCKETS.length; i++) {
    if (value <= HISTOGRAM_BUCKETS[i]) return i;
  }
  return HISTOGRAM_BUCKETS.length;
}

class MetricsCollector {
  private metrics: ApiMetric[] = [];
  private databaseMetrics: DatabaseMetric[] = [];
  private readonly maxRetention = 10_000;
  private activeConnections = 0;

  // Prometheus counters
  private requestCountByMethod: Record<string, number> = {};
  private requestCountByStatus: Record<number, number> = {};
  private requestCountByPath: Record<string, number> = {};
  private responseTimeHistogram: number[] = new Array(HISTOGRAM_BUCKETS.length + 1).fill(0);
  private totalResponseTimeMs = 0;
  private totalRequests = 0;

  middleware () {
    return (req: Request, res: Response, next: NextFunction) => {
      const start = Date.now();
      this.activeConnections++;
      const userId = (req.headers['x-user-id'] as string) || req.ip || 'unknown';

      res.on('finish', () => {
        this.activeConnections--;
        const responseTimeMs = Date.now() - start;
        const metric: ApiMetric = {
          timestamp: Date.now(),
          method: req.method,
          path: req.path,
          statusCode: res.statusCode,
          responseTimeMs,
          userId,
        };
        this.metrics.push(metric);
        if (this.metrics.length > this.maxRetention) {
          this.metrics = this.metrics.slice(-this.maxRetention);
        }

        // Update Prometheus-style counters
        this.requestCountByMethod[req.method] = (this.requestCountByMethod[req.method] || 0) + 1;
        this.requestCountByStatus[res.statusCode] = (this.requestCountByStatus[res.statusCode] || 0) + 1;
        this.requestCountByPath[`${req.method} ${req.path}`] = (this.requestCountByPath[`${req.method} ${req.path}`] || 0) + 1;
        this.responseTimeHistogram[getBucketIndex(responseTimeMs)]++;
        this.totalResponseTimeMs += responseTimeMs;
        this.totalRequests++;
      });
      next();
    };
  }

  recordDatabaseQuery (durationMs: number, success: boolean) {
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

  getMetrics (windowMs = 60_000): ApiMetric[] {
    const cutoff = Date.now() - windowMs;
    return this.metrics.filter((m) => m.timestamp > cutoff);
  }

  getDatabaseMetrics (windowMs = 60_000): DatabaseMetric[] {
    const cutoff = Date.now() - windowMs;
    return this.databaseMetrics.filter((m) => m.timestamp > cutoff);
  }

  getSystemHealth (): SystemHealth {
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

  getUserMetrics (windowMs = 60_000): Record<string, { count: number; errors: number }> {
    const recent = this.getMetrics(windowMs);
    const result: Record<string, { count: number; errors: number }> = {};
    for (const m of recent) {
      if (!result[m.userId]) result[m.userId] = { count: 0, errors: 0 };
      result[m.userId].count++;
      if (m.statusCode >= 400) result[m.userId].errors++;
    }
    return result;
  }

  getEndpointMetrics (windowMs = 60_000): Record<string, { count: number; avgResponseMs: number }> {
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

  /**
   * Export metrics in Prometheus text format for scraping
   */
  getPrometheusMetrics (): string {
    const lines: string[] = [];
    const timestamp = Math.floor(Date.now() / 1000);

    // HTTP request counters
    for (const [method, count] of Object.entries(this.requestCountByMethod)) {
      lines.push(`http_requests_total{method="${method}"} ${count}`);
    }

    // Status code counters
    for (const [status, count] of Object.entries(this.requestCountByStatus)) {
      lines.push(`http_requests_by_status_total{status="${status}"} ${count}`);
    }

    // Response time histogram
    let cumulative = 0;
    for (let i = 0; i < HISTOGRAM_BUCKETS.length; i++) {
      cumulative += this.responseTimeHistogram[i];
      const upper = HISTOGRAM_BUCKETS[i];
      lines.push(`http_response_time_seconds_bucket{le="${upper}"} ${cumulative}`);
    }
    // +Inf bucket
    lines.push(`http_response_time_seconds_bucket{le="+Inf"} ${this.totalRequests}`);

    // Summary quantiles (approximate)
    if (this.totalRequests > 0) {
      const avgMs = this.totalResponseTimeMs / this.totalRequests;
      lines.push(`http_response_time_seconds_sum ${(avgMs / 1000).toFixed(6)}`);
      lines.push(`http_response_time_seconds_count ${this.totalRequests}`);
    }

    return lines.join('\n') + '\n';
  }

  /**
   * Get histogram bucket distribution
   */
  getHistogramBuckets (): { buckets: number[]; labels: string[] } {
    return {
      buckets: [...this.responseTimeHistogram],
      labels: [...HISTOGRAM_BUCKETS.map(String), '+Inf'],
    };
  }

  /**
   * Reset counters (useful for testing)
   */
  resetCounters () {
    this.requestCountByMethod = {};
    this.requestCountByStatus = {};
    this.requestCountByPath = {};
    this.responseTimeHistogram = new Array(HISTOGRAM_BUCKETS.length + 1).fill(0);
    this.totalResponseTimeMs = 0;
    this.totalRequests = 0;
  }
}

export const metricsCollector = new MetricsCollector();
/**
 * Performance Monitor for Wata-Board
 * Tracks application performance metrics including response times, throughput, and error rates
 */

import { performance } from 'perf_hooks';
import {
  PerformanceMetrics,
  RequestMetrics,
  EndpointMetrics,
  TransactionMetrics,
  ErrorMetrics,
  RecentError,
  ResponseTimeMetrics,
  MonitoringConfig,
  createTimestamp
} from '../../../shared/monitoring-types';

interface RequestRecord {
  timestamp: number;
  method: string;
  path: string;
  statusCode: number;
  responseTime: number;
  userId?: string;
  error?: string;
}

interface TransactionRecord {
  timestamp: number;
  success: boolean;
  processingTime: number;
  amount: number;
  userId?: string;
  error?: string;
}

export class PerformanceMonitor {
  private config: MonitoringConfig;
  private requests: RequestRecord[] = [];
  private transactions: TransactionRecord[] = [];
  private errors: RecentError[] = [];
  private responseTimes: number[] = [];
  
  // Time window for metrics (1 minute)
  private readonly timeWindow = 60 * 1000;

  constructor(config: MonitoringConfig) {
    this.config = config;
  }

  /**
   * Record an HTTP request
   */
  recordRequest(
    method: string,
    path: string,
    statusCode: number,
    responseTime: number,
    userId?: string,
    error?: string
  ): void {
    const record: RequestRecord = {
      timestamp: Date.now(),
      method,
      path,
      statusCode,
      responseTime,
      userId,
      error
    };

    this.requests.push(record);
    this.responseTimes.push(responseTime);

    // Record errors
    if (error && statusCode >= 400) {
      this.recordError(this.getErrorLevel(statusCode), error, path, userId);
    }

    // Clean old records
    this.cleanOldRecords();
  }

  /**
   * Record a transaction
   */
  recordTransaction(
    success: boolean,
    processingTime: number,
    amount: number,
    userId?: string,
    error?: string
  ): void {
    const record: TransactionRecord = {
      timestamp: Date.now(),
      success,
      processingTime,
      amount,
      userId,
      error
    };

    this.transactions.push(record);

    if (!success && error) {
      this.recordError('critical', error, 'transaction', userId);
    }

    // Clean old records
    this.cleanOldRecords();
  }

  /**
   * Record an error
   */
  recordError(
    level: 'critical' | 'warning' | 'info',
    message: string,
    endpoint?: string,
    userId?: string,
    stack?: string
  ): void {
    const error: RecentError = {
      timestamp: createTimestamp(),
      level,
      message,
      endpoint,
      userId,
      stack
    };

    this.errors.push(error);
    
    // Keep only recent errors (last 100)
    if (this.errors.length > 100) {
      this.errors = this.errors.slice(-100);
    }
  }

  /**
   * Get current performance metrics
   */
  getPerformanceMetrics(): PerformanceMetrics {
    const now = Date.now();
    const windowStart = now - this.timeWindow;

    const recentRequests = this.requests.filter(r => r.timestamp >= windowStart);
    const recentTransactions = this.transactions.filter(t => t.timestamp >= windowStart);
    const recentErrors = this.errors.filter(e => 
      new Date(e.timestamp).getTime() >= windowStart
    );

    return {
      timestamp: createTimestamp(),
      requests: this.getRequestMetrics(recentRequests),
      transactions: this.getTransactionMetrics(recentTransactions),
      errors: this.getErrorMetrics(recentErrors),
      responseTime: this.getResponseTimeMetrics()
    };
  }

  /**
   * Get request metrics
   */
  private getRequestMetrics(requests: RequestRecord[]): RequestMetrics {
    const total = requests.length;
    const success = requests.filter(r => r.statusCode < 400).length;
    const error = requests.filter(r => r.statusCode >= 400).length;
    const rateLimit = requests.filter(r => r.statusCode === 429).length;

    // Group by endpoint
    const endpointMap = new Map<string, EndpointMetrics>();
    
    requests.forEach(req => {
      const key = `${req.method}:${req.path}`;
      const existing = endpointMap.get(key) || {
        path: req.path,
        method: req.method,
        requests: 0,
        avgResponseTime: 0,
        errorRate: 0
      };

      existing.requests++;
      endpointMap.set(key, existing);
    });

    // Calculate averages and error rates
    endpointMap.forEach((metrics, key) => {
      const endpointRequests = requests.filter(r => `${r.method}:${r.path}` === key);
      const totalResponseTime = endpointRequests.reduce((sum, r) => sum + r.responseTime, 0);
      const errorCount = endpointRequests.filter(r => r.statusCode >= 400).length;
      
      metrics.avgResponseTime = Math.round(totalResponseTime / endpointRequests.length);
      metrics.errorRate = Math.round((errorCount / endpointRequests.length) * 100 * 100) / 100;
    });

    return {
      total,
      success,
      error,
      rateLimit,
      endpoints: Array.from(endpointMap.values())
    };
  }

  /**
   * Get transaction metrics
   */
  private getTransactionMetrics(transactions: TransactionRecord[]): TransactionMetrics {
    const total = transactions.length;
    const successful = transactions.filter(t => t.success).length;
    const failed = transactions.filter(t => !t.success).length;
    
    // Calculate average processing time
    const avgProcessingTime = total > 0 
      ? Math.round(transactions.reduce((sum, t) => sum + t.processingTime, 0) / total)
      : 0;

    // Calculate total volume
    const totalVolume = transactions
      .filter(t => t.success)
      .reduce((sum, t) => sum + t.amount, 0);

    return {
      total,
      successful,
      failed,
      queued: 0, // This would come from the rate limiter
      avgProcessingTime,
      totalVolume
    };
  }

  /**
   * Get error metrics
   */
  private getErrorMetrics(errors: RecentError[]): ErrorMetrics {
    const total = errors.length;
    const critical = errors.filter(e => e.level === 'critical').length;
    const warning = errors.filter(e => e.level === 'warning').length;
    const info = errors.filter(e => e.level === 'info').length;

    return {
      total,
      critical,
      warning,
      info,
      recentErrors: errors.slice(-10) // Last 10 errors
    };
  }

  /**
   * Get response time metrics
   */
  private getResponseTimeMetrics(): ResponseTimeMetrics {
    if (this.responseTimes.length === 0) {
      return {
        avg: 0,
        p50: 0,
        p95: 0,
        p99: 0,
        min: 0,
        max: 0
      };
    }

    const sorted = [...this.responseTimes].sort((a, b) => a - b);
    const len = sorted.length;

    return {
      avg: Math.round(this.responseTimes.reduce((sum, time) => sum + time, 0) / len),
      p50: Math.round(sorted[Math.floor(len * 0.5)]),
      p95: Math.round(sorted[Math.floor(len * 0.95)]),
      p99: Math.round(sorted[Math.floor(len * 0.99)]),
      min: sorted[0],
      max: sorted[len - 1]
    };
  }

  /**
   * Get error level from HTTP status code
   */
  private getErrorLevel(statusCode: number): 'critical' | 'warning' | 'info' {
    if (statusCode >= 500) return 'critical';
    if (statusCode >= 400) return 'warning';
    return 'info';
  }

  /**
   * Clean old records outside the time window
   */
  private cleanOldRecords(): void {
    const cutoff = Date.now() - this.timeWindow;

    this.requests = this.requests.filter(r => r.timestamp >= cutoff);
    this.transactions = this.transactions.filter(t => t.timestamp >= cutoff);
    
    // Keep response times for the same window
    this.responseTimes = this.responseTimes.slice(-1000); // Keep last 1000 measurements
  }

  /**
   * Get metrics history
   */
  getMetricsHistory(limit?: number): PerformanceMetrics[] {
    // This would be implemented with a time-series database in production
    // For now, return empty array
    return [];
  }

  /**
   * Reset all metrics
   */
  resetMetrics(): void {
    this.requests = [];
    this.transactions = [];
    this.errors = [];
    this.responseTimes = [];
  }
}

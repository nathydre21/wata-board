/**
 * Shared monitoring type definitions for Wata-Board project
 * Ensures consistent monitoring data formats across frontend and backend
 */

import { Timestamp } from './types';

/**
 * System health status
 */
export interface SystemHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: Timestamp;
  uptime: number; // Server uptime in seconds
  memory: MemoryUsage;
  cpu: CpuUsage;
  disk: DiskUsage;
  network: NetworkStatus;
}

/**
 * Memory usage statistics
 */
export interface MemoryUsage {
  total: number; // Total memory in MB
  used: number; // Used memory in MB
  free: number; // Free memory in MB
  percentage: number; // Usage percentage
  heapUsed: number; // Node.js heap used in MB
  heapTotal: number; // Node.js heap total in MB
}

/**
 * CPU usage statistics
 */
export interface CpuUsage {
  percentage: number; // CPU usage percentage
  loadAverage: number[]; // Load average (1, 5, 15 minutes)
  cores: number; // Number of CPU cores
}

/**
 * Disk usage statistics
 */
export interface DiskUsage {
  total: number; // Total disk space in GB
  used: number; // Used disk space in GB
  free: number; // Free disk space in GB
  percentage: number; // Usage percentage
}

/**
 * Network connectivity status
 */
export interface NetworkStatus {
  stellar: ConnectionStatus;
  rpc: ConnectionStatus;
  database?: ConnectionStatus;
}

/**
 * Connection status for external services
 */
export interface ConnectionStatus {
  connected: boolean;
  responseTime: number; // Response time in milliseconds
  lastCheck: Timestamp;
  error?: string;
}

/**
 * Performance metrics
 */
export interface PerformanceMetrics {
  timestamp: Timestamp;
  requests: RequestMetrics;
  transactions: TransactionMetrics;
  errors: ErrorMetrics;
  responseTime: ResponseTimeMetrics;
}

/**
 * HTTP request metrics
 */
export interface RequestMetrics {
  total: number; // Total requests in the last minute
  success: number; // Successful requests
  error: number; // Failed requests
  rateLimit: number; // Rate limited requests
  endpoints: EndpointMetrics[]; // Per-endpoint metrics
}

/**
 * Per-endpoint metrics
 */
export interface EndpointMetrics {
  path: string;
  method: string;
  requests: number;
  avgResponseTime: number;
  errorRate: number;
}

/**
 * Transaction metrics
 */
export interface TransactionMetrics {
  total: number; // Total transactions in the last minute
  successful: number; // Successful transactions
  failed: number; // Failed transactions
  queued: number; // Currently queued transactions
  avgProcessingTime: number; // Average processing time in milliseconds
  totalVolume: number; // Total transaction volume
}

/**
 * Error metrics
 */
export interface ErrorMetrics {
  total: number; // Total errors in the last minute
  critical: number; // Critical errors
  warning: number; // Warning errors
  info: number; // Info errors
  recentErrors: RecentError[]; // Recent error details
}

/**
 * Recent error details
 */
export interface RecentError {
  timestamp: Timestamp;
  level: 'critical' | 'warning' | 'info';
  message: string;
  endpoint?: string;
  userId?: string;
  stack?: string;
}

/**
 * Response time metrics
 */
export interface ResponseTimeMetrics {
  avg: number; // Average response time in milliseconds
  p50: number; // 50th percentile
  p95: number; // 95th percentile
  p99: number; // 99th percentile
  min: number; // Minimum response time
  max: number; // Maximum response time
}

/**
 * Business metrics
 */
export interface BusinessMetrics {
  timestamp: Timestamp;
  users: UserMetrics;
  payments: PaymentMetrics;
  rateLimiting: RateLimitMetrics;
}

/**
 * User activity metrics
 */
export interface UserMetrics {
  active: number; // Active users in the last hour
  new: number; // New users in the last day
  total: number; // Total registered users
  concurrent: number; // Currently connected users (WebSocket)
}

/**
 * Payment business metrics
 */
export interface PaymentMetrics {
  volume24h: number; // Total payment volume in 24 hours
  transactions24h: number; // Total transactions in 24 hours
  avgAmount: number; // Average payment amount
  topMeters: MeterPaymentStats[]; // Top meters by payment volume
}

/**
 * Meter payment statistics
 */
export interface MeterPaymentStats {
  meterId: string;
  totalPaid: number;
  transactionCount: number;
  lastPayment: Timestamp;
}

/**
 * Rate limiting metrics
 */
export interface RateLimitMetrics {
  activeUsers: number; // Users currently rate limited
  queuedRequests: number; // Total queued requests
  avgWaitTime: number; // Average wait time for queued requests
  topUsers: UserRateLimitStats[]; // Users with highest rate limit hits
}

/**
 * User rate limiting statistics
 */
export interface UserRateLimitStats {
  userId: string;
  hits: number;
  queued: number;
  lastHit: Timestamp;
}

/**
 * Real-time monitoring event
 */
export interface MonitoringEvent {
  id: string;
  type: 'health' | 'performance' | 'business' | 'alert';
  timestamp: Timestamp;
  data: SystemHealth | PerformanceMetrics | BusinessMetrics | Alert;
}

/**
 * Alert definition
 */
export interface Alert {
  id: string;
  level: 'critical' | 'warning' | 'info';
  title: string;
  message: string;
  timestamp: Timestamp;
  resolved: boolean;
  resolvedAt?: Timestamp;
  source: string; // Source component or metric
  metadata?: Record<string, any>;
}

/**
 * Monitoring configuration
 */
export interface MonitoringConfig {
  enabled: boolean;
  interval: number; // Monitoring interval in milliseconds
  retention: number; // Data retention period in hours
  alerts: AlertConfig;
  websocket: WebSocketConfig;
}

/**
 * Alert configuration
 */
export interface AlertConfig {
  enabled: boolean;
  thresholds: {
    cpu: number; // CPU usage threshold (%)
    memory: number; // Memory usage threshold (%)
    disk: number; // Disk usage threshold (%)
    responseTime: number; // Response time threshold (ms)
    errorRate: number; // Error rate threshold (%)
    stellarResponseTime: number; // Stellar response time threshold (ms)
  };
}

/**
 * WebSocket configuration
 */
export interface WebSocketConfig {
  enabled: boolean;
  port: number;
  path: string;
  heartbeatInterval: number; // Heartbeat interval in milliseconds
}

/**
 * Create a standardized timestamp
 */
export function createTimestamp(date?: Date): Timestamp {
  return (date || new Date()).toISOString();
}

/**
 * Create a monitoring event
 */
export function createMonitoringEvent(
  type: MonitoringEvent['type'],
  data: MonitoringEvent['data']
): MonitoringEvent {
  return {
    id: `event_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    type,
    timestamp: createTimestamp(),
    data
  };
}

/**
 * Create an alert
 */
export function createAlert(
  level: Alert['level'],
  title: string,
  message: string,
  source: string,
  metadata?: Record<string, any>
): Alert {
  return {
    id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    level,
    title,
    message,
    timestamp: createTimestamp(),
    resolved: false,
    source,
    metadata
  };
}

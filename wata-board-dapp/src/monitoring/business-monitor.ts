/**
 * Business Monitor for Wata-Board
 * Tracks business metrics including user activity, payment volumes, and rate limiting statistics
 */

import {
  BusinessMetrics,
  UserMetrics,
  PaymentMetrics,
  MeterPaymentStats,
  RateLimitMetrics,
  UserRateLimitStats,
  MonitoringConfig,
  createTimestamp
} from '../../../shared/monitoring-types';

interface UserActivity {
  userId: string;
  lastSeen: number;
  requestCount: number;
}

interface PaymentRecord {
  meterId: string;
  amount: number;
  timestamp: number;
  userId?: string;
  success: boolean;
}

export class BusinessMonitor {
  private config: MonitoringConfig;
  private userActivities: Map<string, UserActivity> = new Map();
  private payments: PaymentRecord[] = [];
  private concurrentUsers: Set<string> = new Set();
  private rateLimitHits: Map<string, { count: number; lastHit: number; queued: number }> = new Map();

  constructor(config: MonitoringConfig) {
    this.config = config;
  }

  /**
   * Record user activity
   */
  recordUserActivity(userId: string): void {
    const now = Date.now();
    const existing = this.userActivities.get(userId);

    if (existing) {
      existing.lastSeen = now;
      existing.requestCount++;
    } else {
      this.userActivities.set(userId, {
        userId,
        lastSeen: now,
        requestCount: 1
      });
    }

    // Add to concurrent users
    this.concurrentUsers.add(userId);

    // Clean old activities
    this.cleanOldUserActivities();
  }

  /**
   * Record a payment
   */
  recordPayment(meterId: string, amount: number, success: boolean, userId?: string): void {
    const record: PaymentRecord = {
      meterId,
      amount,
      timestamp: Date.now(),
      userId,
      success
    };

    this.payments.push(record);
    this.cleanOldPayments();
  }

  /**
   * Record rate limit hit
   */
  recordRateLimitHit(userId: string, queued: boolean = false): void {
    const now = Date.now();
    const existing = this.rateLimitHits.get(userId);

    if (existing) {
      existing.count++;
      existing.lastHit = now;
      if (queued) existing.queued++;
    } else {
      this.rateLimitHits.set(userId, {
        count: 1,
        lastHit: now,
        queued: queued ? 1 : 0
      });
    }

    this.cleanOldRateLimitHits();
  }

  /**
   * Remove user from concurrent users
   */
  removeConcurrentUser(userId: string): void {
    this.concurrentUsers.delete(userId);
  }

  /**
   * Get current business metrics
   */
  getBusinessMetrics(): BusinessMetrics {
    return {
      timestamp: createTimestamp(),
      users: this.getUserMetrics(),
      payments: this.getPaymentMetrics(),
      rateLimiting: this.getRateLimitMetrics()
    };
  }

  /**
   * Get user metrics
   */
  private getUserMetrics(): UserMetrics {
    const now = Date.now();
    const oneHourAgo = now - (60 * 60 * 1000);
    const oneDayAgo = now - (24 * 60 * 60 * 1000);

    // Active users in the last hour
    const activeUsers = Array.from(this.userActivities.values())
      .filter(user => user.lastSeen >= oneHourAgo)
      .length;

    // New users in the last day (simplified - assumes first activity = new user)
    const newUsers = Array.from(this.userActivities.values())
      .filter(user => user.requestCount === 1 && user.lastSeen >= oneDayAgo)
      .length;

    return {
      active: activeUsers,
      new: newUsers,
      total: this.userActivities.size,
      concurrent: this.concurrentUsers.size
    };
  }

  /**
   * Get payment metrics
   */
  private getPaymentMetrics(): PaymentMetrics {
    const now = Date.now();
    const twentyFourHoursAgo = now - (24 * 60 * 60 * 1000);

    const recentPayments = this.payments.filter(p => p.timestamp >= twentyFourHoursAgo);
    const successfulPayments = recentPayments.filter(p => p.success);

    // Calculate 24h volume and transaction count
    const volume24h = successfulPayments.reduce((sum, p) => sum + p.amount, 0);
    const transactions24h = successfulPayments.length;

    // Calculate average amount
    const avgAmount = successfulPayments.length > 0
      ? volume24h / successfulPayments.length
      : 0;

    // Get top meters by payment volume
    const meterStats = new Map<string, { total: number; count: number; lastPayment: number }>();
    
    successfulPayments.forEach(payment => {
      const existing = meterStats.get(payment.meterId) || { total: 0, count: 0, lastPayment: 0 };
      existing.total += payment.amount;
      existing.count++;
      existing.lastPayment = Math.max(existing.lastPayment, payment.timestamp);
      meterStats.set(payment.meterId, existing);
    });

    const topMeters: MeterPaymentStats[] = Array.from(meterStats.entries())
      .map(([meterId, stats]) => ({
        meterId,
        totalPaid: stats.total,
        transactionCount: stats.count,
        lastPayment: createTimestamp(new Date(stats.lastPayment))
      }))
      .sort((a, b) => b.totalPaid - a.totalPaid)
      .slice(0, 10); // Top 10 meters

    return {
      volume24h,
      transactions24h,
      avgAmount: Math.round(avgAmount * 100) / 100,
      topMeters
    };
  }

  /**
   * Get rate limiting metrics
   */
  private getRateLimitMetrics(): RateLimitMetrics {
    const now = Date.now();
    const oneHourAgo = now - (60 * 60 * 1000);

    const recentHits = Array.from(this.rateLimitHits.entries())
      .filter(([_, data]) => data.lastHit >= oneHourAgo);

    const activeUsers = recentHits.length;
    const queuedRequests = recentHits.reduce((sum, [_, data]) => sum + data.queued, 0);
    const avgWaitTime = this.calculateAverageWaitTime();

    // Get top users by rate limit hits
    const topUsers: UserRateLimitStats[] = recentHits
      .map(([userId, data]) => ({
        userId,
        hits: data.count,
        queued: data.queued,
        lastHit: createTimestamp(new Date(data.lastHit))
      }))
      .sort((a, b) => b.hits - a.hits)
      .slice(0, 10); // Top 10 users

    return {
      activeUsers,
      queuedRequests,
      avgWaitTime,
      topUsers
    };
  }

  /**
   * Calculate average wait time for queued requests
   */
  private calculateAverageWaitTime(): number {
    // This is a simplified calculation
    // In a real implementation, you'd track actual wait times
    return 0; // Placeholder
  }

  /**
   * Clean old user activities
   */
  private cleanOldUserActivities(): void {
    const now = Date.now();
    const oneDayAgo = now - (24 * 60 * 60 * 1000);

    for (const [userId, activity] of this.userActivities.entries()) {
      if (activity.lastSeen < oneDayAgo) {
        this.userActivities.delete(userId);
        this.concurrentUsers.delete(userId);
      }
    }
  }

  /**
   * Clean old payment records
   */
  private cleanOldPayments(): void {
    const now = Date.now();
    const sevenDaysAgo = now - (7 * 24 * 60 * 60 * 1000);

    this.payments = this.payments.filter(p => p.timestamp >= sevenDaysAgo);
  }

  /**
   * Clean old rate limit hits
   */
  private cleanOldRateLimitHits(): void {
    const now = Date.now();
    const oneDayAgo = now - (24 * 60 * 60 * 1000);

    for (const [userId, data] of this.rateLimitHits.entries()) {
      if (data.lastHit < oneDayAgo) {
        this.rateLimitHits.delete(userId);
      }
    }
  }

  /**
   * Get metrics history
   */
  getMetricsHistory(limit?: number): BusinessMetrics[] {
    // This would be implemented with a time-series database in production
    // For now, return empty array
    return [];
  }

  /**
   * Reset all metrics
   */
  resetMetrics(): void {
    this.userActivities.clear();
    this.payments = [];
    this.concurrentUsers.clear();
    this.rateLimitHits.clear();
  }

  /**
   * Get specific user statistics
   */
  getUserStats(userId: string): UserActivity | undefined {
    return this.userActivities.get(userId);
  }

  /**
   * Get specific meter statistics
   */
  getMeterStats(meterId: string): { totalPaid: number; transactionCount: number } {
    const meterPayments = this.payments.filter(p => p.meterId === meterId && p.success);
    return {
      totalPaid: meterPayments.reduce((sum, p) => sum + p.amount, 0),
      transactionCount: meterPayments.length
    };
  }
}

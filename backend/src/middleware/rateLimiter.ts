/**
 * Tiered Rate Limiter Middleware (#85)
 *
 * Sliding-window rate limiter that respects user tiers.
 * Exposes both an Express middleware and a programmatic API
 * (checkLimit / getStatus) so the monitoring service (#99)
 * can query rate-limit state without consuming a slot.
 */

import { Request, Response, NextFunction } from 'express';
import { UserTier, TierRateLimitStatus } from '../types/userTier';
import { getRateLimitForTier } from '../config/rateLimits';
import { userTierService } from '../services/userTierService';
import logger from '../utils/logger';

interface WindowEntry {
  timestamps: number[];
  queueCount: number;
}

export class TieredRateLimiter {
  private windows: Map<string, WindowEntry> = new Map();
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    // Prune stale entries every 2 minutes
    this.cleanupInterval = setInterval(() => this.cleanup(), 2 * 60 * 1000);
  }

  // ── Core logic ─────────────────────────────────────────────

  /**
   * Check (and consume) one request slot for a user.
   */
  checkLimit(userId: string): TierRateLimitStatus {
    const tier = userTierService.getUserTier(userId);
    const config = getRateLimitForTier(tier);
    const now = Date.now();
    const windowStart = now - config.windowMs;

    let entry = this.windows.get(userId);
    if (!entry) {
      entry = { timestamps: [], queueCount: 0 };
      this.windows.set(userId, entry);
    }

    // Slide the window
    entry.timestamps = entry.timestamps.filter((t) => t > windowStart);

    const remaining = config.maxRequests - entry.timestamps.length;
    const resetTime = new Date(
      entry.timestamps.length > 0
        ? entry.timestamps[0] + config.windowMs
        : now + config.windowMs,
    );

    if (remaining > 0) {
      entry.timestamps.push(now);
      return {
        tier,
        allowed: true,
        remainingRequests: remaining - 1,
        resetTime: resetTime.toISOString(),
        queued: false,
        limit: config.maxRequests,
      };
    }

    // Try to queue the request
    if (entry.queueCount < config.queueSize) {
      entry.queueCount++;
      return {
        tier,
        allowed: false,
        remainingRequests: 0,
        resetTime: resetTime.toISOString(),
        queued: true,
        queuePosition: entry.queueCount,
        limit: config.maxRequests,
      };
    }

    // Rejected entirely
    return {
      tier,
      allowed: false,
      remainingRequests: 0,
      resetTime: resetTime.toISOString(),
      queued: false,
      limit: config.maxRequests,
    };
  }

  /**
   * Read-only status check (does NOT consume a request slot).
   */
  getStatus(userId: string): TierRateLimitStatus {
    const tier = userTierService.getUserTier(userId);
    const config = getRateLimitForTier(tier);
    const now = Date.now();
    const windowStart = now - config.windowMs;

    const entry = this.windows.get(userId);
    const timestamps = entry
      ? entry.timestamps.filter((t) => t > windowStart)
      : [];
    const remaining = Math.max(0, config.maxRequests - timestamps.length);
    const resetTime = new Date(
      timestamps.length > 0
        ? timestamps[0] + config.windowMs
        : now + config.windowMs,
    );

    return {
      tier,
      allowed: remaining > 0,
      remainingRequests: remaining,
      resetTime: resetTime.toISOString(),
      queued: false,
      limit: config.maxRequests,
    };
  }

  // ── Express middleware factory ─────────────────────────────

  middleware() {
    return (req: Request, res: Response, next: NextFunction) => {
      const userId =
        (req.headers['x-user-id'] as string) || req.ip || 'unknown';
      const status = this.checkLimit(userId);

      // Always expose rate-limit headers
      res.set('X-RateLimit-Limit', String(status.limit));
      res.set('X-RateLimit-Remaining', String(status.remainingRequests));
      res.set(
        'X-RateLimit-Reset',
        String(Math.ceil(new Date(status.resetTime).getTime() / 1000)),
      );
      res.set('X-RateLimit-Tier', status.tier);

      if (!status.allowed && !status.queued) {
        logger.warn('Rate limit exceeded', { userId, tier: status.tier });
        return res.status(429).json({
          error: 'Rate limit exceeded',
          tier: status.tier,
          retryAfter: Math.ceil(
            (new Date(status.resetTime).getTime() - Date.now()) / 1000,
          ),
          limit: status.limit,
        });
      }

      if (status.queued) {
        logger.info('Request queued', {
          userId,
          tier: status.tier,
          position: status.queuePosition,
        });
        return res.status(202).json({
          message: 'Request queued',
          queuePosition: status.queuePosition,
          tier: status.tier,
        });
      }

      return next();
    };
  }

  // ── Helpers ────────────────────────────────────────────────

  private cleanup() {
    const now = Date.now();
    for (const [userId, entry] of this.windows.entries()) {
      entry.timestamps = entry.timestamps.filter(
        (t) => t > now - 5 * 60 * 1000,
      );
      if (entry.timestamps.length === 0 && entry.queueCount === 0) {
        this.windows.delete(userId);
      }
    }
  }

  destroy() {
    clearInterval(this.cleanupInterval);
  }
}

/** Singleton instance */
export const tieredRateLimiter = new TieredRateLimiter();

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
import { getPublisher, isRedisEnabled } from '../utils/redis';

interface WindowEntry {
  timestamps: number[];
  queueCount: number;
}

export class TieredRateLimiter {
  private windows: Map<string, WindowEntry> = new Map();
  private cleanupInterval: NodeJS.Timeout;
  private redisEnabled: boolean;

  constructor() {
    this.redisEnabled = isRedisEnabled();

    // Prune stale entries every 2 minutes
    this.cleanupInterval = setInterval(() => this.cleanup(), 2 * 60 * 1000);
  }

  // ── Core logic ─────────────────────────────────────────────

  /**
   * Check (and consume) one request slot for a user.
   */
  async checkLimit(userId: string): Promise<TierRateLimitStatus> {
    const tier = userTierService.getUserTier(userId);
    const config = getRateLimitForTier(tier);
    const now = Date.now();
    const windowStart = now - config.windowMs;

    if (this.redisEnabled) {
      return this.checkLimitRedis(userId, tier, config, now);
    }

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
  async getStatus(userId: string): Promise<TierRateLimitStatus> {
    const tier = userTierService.getUserTier(userId);
    const config = getRateLimitForTier(tier);
    const now = Date.now();

    if (this.redisEnabled) {
      return this.getStatusRedis(userId, tier, config, now);
    }

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
    return async (req: Request, res: Response, next: NextFunction) => {
      try {
        const userId =
          (req.headers['x-user-id'] as string) || req.ip || 'unknown';
        const status = await this.checkLimit(userId);
        const resetAtMs = Date.parse(status.resetTime);

        // Always expose rate-limit headers
        res.set('X-RateLimit-Limit', String(status.limit));
        res.set('X-RateLimit-Remaining', String(status.remainingRequests));
        res.set(
          'X-RateLimit-Reset',
          String(Math.ceil(resetAtMs / 1000)),
        );
        res.set('X-RateLimit-Tier', status.tier);

        if (!status.allowed && !status.queued) {
          logger.warn('Rate limit exceeded', { userId, tier: status.tier });
          return res.status(429).json({
            error: 'Rate limit exceeded',
            tier: status.tier,
            retryAfter: Math.ceil((resetAtMs - Date.now()) / 1000),
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
      } catch (error) {
        logger.error('Rate limiter middleware failure', { error });
        return next(error);
      }
    };
  }

  // ── Helpers ────────────────────────────────────────────────

  private cleanup() {
    if (this.redisEnabled) {
      // Redis key expiry handles cleanup in distributed mode.
      return;
    }

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

  private buildRedisKeys(userId: string): { requestsKey: string; queueKey: string } {
    return {
      requestsKey: `rl:tier:requests:${userId}`,
      queueKey: `rl:tier:queue:${userId}`,
    };
  }

  private toStatus(
    tier: UserTier,
    allowed: number,
    remainingRequests: number,
    resetTimeMs: number,
    queued: number,
    queuePosition: number,
    limit: number,
  ): TierRateLimitStatus {
    return {
      tier,
      allowed: allowed === 1,
      remainingRequests,
      resetTime: new Date(resetTimeMs).toISOString(),
      queued: queued === 1,
      queuePosition: queuePosition > 0 ? queuePosition : undefined,
      limit,
    };
  }

  private async checkLimitRedis(
    userId: string,
    tier: UserTier,
    config: { windowMs: number; maxRequests: number; queueSize: number },
    now: number,
  ): Promise<TierRateLimitStatus> {
    const client = getPublisher();
    const { requestsKey, queueKey } = this.buildRedisKeys(userId);
    const member = `${now}-${Math.random().toString(36).slice(2, 10)}`;

    const script = `
      local requestsKey = KEYS[1]
      local queueKey = KEYS[2]
      local now = tonumber(ARGV[1])
      local windowMs = tonumber(ARGV[2])
      local maxRequests = tonumber(ARGV[3])
      local queueSize = tonumber(ARGV[4])
      local member = ARGV[5]
      local windowStart = now - windowMs

      redis.call('ZREMRANGEBYSCORE', requestsKey, '-inf', windowStart)
      local count = redis.call('ZCARD', requestsKey)

      if count < maxRequests then
        redis.call('ZADD', requestsKey, now, member)
        redis.call('PEXPIRE', requestsKey, windowMs)
        local minData = redis.call('ZRANGE', requestsKey, 0, 0, 'WITHSCORES')
        local reset = now + windowMs
        if minData[2] then
          reset = tonumber(minData[2]) + windowMs
        end
        local remaining = maxRequests - count - 1
        return {1, remaining, reset, 0, 0, maxRequests}
      end

      local queueCount = redis.call('INCR', queueKey)
      if queueCount == 1 then
        redis.call('PEXPIRE', queueKey, windowMs)
      end

      local minData = redis.call('ZRANGE', requestsKey, 0, 0, 'WITHSCORES')
      local reset = now + windowMs
      if minData[2] then
        reset = tonumber(minData[2]) + windowMs
      end

      if queueCount <= queueSize then
        return {0, 0, reset, 1, queueCount, maxRequests}
      end

      redis.call('DECR', queueKey)
      return {0, 0, reset, 0, 0, maxRequests}
    `;

    const result = (await client.eval(
      script,
      2,
      requestsKey,
      queueKey,
      String(now),
      String(config.windowMs),
      String(config.maxRequests),
      String(config.queueSize),
      member,
    )) as [number, number, number, number, number, number];

    return this.toStatus(
      tier,
      Number(result[0]),
      Number(result[1]),
      Number(result[2]),
      Number(result[3]),
      Number(result[4]),
      Number(result[5]),
    );
  }

  private async getStatusRedis(
    userId: string,
    tier: UserTier,
    config: { windowMs: number; maxRequests: number; queueSize: number },
    now: number,
  ): Promise<TierRateLimitStatus> {
    const client = getPublisher();
    const { requestsKey } = this.buildRedisKeys(userId);

    const script = `
      local requestsKey = KEYS[1]
      local now = tonumber(ARGV[1])
      local windowMs = tonumber(ARGV[2])
      local maxRequests = tonumber(ARGV[3])
      local windowStart = now - windowMs

      redis.call('ZREMRANGEBYSCORE', requestsKey, '-inf', windowStart)
      local count = redis.call('ZCARD', requestsKey)
      local minData = redis.call('ZRANGE', requestsKey, 0, 0, 'WITHSCORES')
      local reset = now + windowMs
      if minData[2] then
        reset = tonumber(minData[2]) + windowMs
      end

      local remaining = maxRequests - count
      if remaining < 0 then remaining = 0 end
      local allowed = 0
      if remaining > 0 then allowed = 1 end

      return {allowed, remaining, reset, maxRequests}
    `;

    const result = (await client.eval(
      script,
      1,
      requestsKey,
      String(now),
      String(config.windowMs),
      String(config.maxRequests),
    )) as [number, number, number, number];

    return this.toStatus(
      tier,
      Number(result[0]),
      Number(result[1]),
      Number(result[2]),
      0,
      0,
      Number(result[3]),
    );
  }
}

/** Singleton instance */
export const tieredRateLimiter = new TieredRateLimiter();

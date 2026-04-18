/**
 * Tier-based Rate Limit Configuration (#85)
 *
 * Defines per-tier request limits:
 *   anonymous  →  5 req/min
 *   verified   → 15 req/min
 *   premium    → 50 req/min
 *   admin      → 200 req/min
 */

import { UserTier, TierRateLimitConfig } from '../types/userTier';

export const TIER_RATE_LIMITS: Record<UserTier, TierRateLimitConfig> = {
  [UserTier.ANONYMOUS]: {
    windowMs: 60 * 1000,
    maxRequests: 5,
    queueSize: 5,
  },
  [UserTier.VERIFIED]: {
    windowMs: 60 * 1000,
    maxRequests: 15,
    queueSize: 10,
  },
  [UserTier.PREMIUM]: {
    windowMs: 60 * 1000,
    maxRequests: 50,
    queueSize: 25,
  },
  [UserTier.ADMIN]: {
    windowMs: 60 * 1000,
    maxRequests: 200,
    queueSize: 50,
  },
};

/**
 * Get the rate-limit configuration for a given user tier.
 * Falls back to ANONYMOUS limits for unknown tiers.
 */
export function getRateLimitForTier(tier: UserTier): TierRateLimitConfig {
  return TIER_RATE_LIMITS[tier] ?? TIER_RATE_LIMITS[UserTier.ANONYMOUS];
}

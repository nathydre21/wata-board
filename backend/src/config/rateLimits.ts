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
import { EndpointType } from '../../shared/types';

/**
 * Multiplier applied to tier rate limits based on endpoint type.
 * READ endpoints are more generous (3x the tier limit).
 * WRITE endpoints use the base tier limit (1x).
 */
export const ENDPOINT_TYPE_MULTIPLIERS: Record<EndpointType, number> = {
  [EndpointType.READ]: 3,
  [EndpointType.WRITE]: 1,
};

/**
 * Get the rate limit multiplier for a given endpoint type.
 * Defaults to WRITE (1x) if not specified (stricter default).
 */
export function getEndpointTypeMultiplier(endpointType?: EndpointType): number {
  if (!endpointType) return 1;
  return ENDPOINT_TYPE_MULTIPLIERS[endpointType] ?? 1;
}

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

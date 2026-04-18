/**
 * User Tier Types for Advanced Rate Limiting (#85)
 */

export enum UserTier {
  ANONYMOUS = 'anonymous',
  VERIFIED = 'verified',
  PREMIUM = 'premium',
  ADMIN = 'admin',
}

export interface TierRateLimitConfig {
  /** Time window in milliseconds */
  windowMs: number;
  /** Max requests allowed per window */
  maxRequests: number;
  /** Max queue size for overflow requests */
  queueSize: number;
}

export interface UserTierInfo {
  userId: string;
  tier: UserTier;
  walletAddress?: string;
  verifiedAt?: Date;
  premiumExpiresAt?: Date;
}

export interface TierRateLimitStatus {
  tier: UserTier;
  allowed: boolean;
  remainingRequests: number;
  resetTime: Date;
  queued: boolean;
  queuePosition?: number;
  limit: number;
}

/**
 * Backend User Tier Types - Re-export from shared types for consistency
 */
export {
  UserTier,
  TierRateLimitConfig,
  UserTierInfo,
  TierRateLimitStatus
} from '../../shared/types';

// Backend-specific utility functions for user tier management
import { UserTier, UserTierInfo } from '../../shared/types';

export function isUserVerified(tierInfo: UserTierInfo): boolean {
  return tierInfo.tier === UserTier.VERIFIED || 
         tierInfo.tier === UserTier.PREMIUM || 
         tierInfo.tier === UserTier.ADMIN;
}

export function isUserPremium(tierInfo: UserTierInfo): boolean {
  return tierInfo.tier === UserTier.PREMIUM || tierInfo.tier === UserTier.ADMIN;
}

export function hasAdminPrivileges(tierInfo: UserTierInfo): boolean {
  return tierInfo.tier === UserTier.ADMIN;
}

/**
 * User Tier Service (#85)
 *
 * Manages user tier assignments, wallet-based verification,
 * and premium upgrades. In production this should be backed
 * by Redis / a database instead of an in-memory Map.
 */

import { UserTier, UserTierInfo } from '../types/userTier';
import logger from '../utils/logger';

export class UserTierService {
  private userTiers: Map<string, UserTierInfo> = new Map();

  /**
   * Get the tier for a user. Defaults to ANONYMOUS.
   */
  getUserTier(userId: string): UserTier {
    const info = this.userTiers.get(userId);
    if (!info) return UserTier.ANONYMOUS;

    // Auto-downgrade if premium has expired
    if (
      info.tier === UserTier.PREMIUM &&
      info.premiumExpiresAt &&
      info.premiumExpiresAt < new Date()
    ) {
      logger.info('Premium expired, downgrading to VERIFIED', { userId });
      info.tier = UserTier.VERIFIED;
      this.userTiers.set(userId, info);
    }

    return info.tier;
  }

  /**
   * Get full user-tier info (returns default ANONYMOUS object if unknown)
   */
  getUserTierInfo(userId: string): UserTierInfo {
    return (
      this.userTiers.get(userId) ?? {
        userId,
        tier: UserTier.ANONYMOUS,
      }
    );
  }

  /**
   * Verify a user via wallet signature (upgrades ANONYMOUS → VERIFIED).
   */
  async verifyUser(
    userId: string,
    walletAddress: string,
    signature: string,
  ): Promise<UserTierInfo> {
    const isValid = this.validateWalletSignature(walletAddress, signature);
    if (!isValid) {
      throw new Error('Invalid wallet signature');
    }

    const info: UserTierInfo = {
      userId,
      tier: UserTier.VERIFIED,
      walletAddress,
      verifiedAt: new Date(),
    };

    this.userTiers.set(userId, info);
    logger.info('User verified', { userId, walletAddress });
    return info;
  }

  /**
   * Upgrade a user to premium for `durationDays` days.
   */
  upgradeToPremium(userId: string, durationDays: number = 30): UserTierInfo {
    const existing = this.getUserTierInfo(userId);
    const info: UserTierInfo = {
      ...existing,
      tier: UserTier.PREMIUM,
      premiumExpiresAt: new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000),
    };

    this.userTiers.set(userId, info);
    logger.info('User upgraded to premium', { userId, durationDays });
    return info;
  }

  /**
   * Set admin tier (internal / bootstrap use).
   */
  setAdminTier(userId: string): UserTierInfo {
    const existing = this.getUserTierInfo(userId);
    const info: UserTierInfo = { ...existing, tier: UserTier.ADMIN };
    this.userTiers.set(userId, info);
    return info;
  }

  /**
   * List all known users and their tiers (admin dashboard).
   */
  listAllUsers(): UserTierInfo[] {
    return Array.from(this.userTiers.values());
  }

  // ── Private ────────────────────────────────────────────────

  /**
   * Validate a wallet signature.
   * TODO: replace with real Stellar Keypair.verify() in production.
   */
  private validateWalletSignature(
    _walletAddress: string,
    _signature: string,
  ): boolean {
    return _signature.length > 0;
  }
}

/** Singleton instance */
export const userTierService = new UserTierService();

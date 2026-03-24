/**
 * Wallet Balance Service for Stellar Accounts
 * Provides real-time balance tracking and multi-currency support
 */

import { Server, Asset, Networks } from '@stellar/stellar-sdk';
import { requestAccess, isConnected } from '@stellar/freighter-api';
import { getCurrentNetworkConfig } from '../utils/network-config';

export interface BalanceInfo {
  assetCode: string;
  assetIssuer?: string;
  balance: string;
  assetType: 'native' | 'credit_alphanum4' | 'credit_alphanum12';
  isNative: boolean;
}

export interface WalletBalance {
  publicKey: string;
  balances: BalanceInfo[];
  nativeBalance: number;
  totalBalanceUSD?: number;
  lastUpdated: Date;
  network: string;
}

export interface BalanceUpdateCallback {
  (balance: WalletBalance): void;
}

export class WalletBalanceService {
  private server: Server;
  private networkConfig: any;
  private balanceCache: Map<string, { balance: WalletBalance; timestamp: number }> = new Map();
  private updateCallbacks: Set<BalanceUpdateCallback> = new Set();
  private refreshInterval: NodeJS.Timeout | null = null;
  private readonly CACHE_DURATION = 30000; // 30 seconds cache

  constructor() {
    this.networkConfig = getCurrentNetworkConfig();
    this.server = new Server(this.networkConfig.rpcUrl);
  }

  /**
   * Get current wallet balance
   */
  async getWalletBalance(): Promise<WalletBalance | null> {
    try {
      if (!(await isConnected())) {
        throw new Error('Wallet not connected');
      }

      const publicKey = await requestAccess();
      if (!publicKey) {
        throw new Error('Could not get public key');
      }

      // Check cache first
      const cached = this.balanceCache.get(publicKey);
      if (cached && Date.now() - cached.timestamp < this.CACHE_DURATION) {
        return cached.balance;
      }

      // Fetch fresh balance from Stellar
      const account = await this.server.loadAccount(publicKey);
      const balances = this.parseBalances(account.balances);
      const nativeBalance = this.getNativeBalance(balances);

      const walletBalance: WalletBalance = {
        publicKey,
        balances,
        nativeBalance,
        lastUpdated: new Date(),
        network: this.networkConfig.networkPassphrase === Networks.PUBLIC ? 'mainnet' : 'testnet'
      };

      // Update cache
      this.balanceCache.set(publicKey, {
        balance: walletBalance,
        timestamp: Date.now()
      });

      // Notify callbacks
      this.notifyUpdate(walletBalance);

      return walletBalance;
    } catch (error) {
      console.error('Failed to get wallet balance:', error);
      return null;
    }
  }

  /**
   * Parse balances from Stellar account response
   */
  private parseBalances(stellarBalances: any[]): BalanceInfo[] {
    return stellarBalances.map(balance => ({
      assetCode: balance.asset_type === 'native' ? 'XLM' : balance.asset_code,
      assetIssuer: balance.asset_issuer,
      balance: balance.balance,
      assetType: balance.asset_type,
      isNative: balance.asset_type === 'native'
    }));
  }

  /**
   * Get native XLM balance
   */
  private getNativeBalance(balances: BalanceInfo[]): number {
    const nativeBalance = balances.find(b => b.isNative);
    return nativeBalance ? parseFloat(nativeBalance.balance) : 0;
  }

  /**
   * Subscribe to balance updates
   */
  subscribe(callback: BalanceUpdateCallback): () => void {
    this.updateCallbacks.add(callback);
    return () => this.updateCallbacks.delete(callback);
  }

  /**
   * Notify all subscribers of balance update
   */
  private notifyUpdate(balance: WalletBalance): void {
    this.updateCallbacks.forEach(callback => {
      try {
        callback(balance);
      } catch (error) {
        console.error('Balance update callback error:', error);
      }
    });
  }

  /**
   * Start real-time balance monitoring
   */
  startRealTimeUpdates(intervalMs: number = 15000): void {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
    }

    this.refreshInterval = setInterval(async () => {
      await this.getWalletBalance();
    }, intervalMs);
  }

  /**
   * Stop real-time balance monitoring
   */
  stopRealTimeUpdates(): void {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
  }

  /**
   * Force refresh balance (clears cache)
   */
  async refreshBalance(): Promise<WalletBalance | null> {
    const publicKey = await requestAccess();
    if (publicKey) {
      this.balanceCache.delete(publicKey);
    }
    return this.getWalletBalance();
  }

  /**
   * Check if balance is sufficient for transaction
   */
  isSufficientBalance(balance: WalletBalance, requiredAmount: number, includeReserve: boolean = true): boolean {
    const minimumReserve = includeReserve ? 2 : 0; // 2 XLM minimum reserve
    return balance.nativeBalance >= (requiredAmount + minimumReserve);
  }

  /**
   * Get low balance warning threshold
   */
  getLowBalanceThreshold(): number {
    return 5; // 5 XLM threshold
  }

  /**
   * Check if balance is low
   */
  isLowBalance(balance: WalletBalance): boolean {
    return balance.nativeBalance < this.getLowBalanceThreshold();
  }

  /**
   * Format balance for display
   */
  formatBalance(balance: string, decimals: number = 7): string {
    const num = parseFloat(balance);
    if (num === 0) return '0';
    if (num < 0.000001) return '< 0.000001';
    return num.toFixed(decimals);
  }

  /**
   * Get balance by asset code
   */
  getBalanceByAsset(balance: WalletBalance, assetCode: string): BalanceInfo | null {
    return balance.balances.find(b => b.assetCode === assetCode) || null;
  }

  /**
   * Calculate total USD value (mock implementation)
   */
  async calculateTotalUSD(balance: WalletBalance): Promise<number> {
    // In a real implementation, you'd fetch current market prices
    // For now, we'll use a mock XLM price
    const mockXLMPrice = 0.10; // $0.10 per XLM
    return balance.nativeBalance * mockXLMPrice;
  }

  /**
   * Clear cache and stop updates
   */
  cleanup(): void {
    this.stopRealTimeUpdates();
    this.balanceCache.clear();
    this.updateCallbacks.clear();
  }
}

// Create singleton instance
export const walletBalanceService = new WalletBalanceService();

// Utility functions
export const balanceUtils = {
  /**
   * Format XLM amount with proper decimal places
   */
  formatXLM: (amount: string | number, decimals: number = 7): string => {
    const num = typeof amount === 'string' ? parseFloat(amount) : amount;
    if (num === 0) return '0 XLM';
    if (num < 0.000001) return '< 0.000001 XLM';
    return `${num.toFixed(decimals)} XLM`;
  },

  /**
   * Get asset display name
   */
  getAssetDisplayName: (balance: BalanceInfo): string => {
    if (balance.isNative) return 'XLM';
    return `${balance.assetCode}${balance.assetIssuer ? ` (${balance.assetIssuer.slice(0, 8)}...)` : ''}`;
  },

  /**
   * Check if asset is native XLM
   */
  isNativeAsset: (balance: BalanceInfo): boolean => {
    return balance.isNative || balance.assetCode === 'XLM';
  },

  /**
   * Get balance status color
   */
  getBalanceStatusColor: (balance: WalletBalance): string => {
    if (balance.nativeBalance === 0) return 'text-red-500';
    if (balance.nativeBalance < 1) return 'text-orange-500';
    if (balance.nativeBalance < 5) return 'text-yellow-500';
    return 'text-green-500';
  },

  /**
   * Get balance status text
   */
  getBalanceStatusText: (balance: WalletBalance): string => {
    if (balance.nativeBalance === 0) return 'No Balance';
    if (balance.nativeBalance < 1) return 'Very Low';
    if (balance.nativeBalance < 5) return 'Low';
    return 'Sufficient';
  }
};

export default walletBalanceService;

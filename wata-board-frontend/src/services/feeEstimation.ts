/**
 * Fee Estimation Service for Stellar Transactions
 * Provides accurate fee estimation for Stellar network transactions
 */

import { Server, Networks, TransactionBuilder, Operation, Asset, BASE_FEE } from '@stellar/stellar-sdk';
import { requestAccess } from '@stellar/freighter-api';
import { getCurrentNetworkConfig } from '../utils/network-config';

export interface FeeEstimate {
  baseFee: number; // Base fee in stroops
  totalFee: number; // Total fee in XLM
  minFee: number; // Minimum recommended fee in XLM
  recommendedFee: number; // Recommended fee for current network conditions
  operationCount: number;
  estimatedTime: number; // Estimated confirmation time in seconds
}

export interface TransactionDetails {
  amount: string;
  destination: string;
  asset?: Asset;
  memo?: string;
}

export class FeeEstimationService {
  private server: Server;
  private networkConfig: any;

  constructor() {
    this.networkConfig = getCurrentNetworkConfig();
    this.server = new Server(this.networkConfig.rpcUrl);
  }

  /**
   * Get current network fee statistics
   */
  async getNetworkFees(): Promise<{
    minFee: number;
    recommendedFee: number;
    p50Fee: number;
    p90Fee: number;
  }> {
    try {
      // Get recent ledgers to analyze fee trends
      const latestLedger = await this.server.ledgers()
        .limit(1)
        .order('desc')
        .call();

      // For now, use Stellar's base fee as minimum
      // In a production environment, you'd analyze recent transactions
      const minFee = BASE_FEE;
      const recommendedFee = Math.max(BASE_FEE, 100); // At least 100 stroops
      const p50Fee = Math.max(BASE_FEE, 200); // 50th percentile
      const p90Fee = Math.max(BASE_FEE, 500); // 90th percentile

      return {
        minFee,
        recommendedFee,
        p50Fee,
        p90Fee
      };
    } catch (error) {
      console.error('Failed to get network fees:', error);
      // Fallback to base fee
      return {
        minFee: BASE_FEE,
        recommendedFee: BASE_FEE * 2,
        p50Fee: BASE_FEE * 3,
        p90Fee: BASE_FEE * 5
      };
    }
  }

  /**
   * Estimate fees for a simple payment transaction
   */
  async estimatePaymentFee(
    amount: string,
    destination: string = "CDRRJ7IPYDL36YSK5ZQLBG3LICULETIBXX327AGJQNTWXNKY2UMDO4DA"
  ): Promise<FeeEstimate> {
    try {
      // Get the public key from Freighter
      const publicKey = await requestAccess();
      if (!publicKey) {
        throw new Error('Could not get public key from wallet');
      }

      // Get account details
      const account = await this.server.loadAccount(publicKey);

      // Get network fee statistics
      const networkFees = await this.getNetworkFees();

      // Create a sample transaction to estimate fees
      const transaction = new TransactionBuilder(account, {
        fee: networkFees.recommendedFee,
        networkPassphrase: this.networkConfig.networkPassphrase,
      })
        .addOperation(Operation.payment({
          destination,
          asset: Asset.native(),
          amount,
        }))
        .setTimeout(30)
        .build();

      // Calculate fees
      const operationCount = transaction.operations.length;
      const baseFee = parseInt(transaction.fee);
      const totalFeeStroops = baseFee * operationCount;
      const totalFeeXLM = totalFeeStroops / 10000000; // Convert from stroops to XLM

      return {
        baseFee,
        totalFee: totalFeeXLM,
        minFee: networkFees.minFee / 10000000,
        recommendedFee: networkFees.recommendedFee / 10000000,
        operationCount,
        estimatedTime: this.estimateConfirmationTime(networkFees.recommendedFee)
      };
    } catch (error) {
      console.error('Fee estimation failed:', error);
      // Return fallback estimate
      return {
        baseFee: BASE_FEE,
        totalFee: BASE_FEE / 10000000,
        minFee: BASE_FEE / 10000000,
        recommendedFee: (BASE_FEE * 2) / 10000000,
        operationCount: 1,
        estimatedTime: 5
      };
    }
  }

  /**
   * Estimate fees for complex transactions with multiple operations
   */
  async estimateComplexTransactionFee(
    operations: Operation[],
    fee: number = BASE_FEE * 2
  ): Promise<FeeEstimate> {
    try {
      const publicKey = await requestAccess();
      if (!publicKey) {
        throw new Error('Could not get public key from wallet');
      }

      const account = await this.server.loadAccount(publicKey);
      const networkFees = await this.getNetworkFees();

      const transaction = new TransactionBuilder(account, {
        fee,
        networkPassphrase: this.networkConfig.networkPassphrase,
      });

      // Add all operations
      operations.forEach(op => transaction.addOperation(op));
      
      transaction.setTimeout(30).build();

      const operationCount = transaction.operations.length;
      const baseFee = parseInt(transaction.fee);
      const totalFeeStroops = baseFee * operationCount;
      const totalFeeXLM = totalFeeStroops / 10000000;

      return {
        baseFee,
        totalFee: totalFeeXLM,
        minFee: networkFees.minFee / 10000000,
        recommendedFee: networkFees.recommendedFee / 10000000,
        operationCount,
        estimatedTime: this.estimateConfirmationTime(fee)
      };
    } catch (error) {
      console.error('Complex fee estimation failed:', error);
      return {
        baseFee: fee,
        totalFee: (fee * operations.length) / 10000000,
        minFee: BASE_FEE / 10000000,
        recommendedFee: (BASE_FEE * 2) / 10000000,
        operationCount: operations.length,
        estimatedTime: 5
      };
    }
  }

  /**
   * Estimate confirmation time based on fee
   */
  private estimateConfirmationTime(feeStroops: number): number {
    // Simple heuristic based on fee amount
    if (feeStroops >= 500) return 3; // High priority
    if (feeStroops >= 200) return 5; // Medium priority
    if (feeStroops >= 100) return 10; // Low priority
    return 15; // Very low priority
  }

  /**
   * Get fee recommendations for different priority levels
   */
  async getFeeRecommendations(): Promise<{
    economy: { fee: number; time: number };
    standard: { fee: number; time: number };
    priority: { fee: number; time: number };
  }> {
    const networkFees = await this.getNetworkFees();

    return {
      economy: {
        fee: networkFees.minFee / 10000000,
        time: this.estimateConfirmationTime(networkFees.minFee)
      },
      standard: {
        fee: networkFees.recommendedFee / 10000000,
        time: this.estimateConfirmationTime(networkFees.recommendedFee)
      },
      priority: {
        fee: networkFees.p90Fee / 10000000,
        time: this.estimateConfirmationTime(networkFees.p90Fee)
      }
    };
  }

  /**
   * Format fee for display
   */
  formatFee(feeXLM: number, decimals: number = 7): string {
    return feeXLM.toFixed(decimals) + ' XLM';
  }

  /**
   * Calculate total cost including fees
   */
  calculateTotalCost(amount: number, fee: number): number {
    return amount + fee;
  }
}

// Create singleton instance
export const feeEstimationService = new FeeEstimationService();

// Utility functions
export const feeUtils = {
  /**
   * Convert stroops to XLM
   */
  stroopsToXLM: (stroops: number): number => stroops / 10000000,

  /**
   * Convert XLM to stroops
   */
  xlmToStroops: (xlm: number): number => Math.floor(xlm * 10000000),

  /**
   * Check if fee is sufficient for current network conditions
   */
  isFeeSufficient: (feeStroops: number, networkFees: any): boolean => {
    return feeStroops >= networkFees.minFee;
  },

  /**
   * Get fee priority level
   */
  getFeePriority: (feeStroops: number, networkFees: any): 'economy' | 'standard' | 'priority' => {
    if (feeStroops >= networkFees.p90Fee) return 'priority';
    if (feeStroops >= networkFees.recommendedFee) return 'standard';
    return 'economy';
  }
};

export default feeEstimationService;

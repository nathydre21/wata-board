import { useCallback, useMemo, useState } from 'react';
import {
  Account,
  Address,
  Asset,
  BASE_FEE,
  Contract,
  Horizon,
  Keypair,
  Operation,
  Transaction,
  TransactionBuilder,
  nativeToScVal,
  rpc,
  scValToNative,
  xdr,
} from '@stellar/stellar-sdk';
import { isConnected, requestAccess, signTransaction } from '../utils/wallet-bridge';
import { getCurrentNetworkConfig } from '../utils/network-config';
import { feeEstimationService } from '../services/feeEstimation';

export interface Review {
  reviewer: string;
  rating: number;
  comment: string;
  timestamp: number;
  transaction_hash: string;
}

export interface RatingStats {
  total_reviews: number;
  average_rating: number;
  rating_counts: number[];
}

export interface RatingHookReturn {
  submitReview: (rating: number, comment: string) => Promise<{ success: boolean; txHash?: string; error?: string }>;
  getUserReview: (userAddress: string) => Promise<Review | null>;
  getAllReviews: () => Promise<Review[]>;
  getRatingStats: () => Promise<RatingStats>;
  verifyReview: (userAddress: string, txHash: string) => Promise<boolean>;
  isLoading: boolean;
  error: string | null;
}

const getDynamicFee = async (): Promise<string> => {
  try {
    const fees = await feeEstimationService.getNetworkFees();
    return fees.recommendedFee.toString();
  } catch {
    return BASE_FEE;
  }
};

export const useRating = (): RatingHookReturn => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const networkConfig = getCurrentNetworkConfig();

  // Horizon is used for classic operations (the self-payment that anchors a
  // review), while the Soroban RPC server drives the contract invocations.
  const horizonServer = useMemo(
    () => new Horizon.Server(networkConfig.rpcUrl.replace('soroban', 'horizon')),
    [networkConfig.rpcUrl],
  );
  const sorobanServer = useMemo(() => new rpc.Server(networkConfig.rpcUrl), [networkConfig.rpcUrl]);

  /**
   * Build and simulate a read-only contract call. A throwaway source account is
   * sufficient because simulation never touches the ledger.
   */
  const simulateContractCall = useCallback(
    async (fn: string, args: xdr.ScVal[] = []) => {
      const contract = new Contract(networkConfig.contractId);
      const source = new Account(Keypair.random().publicKey(), '0');
      const tx = new TransactionBuilder(source, {
        fee: BASE_FEE,
        networkPassphrase: networkConfig.networkPassphrase,
      })
        .addOperation(contract.call(fn, ...args))
        .setTimeout(30)
        .build();

      return sorobanServer.simulateTransaction(tx);
    },
    [networkConfig.contractId, networkConfig.networkPassphrase, sorobanServer],
  );

  const submitReview = useCallback(
    async (rating: number, comment: string): Promise<{ success: boolean; txHash?: string; error?: string }> => {
      setIsLoading(true);
      setError(null);

      try {
        // Check if wallet is connected
        const connection = await isConnected();
        if (!connection.isConnected) {
          throw new Error('Please connect your wallet first');
        }

        // Validate inputs
        if (rating < 1 || rating > 5) {
          throw new Error('Rating must be between 1 and 5');
        }

        if (comment.length > 500) {
          throw new Error('Review comment must be less than 500 characters');
        }

        if (comment.trim().length === 0) {
          throw new Error('Review comment cannot be empty');
        }

        // Get user's public key
        const access = await requestAccess();
        if (access.error || !access.address) {
          throw new Error(access.error || 'Could not get wallet access');
        }
        const publicKey = access.address;

        // Anchor the review to a real on-chain transaction. A minimal self
        // transfer is used purely to obtain a verifiable transaction hash.
        const account = await horizonServer.loadAccount(publicKey);
        const anchorTx = new TransactionBuilder(account, {
          fee: await getDynamicFee(),
          networkPassphrase: networkConfig.networkPassphrase,
        })
          .addOperation(
            Operation.payment({
              destination: publicKey, // Self-transfer for minimal cost
              asset: Asset.native(),
              amount: '0.0000001', // Minimum amount
            }),
          )
          .setTimeout(30)
          .build();

        const signedAnchor = await signTransaction(anchorTx.toXDR());
        if (signedAnchor.error) {
          throw new Error(signedAnchor.error);
        }
        const anchorResult = await horizonServer.submitTransaction(
          TransactionBuilder.fromXDR(signedAnchor.signedTxXdr, networkConfig.networkPassphrase),
        );

        // Record the review on the smart contract, referencing the anchor hash.
        const contract = new Contract(networkConfig.contractId);
        const sorobanAccount = await sorobanServer.getAccount(publicKey);
        const reviewTx = new TransactionBuilder(sorobanAccount, {
          fee: await getDynamicFee(),
          networkPassphrase: networkConfig.networkPassphrase,
        })
          .addOperation(
            contract.call(
              'submit_review',
              new Address(publicKey).toScVal(), // reviewer: Address
              nativeToScVal(rating, { type: 'i64' }), // rating: i64
              nativeToScVal(comment, { type: 'string' }), // comment: String
              nativeToScVal(anchorResult.hash, { type: 'string' }), // transaction_hash: String
            ),
          )
          .setTimeout(30)
          .build();

        // Prepare (simulate + assemble Soroban data), sign and submit.
        const preparedTx = await sorobanServer.prepareTransaction(reviewTx);
        const signedReview = await signTransaction(preparedTx.toXDR());
        if (signedReview.error) {
          throw new Error(signedReview.error);
        }
        const reviewResult = await sorobanServer.sendTransaction(
          new Transaction(signedReview.signedTxXdr, networkConfig.networkPassphrase),
        );

        return {
          success: true,
          txHash: reviewResult.hash,
        };
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to submit review';
        setError(errorMessage);
        return {
          success: false,
          error: errorMessage,
        };
      } finally {
        setIsLoading(false);
      }
    },
    [horizonServer, sorobanServer, networkConfig.contractId, networkConfig.networkPassphrase],
  );

  const getUserReview = useCallback(
    async (userAddress: string): Promise<Review | null> => {
      try {
        const sim = await simulateContractCall('get_user_review', [new Address(userAddress).toScVal()]);

        if (rpc.Api.isSimulationSuccess(sim) && sim.result) {
          const decoded = scValToNative(sim.result.retval) as Review | null;
          if (decoded) {
            return {
              reviewer: decoded.reviewer,
              rating: decoded.rating,
              comment: decoded.comment,
              timestamp: decoded.timestamp,
              transaction_hash: decoded.transaction_hash,
            };
          }
        }

        return null;
      } catch (err) {
        console.error('Error getting user review:', err);
        return null;
      }
    },
    [simulateContractCall],
  );

  const getAllReviews = useCallback(async (): Promise<Review[]> => {
    try {
      const sim = await simulateContractCall('get_all_reviews');

      if (rpc.Api.isSimulationSuccess(sim) && sim.result) {
        const decoded = scValToNative(sim.result.retval) as Review[] | null;
        if (Array.isArray(decoded)) {
          return decoded.map((review) => ({
            reviewer: review.reviewer,
            rating: review.rating,
            comment: review.comment,
            timestamp: review.timestamp,
            transaction_hash: review.transaction_hash,
          }));
        }
      }

      return [];
    } catch (err) {
      console.error('Error getting all reviews:', err);
      return [];
    }
  }, [simulateContractCall]);

  const getRatingStats = useCallback(async (): Promise<RatingStats> => {
    try {
      const sim = await simulateContractCall('get_rating_stats');

      if (rpc.Api.isSimulationSuccess(sim) && sim.result) {
        const decoded = scValToNative(sim.result.retval) as RatingStats | null;
        if (decoded) {
          return {
            total_reviews: decoded.total_reviews,
            average_rating: (decoded.average_rating ?? 0) / 10, // Convert back from *10
            rating_counts: decoded.rating_counts,
          };
        }
      }

      return {
        total_reviews: 0,
        average_rating: 0,
        rating_counts: [0, 0, 0, 0, 0],
      };
    } catch (err) {
      console.error('Error getting rating stats:', err);
      return {
        total_reviews: 0,
        average_rating: 0,
        rating_counts: [0, 0, 0, 0, 0],
      };
    }
  }, [simulateContractCall]);

  const verifyReview = useCallback(
    async (userAddress: string, txHash: string): Promise<boolean> => {
      try {
        const sim = await simulateContractCall('verify_review', [
          new Address(userAddress).toScVal(),
          nativeToScVal(txHash, { type: 'string' }),
        ]);

        if (rpc.Api.isSimulationSuccess(sim) && sim.result) {
          return Boolean(scValToNative(sim.result.retval));
        }

        return false;
      } catch (err) {
        console.error('Error verifying review:', err);
        return false;
      }
    },
    [simulateContractCall],
  );

  return {
    submitReview,
    getUserReview,
    getAllReviews,
    getRatingStats,
    verifyReview,
    isLoading,
    error,
  };
};

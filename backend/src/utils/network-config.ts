/**
 * Backend Network Configuration - Re-export from shared types for consistency
 */
export {
  NetworkType,
  NetworkConfig,
  NETWORKS,
  getNetworkConfig,
  getCurrentNetworkConfig,
  isValidNetwork
} from '../../shared/types';

// Backend-specific override for getNetworkFromEnv
import { NetworkType as SharedNetworkType } from '../../shared/types';

export function getNetworkFromEnv(): SharedNetworkType {
  // For backend (Node.js): process.env.NETWORK
  const network = process.env.NETWORK;
  return network === 'mainnet' ? 'mainnet' : 'testnet';
}

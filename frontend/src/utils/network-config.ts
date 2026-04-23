/**
 * Frontend Network Configuration - Re-export from shared types for consistency
 */
export {
  NetworkType,
  NetworkConfig,
  NETWORKS,
  getNetworkConfig,
  getCurrentNetworkConfig,
  isValidNetwork
} from '../../../shared/types';

// Frontend-specific override for getNetworkFromEnv
import { NetworkType as SharedNetworkType } from '../../../shared/types';

export function getNetworkFromEnv(): SharedNetworkType {
  // For frontend (Vite): import.meta.env.VITE_NETWORK
  const network = import.meta.env.VITE_NETWORK;
  return network === 'mainnet' ? 'mainnet' : 'testnet';
}

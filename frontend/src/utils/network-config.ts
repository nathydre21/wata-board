/**
 * Frontend Network Configuration - Re-export from shared types for consistency
 */
export type { NetworkType, NetworkConfig } from '../../../shared/types';
export {
  NETWORKS,
  getNetworkConfig,
  getCurrentNetworkConfig,
  isValidNetwork
} from '../../../shared/types';
// Frontend-specific override for getNetworkFromEnv
import type { NetworkType as SharedNetworkType } from '../../../shared/types';
export function getNetworkFromEnv(): SharedNetworkType {
  const network = import.meta.env.VITE_NETWORK;
  return network === 'mainnet' ? 'mainnet' : 'testnet';
}

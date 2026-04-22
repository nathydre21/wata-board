import type { NetworkConfig as SharedNetworkConfig } from './types';

export type NetworkType = 'testnet' | 'mainnet';

// Re-export for backward compatibility
export type NetworkConfig = SharedNetworkConfig;

export const NETWORKS: Record<NetworkType, NetworkConfig> = {
  testnet: {
    networkPassphrase: "Test SDF Network ; September 2015",
    contractId: "CDRRJ7IPYDL36YSK5ZQLBG3LICULETIBXX327AGJQNTWXNKY2UMDO4DA",
    rpcUrl: "https://soroban-testnet.stellar.org",
    networkType: 'testnet'
  },
  mainnet: {
    networkPassphrase: "Public Global Stellar Network ; September 2015",
    contractId: "MAINNET_CONTRACT_ID_HERE", // Replace with actual mainnet contract ID
    rpcUrl: "https://soroban.stellar.org",
    networkType: 'mainnet'
  },
};

export function getNetworkConfig(network: NetworkType): NetworkConfig {
  return NETWORKS[network];
}

export function getNetworkFromEnv(): NetworkType {
  // For frontend (Vite): import.meta.env.VITE_NETWORK
  // For backend (Node.js): process.env.NETWORK
  if (typeof window !== 'undefined' && import.meta.env) {
    // Frontend environment
    const network = import.meta.env.VITE_NETWORK;
    return network === 'mainnet' ? 'mainnet' : 'testnet';
  } else if (typeof window === 'undefined') {
    // Backend environment - check for process
    try {
      const network = process?.env?.NETWORK;
      return network === 'mainnet' ? 'mainnet' : 'testnet';
    } catch {
      // Fallback if process is not available
    }
  }
  
  // Default to testnet
  return 'testnet';
}

export function getCurrentNetworkConfig(): NetworkConfig {
  const network = getNetworkFromEnv();
  return getNetworkConfig(network);
}

export function isValidNetwork(network: string): network is NetworkType {
  return network === 'testnet' || network === 'mainnet';
}

/**
 * Multi-wallet provider abstraction for Stellar wallets
 * Supports: Freighter, Albedo, Rabet, WalletConnect
 */

export type WalletType = 'freighter' | 'albedo' | 'rabet' | 'walletconnect';

export interface WalletProvider {
  type: WalletType;
  name: string;
  icon?: string;
  isAvailable(): Promise<boolean>;
  connect(): Promise<{ address: string; error?: string }>;
  signTransaction(xdr: string, network?: string): Promise<{ signedTxXdr: string; error?: string }>;
  isConnected(): Promise<{ isConnected: boolean }>;
}

// Freighter implementation
const freighterProvider: WalletProvider = {
  type: 'freighter',
  name: 'Freighter',
  icon: '🦝',
  async isAvailable(): Promise<boolean> {
    try {
      const freighterApi = (window as any).freighterApi;
      const freighter = (window as any).freighter;
      return !!(freighterApi?.isConnected || freighter || 
        (typeof (window as any).freighterApi !== 'undefined'));
    } catch {
      return false;
    }
  },
  async connect(): Promise<{ address: string; error?: string }> {
    try {
      const { requestAccess } = await import('./wallet-bridge');
      return await requestAccess();
    } catch (e: any) {
      return { address: '', error: e.message };
    }
  },
  async signTransaction(xdr: string, network?: string): Promise<{ signedTxXdr: string; error?: string }> {
    try {
      const { signTransaction } = await import('./wallet-bridge');
      return await signTransaction(xdr, network);
    } catch (e: any) {
      return { signedTxXdr: '', error: e.message };
    }
  },
  async isConnected(): Promise<{ isConnected: boolean }> {
    try {
      const { isConnected } = await import('./wallet-bridge');
      return await isConnected();
    } catch (e: any) {
      return { isConnected: false };
    }
  }
};

// Albedo implementation
const albedoProvider: WalletProvider = {
  type: 'albedo',
  name: 'Albedo',
  icon: '🌅',
  async isAvailable(): Promise<boolean> {
    try {
      return !!(window as any).albedo;
    } catch {
      return false;
    }
  },
  async connect(): Promise<{ address: string; error?: string }> {
    try {
      const albedo = (window as any).albedo;
      if (!albedo) {
        return { address: '', error: 'Albedo wallet not detected' };
      }
      const result = await albedo.publicKey({});
      return { address: result.pubkey };
    } catch (e: any) {
      return { address: '', error: e.message };
    }
  },
  async signTransaction(xdr: string, network?: string): Promise<{ signedTxXdr: string; error?: string }> {
    try {
      const albedo = (window as any).albedo;
      if (!albedo) {
        return { signedTxXdr: '', error: 'Albedo wallet not detected' };
      }
      const result = await albedo.tx({ xdr, network });
      return { signedTxXdr: result.signed_envelope_xdr };
    } catch (e: any) {
      return { signedTxXdr: '', error: e.message };
    }
  },
  async isConnected(): Promise<{ isConnected: boolean }> {
    try {
      const albedo = (window as any).albedo;
      return { isConnected: !!albedo };
    } catch {
      return { isConnected: false };
    }
  }
};

// Rabet implementation
const rabetProvider: WalletProvider = {
  type: 'rabet',
  name: 'Rabet',
  icon: '🐇',
  async isAvailable(): Promise<boolean> {
    try {
      return !!(window as any).rabet;
    } catch {
      return false;
    }
  },
  async connect(): Promise<{ address: string; error?: string }> {
    try {
      const rabet = (window as any).rabet;
      if (!rabet) {
        return { address: '', error: 'Rabet wallet not detected' };
      }
      const result = await rabet.connect();
      return { address: result.publicKey };
    } catch (e: any) {
      return { address: '', error: e.message };
    }
  },
  async signTransaction(xdr: string, network?: string): Promise<{ signedTxXdr: string; error?: string }> {
    try {
      const rabet = (window as any).rabet;
      if (!rabet) {
        return { signedTxXdr: '', error: 'Rabet wallet not detected' };
      }
      const result = await rabet.sign(xdr, network);
      return { signedTxXdr: result.xdr };
    } catch (e: any) {
      return { signedTxXdr: '', error: e.message };
    }
  },
  async isConnected(): Promise<{ isConnected: boolean }> {
    try {
      const rabet = (window as any).rabet;
      return { isConnected: !!rabet };
    } catch {
      return { isConnected: false };
    }
  }
};

// WalletConnect implementation (placeholder - would need actual WalletConnect setup)
const walletConnectProvider: WalletProvider = {
  type: 'walletconnect',
  name: 'WalletConnect',
  icon: '🔗',
  async isAvailable(): Promise<boolean> {
    // WalletConnect requires setup, so we'll treat it as always available
    // but connection will fail if not properly configured
    return true;
  },
  async connect(): Promise<{ address: string; error?: string }> {
    return { address: '', error: 'WalletConnect integration not yet implemented' };
  },
  async signTransaction(xdr: string, network?: string): Promise<{ signedTxXdr: string; error?: string }> {
    return { signedTxXdr: '', error: 'WalletConnect integration not yet implemented' };
  },
  async isConnected(): Promise<{ isConnected: boolean }> {
    return { isConnected: false };
  }
};

export const walletProviders: Record<WalletType, WalletProvider> = {
  freighter: freighterProvider,
  albedo: albedoProvider,
  rabet: rabetProvider,
  walletconnect: walletConnectProvider
};

export async function getAvailableWallets(): Promise<WalletProvider[]> {
  const providers = Object.values(walletProviders);
  const availability = await Promise.all(
    providers.map(async (provider) => ({
      provider,
      available: await provider.isAvailable()
    }))
  );
  return availability
    .filter(({ available }) => available)
    .map(({ provider }) => provider);
}

export async function connectWallet(type: WalletType): Promise<{ address: string; error?: string }> {
  const provider = walletProviders[type];
  if (!provider) {
    return { address: '', error: `Wallet provider ${type} not found` };
  }
  return await provider.connect();
}

export async function signWithWallet(
  type: WalletType, 
  xdr: string, 
  network?: string
): Promise<{ signedTxXdr: string; error?: string }> {
  const provider = walletProviders[type];
  if (!provider) {
    return { signedTxXdr: '', error: `Wallet provider ${type} not found` };
  }
  return await provider.signTransaction(xdr, network);
}

export async function checkWalletConnection(type: WalletType): Promise<{ isConnected: boolean }> {
  const provider = walletProviders[type];
  if (!provider) {
    return { isConnected: false };
  }
  return await provider.isConnected();
}
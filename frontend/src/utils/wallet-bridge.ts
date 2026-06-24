import {
  isConnected as freighterIsConnected,
  requestAccess as freighterRequestAccess,
  signTransaction as freighterSignTransaction,
} from '@stellar/freighter-api';
import { connectWallet, signWithWallet, checkWalletConnection, type WalletType } from './wallet-providers';

/**
 * Robust wrapper for Stellar Wallet APIs with multi-wallet support
 * Maintains backward compatibility with existing Freighter-only code
 */

let currentWalletType: WalletType = 'freighter';

/**
 * Set the active wallet type for subsequent operations
 */
export function setWalletType(walletType: WalletType): void {
  currentWalletType = walletType;
  console.log(`[WalletBridge] Wallet type set to: ${walletType}`);
}

/**
 * Get the current active wallet type
 */
export function getWalletType(): WalletType {
  return currentWalletType;
}

/**
 * Check if the current wallet is connected
 */
export async function isConnected(): Promise<{ isConnected: boolean }> {
  console.log(`[WalletBridge] isConnected called for wallet: ${currentWalletType}`);
  
  if (currentWalletType === 'freighter') {
    const freighterApi = (window as any).freighterApi;
    const freighter = (window as any).freighter;
    
    if (freighterApi?.isConnected && typeof freighterApi.isConnected === 'function') {
        try {
            const result = await freighterApi.isConnected();
            if (typeof result === 'boolean') return { isConnected: result };
            if (result && typeof result === 'object' && 'isConnected' in result) return result;
        } catch (e) {
            console.warn('[WalletBridge] Error calling window.freighterApi.isConnected:', e);
        }
    }
    
    try {
        const result = await freighterIsConnected();
        if (typeof result === 'boolean') return { isConnected: result };
        if (result && typeof result === 'object' && 'isConnected' in result) return { isConnected: (result as any).isConnected };
        return { isConnected: !!freighter };
    } catch (e) {
        console.error('[WalletUtil] Library isConnected failed:', e);
        return { isConnected: !!freighter };
    }
  }
  
  return await checkWalletConnection(currentWalletType);
}

/**
 * Request access to the current wallet
 */
export async function requestAccess(): Promise<{ address: string; error?: string }> {
  console.log(`[WalletBridge] requestAccess called for wallet: ${currentWalletType}`);
  
  if (currentWalletType === 'freighter') {
    const freighterApi = (window as any).freighterApi;
    
    if (freighterApi?.requestAccess) {
        try {
            const result = await freighterApi.requestAccess();
            if (typeof result === 'string') return { address: result };
            if (result && typeof result === 'object') {
                const address = ((result as any).address || (result as any).publicKey || '').trim();
                return { address, error: (result as any).error };
            }
        } catch (e: any) {
            console.warn('[WalletBridge] Error calling window.freighterApi.requestAccess:', e);
        }
    }

    try {
        const result = await freighterRequestAccess();
        if (typeof result === 'string') return { address: result };
        if (result && typeof result === 'object') {
          const address = ((result as any).address || (result as any).publicKey || '').trim();
          return { address, error: (result as any).error };
        }
        return { address: '', error: 'Unknown error' };
    } catch (e: any) {
        console.error('[WalletUtil] Library requestAccess failed:', e);
        return { address: '', error: e.message };
    }
  }
  
  return await connectWallet(currentWalletType);
}

/**
 * Sign a transaction with the current wallet
 */
export async function signTransaction(xdr: string, network?: string): Promise<{ signedTxXdr: string; error?: string }> {
  console.log(`[WalletBridge] signTransaction called for wallet: ${currentWalletType}`);
  
  if (currentWalletType === 'freighter') {
    const freighterApi = (window as any).freighterApi;
    
    if (freighterApi?.signTransaction && typeof freighterApi.signTransaction === 'function') {
        try {
            const result = await freighterApi.signTransaction(xdr, { networkPassphrase: network });
            if (typeof result === 'string') return { signedTxXdr: result };
            return result;
        } catch (e: any) {
            console.warn('[WalletUtil] Error calling window.freighterApi.signTransaction:', e);
        }
    }

    try {
        const result = await freighterSignTransaction(xdr, { networkPassphrase: network });
        return { signedTxXdr: result.signedTxXdr, error: (result as any).error };
    } catch (e: any) {
        console.error('[WalletUtil] Library signTransaction failed:', e);
        return { signedTxXdr: '', error: e.message };
    }
  }
  
  return await signWithWallet(currentWalletType, xdr, network);
}

/**
 * Legacy functions for backward compatibility
 */
export async function isConnectedFreighter(): Promise<{ isConnected: boolean }> {
  return await isConnected();
}

export async function requestAccessFreighter(): Promise<{ address: string; error?: string }> {
  const originalWallet = currentWalletType;
  currentWalletType = 'freighter';
  const result = await requestAccess();
  currentWalletType = originalWallet;
  return result;
}

export async function signTransactionFreighter(xdr: string, network?: string): Promise<{ signedTxXdr: string; error?: string }> {
  const originalWallet = currentWalletType;
  currentWalletType = 'freighter';
  const result = await signTransaction(xdr, network);
  currentWalletType = originalWallet;
  return result;
}

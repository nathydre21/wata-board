import {
  isConnected as freighterIsConnected,
  requestAccess as freighterRequestAccess,
  signTransaction as freighterSignTransaction,
} from '@stellar/freighter-api';
  signTransaction as freighterSignTransaction
} from "@stellar/freighter-api";
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
 * Uses the currently selected wallet type
 */
export async function isConnected(): Promise<{ isConnected: boolean }> {
  console.log('[WalletBridge] isConnected called');
  try {
    const freighter = (window as any).freighter;
    if (freighter) {
      console.log('[WalletBridge] freighter detected on window');
      return { isConnected: true };
    }
    const result = await freighterIsConnected();
    console.log('[WalletBridge] freighterIsConnected result:', JSON.stringify(result));
    if (typeof result === 'boolean') return { isConnected: result };
    if (result && typeof result === 'object' && 'isConnected' in result) return { isConnected: (result as any).isConnected };
    return { isConnected: true };
  } catch (e) {
    console.error('[WalletBridge] isConnected error:', e);
    return { isConnected: true };
  }
  console.log(`[WalletBridge] isConnected called for wallet: ${currentWalletType}`);
  
  if (currentWalletType === 'freighter') {
    // Try direct access first if it's been mocked or injected directly
    const freighterApi = (window as any).freighterApi;
    const freighter = (window as any).freighter;
    
    if (freighterApi?.isConnected && typeof freighterApi.isConnected === 'function') {
        try {
            const result = await freighterApi.isConnected();
            console.log('[WalletBridge] window.freighterApi.isConnected result:', result);
            // Handle both boolean and object responses
            if (typeof result === 'boolean') return { isConnected: result };
            if (result && typeof result === 'object' && 'isConnected' in result) return result;
        } catch (e) {
            console.warn('[WalletBridge] Error calling window.freighterApi.isConnected:', e);
        }
    }
    
    // Fallback to library
    try {
        return await freighterIsConnected();
    } catch (e) {
        console.error('[WalletUtil] Library isConnected failed:', e);
        return { isConnected: !!freighter };
    }
  }
  
  // For other wallet types, use the wallet-providers abstraction
  return await checkWalletConnection(currentWalletType);
}

/**
 * Request access to the current wallet
 * Uses the currently selected wallet type
 */
export async function requestAccess(): Promise<{ address: string; error?: string }> {
  try {
    const result = await freighterRequestAccess();
    console.log('[WalletBridge] requestAccess result:', JSON.stringify(result));
    if (typeof result === 'string') return { address: result };
    if (result && typeof result === 'object') {
      const address = ((result as any).address || (result as any).publicKey || '').trim();
      return { address, error: (result as any).error };
    }
    return { address: '', error: 'Unknown error' };
  } catch (e: any) {
    return { address: '', error: e.message };
  console.log(`[WalletBridge] requestAccess called for wallet: ${currentWalletType}`);
  
  if (currentWalletType === 'freighter') {
    const freighterApi = (window as any).freighterApi;
    console.log('[WalletBridge] freighterApi on windows:', !!freighterApi);
    
    if (freighterApi?.requestAccess) {
        console.log('[WalletBridge] calling window.freighterApi.requestAccess...');
        try {
            const result = await freighterApi.requestAccess();
            console.log('[WalletBridge] window.freighterApi.requestAccess result:', JSON.stringify(result));
            // Extension usually returns string public key, library v6 returns {address}
            if (typeof result === 'string') return { address: result };
            if (result && typeof result === 'object') {
                const address = (result.address || result.publicKey || '').trim();
                return { address, error: result.error };
            }
        } catch (e: any) {
            console.warn('[WalletBridge] Error calling window.freighterApi.requestAccess:', e);
            return { address: '', error: e.message };
        }
    }

    console.log('[WalletBridge] Falling back to library requestAccess...');
    try {
        const result = await freighterRequestAccess();
        console.log('[WalletBridge] Library requestAccess result:', JSON.stringify(result));
        return { address: (result.address || '').trim(), error: result.error as any };
    } catch (e: any) {
        console.error('[WalletUtil] Library requestAccess failed:', e);
        return { address: '', error: e.message };
    }
  }
  
  // For other wallet types, use the wallet-providers abstraction
  return await connectWallet(currentWalletType);
}

/**
 * Sign a transaction with the current wallet
 * Uses the currently selected wallet type
 */
export async function signTransaction(xdr: string, network?: string): Promise<{ signedTxXdr: string; error?: string }> {
  try {
    const result = await freighterSignTransaction(xdr, { networkPassphrase: network });
    return { signedTxXdr: result.signedTxXdr, error: (result as any).error };
  } catch (e: any) {
    return { signedTxXdr: '', error: e.message };
  console.log(`[WalletBridge] signTransaction called for wallet: ${currentWalletType}`);
  
  if (currentWalletType === 'freighter') {
    const freighterApi = (window as any).freighterApi;
    
    if (freighterApi?.signTransaction && typeof freighterApi.signTransaction === 'function') {
        try {
            const result = await freighterApi.signTransaction(xdr, network);
            if (typeof result === 'string') return { signedTxXdr: result };
            return result;
        } catch (e: any) {
            console.warn('[WalletUtil] Error calling window.freighterApi.signTransaction:', e);
            return { signedTxXdr: '', error: e.message };
        }
    }

    // Fallback to library
    try {
        const result = await freighterSignTransaction(xdr, { networkPassphrase: network });
        return { signedTxXdr: result.signedTxXdr, error: result.error as any };
    } catch (e: any) {
        console.error('[WalletUtil] Library signTransaction failed:', e);
        return { signedTxXdr: '', error: e.message };
    }
  }
  
  // For other wallet types, use the wallet-providers abstraction
  return await signWithWallet(currentWalletType, xdr, network);
}

/**
 * Legacy functions for backward compatibility
 * These maintain the original Freighter-only behavior
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

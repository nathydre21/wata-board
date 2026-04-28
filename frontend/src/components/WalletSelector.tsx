import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { getAvailableWallets, connectWallet, type WalletType, type WalletProvider } from '../utils/wallet-providers';
import { LoadingSpinner } from './LoadingSpinner';

interface WalletSelectorProps {
  onWalletConnected?: (address: string, walletType: WalletType) => void;
  onWalletError?: (error: string) => void;
  className?: string;
  showLabel?: boolean;
}

export const WalletSelector: React.FC<WalletSelectorProps> = ({
  onWalletConnected,
  onWalletError,
  className = '',
  showLabel = true
}) => {
  const { t } = useTranslation();
  const [availableWallets, setAvailableWallets] = useState<WalletProvider[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedWallet, setSelectedWallet] = useState<WalletType | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectedAddress, setConnectedAddress] = useState<string | null>(null);

  useEffect(() => {
    loadAvailableWallets();
  }, []);

  const loadAvailableWallets = async () => {
    try {
      setIsLoading(true);
      const wallets = await getAvailableWallets();
      setAvailableWallets(wallets);
      
      // Default to first available wallet
      if (wallets.length > 0) {
        setSelectedWallet(wallets[0].type);
      }
    } catch (error) {
      console.error('Failed to load available wallets:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleConnect = async () => {
    if (!selectedWallet) {
      onWalletError?.(t('common.error'));
      return;
    }

    setIsConnecting(true);
    try {
      const result = await connectWallet(selectedWallet);
      if (result.error) {
        onWalletError?.(result.error);
      } else if (result.address) {
        setConnectedAddress(result.address);
        onWalletConnected?.(result.address, selectedWallet);
      }
    } catch (error: any) {
      onWalletError?.(error.message || t('wallet.selector.connect'));
    } finally {
      setIsConnecting(false);
    }
  };

  const handleWalletSelect = (walletType: WalletType) => {
    setSelectedWallet(walletType);
    // Reset connected address when changing wallet selection
    if (connectedAddress) {
      setConnectedAddress(null);
    }
  };

  if (isLoading) {
    return (
      <div className={`flex items-center justify-center p-4 ${className}`}>
        <LoadingSpinner size="sm" />
        <span className="ml-2 text-sm text-slate-400">{t('wallet.selector.detectingWallets')}</span>
      </div>
    );
  }

  if (availableWallets.length === 0) {
    return (
      <div className={`rounded-xl border border-amber-800/50 bg-amber-950/20 p-4 ${className}`}>
        <div className="text-sm text-amber-300">{t('wallet.selector.noWalletsDetected')}</div>
        <p className="mt-1 text-xs text-amber-400/80">
          {t('wallet.selector.installWalletMessage')}
        </p>
      </div>
    );
  }

  return (
    <div className={`space-y-3 ${className}`}>
      {showLabel && (
        <div className="text-sm font-medium text-slate-300">{t('wallet.selector.selectWallet')}</div>
      )}
      
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {availableWallets.map((wallet) => (
          <button
            key={wallet.type}
            type="button"
            onClick={() => handleWalletSelect(wallet.type)}
            className={`
              flex flex-col items-center justify-center rounded-lg border p-3 transition-all
              ${selectedWallet === wallet.type 
                ? 'border-sky-500 bg-sky-900/20 text-sky-300' 
                : 'border-slate-700 bg-slate-900/40 text-slate-300 hover:border-slate-500 hover:bg-slate-800/40'
              }
              disabled:opacity-50 disabled:cursor-not-allowed
            `}
            disabled={isConnecting}
          >
            <div className="text-lg mb-1">{wallet.icon}</div>
            <div className="text-xs font-medium">{wallet.name}</div>
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <div className="text-xs text-slate-400">
          {connectedAddress ? (
            <span className="text-green-400">{t('wallet.selector.connected', { address: `${connectedAddress.slice(0, 8)}...${connectedAddress.slice(-4)}` })}</span>
          ) : (
            t('wallet.selector.selectAndConnect')
          )}
        </div>
        
        <button
          type="button"
          onClick={handleConnect}
          disabled={!selectedWallet || isConnecting}
          className="
            rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white
            hover:bg-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2
            disabled:opacity-50 disabled:cursor-not-allowed
            transition-colors
          "
        >
          {isConnecting ? (
            <>
              <LoadingSpinner size="sm" className="mr-2 inline" />
              {t('wallet.selector.connecting')}
            </>
          ) : connectedAddress ? (
            t('wallet.selector.reconnect')
          ) : (
            t('wallet.selector.connect')
          )}
        </button>
      </div>

      {availableWallets.length === 1 && (
        <div className="rounded border border-slate-700 bg-slate-900/30 p-2">
          <p className="text-xs text-slate-400">
            {t('wallet.selector.onlyOneDetected', { name: availableWallets[0].name })}
          </p>
        </div>
      )}
    </div>
  );
};
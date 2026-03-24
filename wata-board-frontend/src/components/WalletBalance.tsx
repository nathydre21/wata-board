import React from 'react';
import { useWalletBalance } from '../hooks/useWalletBalance';
import { balanceUtils } from '../services/walletBalance';

interface WalletBalanceProps {
  showDetails?: boolean;
  showRefreshButton?: boolean;
  className?: string;
}

export const WalletBalance: React.FC<WalletBalanceProps> = ({
  showDetails = false,
  showRefreshButton = true,
  className = ''
}) => {
  const {
    balance,
    isLoading,
    error,
    isConnected,
    isLowBalance,
    lastUpdated,
    refreshBalance
  } = useWalletBalance();

  if (!isConnected) {
    return (
      <div className={`rounded-xl border border-slate-800 bg-slate-950/40 p-4 ${className}`}>
        <div className="text-sm text-slate-400">Wallet not connected</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`rounded-xl border border-red-800/50 bg-red-950/20 p-4 ${className}`}>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium text-red-400">Balance Error</div>
            <div className="text-xs text-red-300 mt-1">{error}</div>
          </div>
          {showRefreshButton && (
            <button
              onClick={refreshBalance}
              className="px-3 py-1 text-xs bg-red-500/20 text-red-300 rounded-lg hover:bg-red-500/30 transition-colors"
            >
              Retry
            </button>
          )}
        </div>
      </div>
    );
  }

  if (isLoading || !balance) {
    return (
      <div className={`rounded-xl border border-slate-800 bg-slate-950/40 p-4 ${className}`}>
        <div className="flex items-center space-x-3">
          <div className="animate-spin rounded-full h-4 w-4 border-2 border-slate-600 border-t-sky-500"></div>
          <div className="text-sm text-slate-400">Loading balance...</div>
        </div>
      </div>
    );
  }

  const xlmBalance = balance.balances.find(b => b.isNative);
  const balanceStatusColor = balanceUtils.getBalanceStatusColor(balance);
  const balanceStatusText = balanceUtils.getBalanceStatusText(balance);

  return (
    <div className={`rounded-xl border border-slate-800 bg-slate-950/40 p-4 ${className}`}>
      {/* Main Balance Display */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1">
            Wallet Balance
          </div>
          <div className={`text-lg font-semibold ${balanceStatusColor}`}>
            {xlmBalance ? balanceUtils.formatXLM(xlmBalance.balance) : '0 XLM'}
          </div>
          <div className={`text-xs ${balanceStatusColor} mt-1`}>
            {balanceStatusText}
            {isLowBalance && (
              <span className="ml-2 text-amber-400">⚠️ Low Balance</span>
            )}
          </div>
        </div>
        
        {showRefreshButton && (
          <button
            onClick={refreshBalance}
            disabled={isLoading}
            className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors disabled:opacity-50"
            title="Refresh balance"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        )}
      </div>

      {/* Low Balance Warning */}
      {isLowBalance && (
        <div className="mb-3 p-2 bg-amber-500/10 border border-amber-500/20 rounded-lg">
          <div className="text-xs text-amber-300">
            ⚠️ Low balance detected. You may need additional XLM for transaction fees.
          </div>
        </div>
      )}

      {/* Last Updated */}
      {lastUpdated && (
        <div className="text-xs text-slate-500 mb-3">
          Last updated: {lastUpdated.toLocaleTimeString()}
        </div>
      )}

      {/* Detailed Balance Information */}
      {showDetails && (
        <div className="space-y-2 pt-3 border-t border-slate-800">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">
            All Balances
          </div>
          {balance.balances.map((assetBalance, index) => (
            <div key={index} className="flex items-center justify-between text-sm">
              <div className="flex items-center space-x-2">
                <div className={`w-2 h-2 rounded-full ${
                  assetBalance.isNative ? 'bg-sky-500' : 'bg-purple-500'
                }`}></div>
                <span className="text-slate-300">
                  {balanceUtils.getAssetDisplayName(assetBalance)}
                </span>
              </div>
              <span className="text-slate-100 font-medium">
                {balanceUtils.formatBalance(assetBalance.balance)}
              </span>
            </div>
          ))}
          
          {/* Network Info */}
          <div className="pt-2 mt-2 border-t border-slate-800">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400">Network:</span>
              <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                balance.network === 'mainnet' 
                  ? 'bg-orange-500/10 text-orange-300' 
                  : 'bg-sky-500/10 text-sky-300'
              }`}>
                {balance.network.toUpperCase()}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs mt-1">
              <span className="text-slate-400">Address:</span>
              <span className="text-slate-300 font-mono">
                {balance.publicKey.slice(0, 8)}...{balance.publicKey.slice(-8)}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Compact version for navigation/header
export const WalletBalanceCompact: React.FC<{ className?: string }> = ({ className = '' }) => {
  const { balance, isLoading, isConnected, isLowBalance } = useWalletBalance();

  if (!isConnected || isLoading || !balance) {
    return (
      <div className={`flex items-center space-x-2 ${className}`}>
        <div className="animate-spin rounded-full h-3 w-3 border border-slate-600 border-t-sky-500"></div>
        <span className="text-xs text-slate-400">Loading...</span>
      </div>
    );
  }

  const xlmBalance = balance.balances.find(b => b.isNative);
  const balanceColor = isLowBalance ? 'text-amber-400' : 'text-slate-200';

  return (
    <div className={`flex items-center space-x-2 ${className}`}>
      <span className={`text-sm font-medium ${balanceColor}`}>
        {xlmBalance ? balanceUtils.formatXLM(xlmBalance.balance, 3) : '0 XLM'}
      </span>
      {isLowBalance && (
        <span className="text-amber-400" title="Low balance">⚠️</span>
      )}
    </div>
  );
};

// Balance indicator with status dot
export const BalanceIndicator: React.FC<{ className?: string }> = ({ className = '' }) => {
  const { balance, isLoading, isConnected, isLowBalance } = useWalletBalance();

  if (!isConnected) {
    return (
      <div className={`flex items-center space-x-2 ${className}`}>
        <div className="w-2 h-2 rounded-full bg-slate-500"></div>
        <span className="text-xs text-slate-400">Not Connected</span>
      </div>
    );
  }

  if (isLoading || !balance) {
    return (
      <div className={`flex items-center space-x-2 ${className}`}>
        <div className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse"></div>
        <span className="text-xs text-slate-400">Loading</span>
      </div>
    );
  }

  const statusColor = isLowBalance ? 'bg-amber-500' : 'bg-green-500';
  const statusText = isLowBalance ? 'Low' : 'Good';

  return (
    <div className={`flex items-center space-x-2 ${className}`}>
      <div className={`w-2 h-2 rounded-full ${statusColor}`}></div>
      <span className="text-xs text-slate-300">{statusText}</span>
    </div>
  );
};

export default WalletBalance;

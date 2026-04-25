/**
 * CurrencySelector Component (#94)
 *
 * Drop-in component that lets the user pick a payment currency
 * and see the live XLM conversion with fee transparency.
 */

import React, { useEffect } from 'react';
import { useCurrencyConversion } from '../hooks/useCurrencyConversion';
import type { SupportedCurrency } from '../services/currencyService';

const CURRENCY_LABELS: Record<string, string> = {
  XLM: 'Stellar Lumens (XLM)',
  BTC: 'Bitcoin (BTC)',
  ETH: 'Ethereum (ETH)',
  USDC: 'USD Coin (USDC)',
  USDT: 'Tether (USDT)',
};

interface CurrencySelectorProps {
  amount: number;
  onConversionUpdate?: (xlmAmount: number, fee: number) => void;
}

const CurrencySelector: React.FC<CurrencySelectorProps> = ({
  amount,
  onConversionUpdate,
}) => {
  const {
    currencies,
    selectedCurrency,
    setSelectedCurrency,
    estimate,
    estimateConversion,
    rate,
    loading,
    error,
  } = useCurrencyConversion();

  // Re-estimate whenever amount or currency changes
  useEffect(() => {
    if (amount > 0) {
      estimateConversion(amount);
    }
  }, [amount, estimateConversion]);

  // Notify parent of conversion results
  useEffect(() => {
    if (estimate && onConversionUpdate) {
      onConversionUpdate(estimate.toAmount, estimate.fee);
    }
  }, [estimate, onConversionUpdate]);

  return (
    <div className="space-y-3">
      {/* Selector */}
      <div>
        <label className="block text-sm font-medium mb-1">
          Payment Currency
        </label>
        <select
          value={selectedCurrency}
          onChange={(e) =>
            setSelectedCurrency(e.target.value as SupportedCurrency)
          }
          className="w-full p-2 border rounded"
          disabled={loading}
        >
          {currencies.map((c) => (
            <option key={c} value={c}>
              {CURRENCY_LABELS[c] || c}
            </option>
          ))}
        </select>
      </div>

      {/* Conversion detail */}
      {selectedCurrency !== 'XLM' && rate && (
        <div className="text-sm bg-gray-50 p-3 rounded">
          <div className="flex justify-between">
            <span>Exchange Rate:</span>
            <span className="font-mono">
              1 {selectedCurrency} = {rate.rate.toFixed(4)} XLM
            </span>
          </div>
          {estimate && (
            <>
              <div className="flex justify-between mt-1">
                <span>You pay:</span>
                <span className="font-mono">
                  {estimate.fromAmount} {selectedCurrency}
                </span>
              </div>
              <div className="flex justify-between mt-1">
                <span>Conversion fee ({estimate.feePercentage}%):</span>
                <span className="font-mono">
                  {estimate.fee.toFixed(7)} XLM
                </span>
              </div>
              <div className="flex justify-between mt-1 font-semibold">
                <span>Settlement amount:</span>
                <span className="font-mono">
                  {estimate.toAmount.toFixed(7)} XLM
                </span>
              </div>
            </>
          )}
        </div>
      )}

      {loading && (
        <div className="text-sm text-gray-500">Fetching rates…</div>
      )}
      {error && <div className="text-sm text-red-500">{error}</div>}
    </div>
  );
};

export default CurrencySelector;

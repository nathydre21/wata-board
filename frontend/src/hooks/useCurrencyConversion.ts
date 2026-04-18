/**
 * useCurrencyConversion Hook (#94)
 *
 * Provides React state for the selected currency, live exchange rate,
 * and conversion estimates.  Automatically refreshes the rate when
 * the selected currency changes.
 */

import { useState, useEffect, useCallback } from 'react';
import { currencyService } from '../services/currencyService';
import type {
  SupportedCurrency,
  ConversionEstimate,
  ExchangeRate,
} from '../services/currencyService';

export function useCurrencyConversion() {
  const [currencies, setCurrencies] = useState<SupportedCurrency[]>([]);
  const [selectedCurrency, setSelectedCurrency] =
    useState<SupportedCurrency>('XLM');
  const [estimate, setEstimate] = useState<ConversionEstimate | null>(null);
  const [rate, setRate] = useState<ExchangeRate | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load supported currencies on mount
  useEffect(() => {
    currencyService
      .getSupportedCurrencies()
      .then(setCurrencies)
      .catch((err) => setError(err.message));
  }, []);

  // Fetch rate whenever the selected currency changes
  useEffect(() => {
    if (selectedCurrency === 'XLM') {
      setRate({ from: 'XLM', to: 'XLM', rate: 1, timestamp: Date.now() });
      return;
    }
    setLoading(true);
    currencyService
      .getExchangeRate(selectedCurrency, 'XLM')
      .then((r) => {
        setRate(r);
        setError(null);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [selectedCurrency]);

  /** Request a conversion estimate for a given amount. */
  const estimateConversion = useCallback(
    async (amount: number) => {
      if (amount <= 0) {
        setEstimate(null);
        return;
      }
      setLoading(true);
      try {
        const est = await currencyService.estimateConversion(
          amount,
          selectedCurrency,
        );
        setEstimate(est);
        setError(null);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    },
    [selectedCurrency],
  );

  return {
    currencies,
    selectedCurrency,
    setSelectedCurrency,
    estimate,
    estimateConversion,
    rate,
    loading,
    error,
  };
}

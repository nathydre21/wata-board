/**
 * Currency Service — Frontend (#94)
 *
 * Thin API client for the backend currency endpoints.
 */

export type SupportedCurrency = 'XLM' | 'BTC' | 'ETH' | 'USDC' | 'USDT';

export interface ExchangeRate {
  from: string;
  to: string;
  rate: number;
  timestamp: number;
}

export interface ConversionEstimate {
  fromCurrency: string;
  toCurrency: string;
  fromAmount: number;
  toAmount: number;
  rate: number;
  fee: number;
  feePercentage: number;
  timestamp: number;
}

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export const currencyService = {
  async getSupportedCurrencies(): Promise<SupportedCurrency[]> {
    const res = await fetch(`${API_BASE}/api/currency/supported`);
    if (!res.ok) throw new Error('Failed to fetch currencies');
    return res.json();
  },

  async getExchangeRate(
    from: SupportedCurrency,
    to: SupportedCurrency,
  ): Promise<ExchangeRate> {
    const res = await fetch(
      `${API_BASE}/api/currency/rate?from=${from}&to=${to}`,
    );
    if (!res.ok) throw new Error('Failed to fetch exchange rate');
    return res.json();
  },

  async estimateConversion(
    amount: number,
    fromCurrency: SupportedCurrency,
  ): Promise<ConversionEstimate> {
    const res = await fetch(`${API_BASE}/api/currency/convert`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount, fromCurrency }),
    });
    if (!res.ok) throw new Error('Failed to estimate conversion');
    return res.json();
  },

  async getRateHistory(
    from: SupportedCurrency,
    to: SupportedCurrency,
    limit?: number,
  ): Promise<ExchangeRate[]> {
    const params = new URLSearchParams({ from, to });
    if (limit) params.set('limit', String(limit));
    const res = await fetch(`${API_BASE}/api/currency/history?${params}`);
    if (!res.ok) throw new Error('Failed to fetch rate history');
    return res.json();
  },
};

/**
 * Currency Conversion Service — Backend (#94)
 *
 * Handles exchange-rate lookups (cached), multi-currency → XLM
 * conversion with a transparent fee, and rate history tracking.
 *
 * TODO: Replace the placeholder rate source with a real price oracle
 *       (CoinGecko, Stellar DEX, etc.) before mainnet launch.
 */

import logger from '../utils/logger';

// ── Types ──────────────────────────────────────────────────

export type SupportedCurrency = 'XLM' | 'BTC' | 'ETH' | 'USDC' | 'USDT';

export interface ExchangeRate {
  from: string;
  to: string;
  rate: number;
  timestamp: number;
}

export interface ConversionResult {
  fromCurrency: string;
  toCurrency: string;
  fromAmount: number;
  toAmount: number;
  rate: number;
  fee: number;
  feePercentage: number;
  timestamp: number;
}

// ── Constants ──────────────────────────────────────────────

const CONVERSION_FEE_PERCENT = 0.5; // 0.5 %

// ── Service ────────────────────────────────────────────────

class CurrencyConversionService {
  private rateCache: Map<string, ExchangeRate> = new Map();
  private readonly rateCacheTtlMs = 30_000; // 30 s
  private rateHistory: ExchangeRate[] = [];

  private readonly supportedCurrencies: SupportedCurrency[] = [
    'XLM',
    'BTC',
    'ETH',
    'USDC',
    'USDT',
  ];

  /** Get the live exchange rate (cache-first). */
  async getExchangeRate(
    from: SupportedCurrency,
    to: SupportedCurrency,
  ): Promise<ExchangeRate> {
    if (from === to) {
      return { from, to, rate: 1, timestamp: Date.now() };
    }

    const cacheKey = `${from}-${to}`;
    const cached = this.rateCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.rateCacheTtlMs) {
      return cached;
    }

    const rate = await this.fetchExchangeRate(from, to);
    const entry: ExchangeRate = { from, to, rate, timestamp: Date.now() };

    this.rateCache.set(cacheKey, entry);
    this.rateHistory.push(entry);
    if (this.rateHistory.length > 1000) {
      this.rateHistory = this.rateHistory.slice(-1000);
    }

    return entry;
  }

  /** Convert an amount from any supported currency to XLM. */
  async convertToXLM(
    amount: number,
    fromCurrency: SupportedCurrency,
  ): Promise<ConversionResult> {
    if (fromCurrency === 'XLM') {
      return {
        fromCurrency: 'XLM',
        toCurrency: 'XLM',
        fromAmount: amount,
        toAmount: amount,
        rate: 1,
        fee: 0,
        feePercentage: 0,
        timestamp: Date.now(),
      };
    }

    const exchangeRate = await this.getExchangeRate(fromCurrency, 'XLM');
    const grossAmount = amount * exchangeRate.rate;
    const fee = grossAmount * (CONVERSION_FEE_PERCENT / 100);
    const netAmount = grossAmount - fee;

    logger.info('Currency conversion', {
      from: fromCurrency,
      amount,
      toXLM: netAmount,
      rate: exchangeRate.rate,
      fee,
    });

    return {
      fromCurrency,
      toCurrency: 'XLM',
      fromAmount: amount,
      toAmount: Math.round(netAmount * 1e7) / 1e7, // 7-decimal precision
      rate: exchangeRate.rate,
      fee: Math.round(fee * 1e7) / 1e7,
      feePercentage: CONVERSION_FEE_PERCENT,
      timestamp: Date.now(),
    };
  }

  /** All supported currency codes. */
  getSupportedCurrencies(): SupportedCurrency[] {
    return [...this.supportedCurrencies];
  }

  /** Historical rates for a pair. */
  getRateHistory(
    from: SupportedCurrency,
    to: SupportedCurrency,
    limit: number = 50,
  ): ExchangeRate[] {
    return this.rateHistory
      .filter((r) => r.from === from && r.to === to)
      .slice(-limit);
  }

  // ── Private ──────────────────────────────────────────────

  /**
   * Placeholder rate fetcher — replace with a real price oracle.
   * Rates are expressed in USD for cross-conversion.
   */
  private async fetchExchangeRate(
    from: SupportedCurrency,
    to: SupportedCurrency,
  ): Promise<number> {
    const usdRates: Record<SupportedCurrency, number> = {
      XLM: 0.12,
      BTC: 65_000,
      ETH: 3_500,
      USDC: 1.0,
      USDT: 1.0,
    };

    const fromUsd = usdRates[from];
    const toUsd = usdRates[to];

    if (!fromUsd || !toUsd) {
      throw new Error(`Unsupported currency pair: ${from}/${to}`);
    }

    return fromUsd / toUsd;
  }
}

/** Singleton instance */
export const currencyConversionService = new CurrencyConversionService();

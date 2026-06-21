// Supported currency codes (ISO 4217)
const SUPPORTED_CURRENCIES = new Set([
  'USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'CHF', 'CNY', 'INR', 'XLM'
]);

export interface ConversionRequest {
  fromCurrency: string;
  toCurrency: string;
  amount: number;
}

export interface ConversionResult {
  success: boolean;
  fromCurrency: string;
  toCurrency: string;
  amount: number;
  convertedAmount?: number;
  error?: string;
}

export class CurrencyConversionService {
  // Validate that a currency code is supported
  private isSupportedCurrency(currency: string): boolean {
    return SUPPORTED_CURRENCIES.has(currency.toUpperCase());
  }

  // Validate that the amount is a positive number
  private isPositiveAmount(amount: number): boolean {
    return typeof amount === 'number' && amount > 0 && isFinite(amount);
  }

  // Validate a conversion request
  validateRequest(request: ConversionRequest): string[] {
    const errors: string[] = [];

    if (!request.fromCurrency) {
      errors.push('fromCurrency is required');
    } else if (!this.isSupportedCurrency(request.fromCurrency)) {
      errors.push(`fromCurrency '${request.fromCurrency}' is not supported. Supported currencies: ${Array.from(SUPPORTED_CURRENCIES).join(', ')}`);
    }

    if (!request.toCurrency) {
      errors.push('toCurrency is required');
    } else if (!this.isSupportedCurrency(request.toCurrency)) {
      errors.push(`toCurrency '${request.toCurrency}' is not supported. Supported currencies: ${Array.from(SUPPORTED_CURRENCIES).join(', ')}`);
    }

    if (request.amount === undefined || request.amount === null) {
      errors.push('amount is required');
    } else if (!this.isPositiveAmount(request.amount)) {
      errors.push('amount must be a positive, finite number');
    }

    return errors;
  }

  // Convert currency (placeholder implementation - in real app, use exchange rate API)
  async convert(request: ConversionRequest): Promise<ConversionResult> {
    const validationErrors = this.validateRequest(request);

    if (validationErrors.length > 0) {
      return {
        success: false,
        fromCurrency: request.fromCurrency,
        toCurrency: request.toCurrency,
        amount: request.amount,
        error: validationErrors.join('; ')
      };
    }

    // Placeholder conversion rate (1:1 for now)
    const conversionRate = 1;
    const convertedAmount = request.amount * conversionRate;

    return {
      success: true,
      fromCurrency: request.fromCurrency.toUpperCase(),
      toCurrency: request.toCurrency.toUpperCase(),
      amount: request.amount,
      convertedAmount
    };
  }

  // Get list of supported currencies
  getSupportedCurrencies(): string[] {
    return Array.from(SUPPORTED_CURRENCIES);
  }
}
